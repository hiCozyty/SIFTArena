// Rate threshold test: find max pointer event rate VNC tolerates
// Usage: bun run proxy-rate-test.js <interval_ms>

const BUN_PORT = 8011
const INTERVAL = parseInt(process.argv[2] || "50")

console.log(`=== Rate test: ${INTERVAL}ms interval, 15 events ===`)
console.log(`Connecting to ws://localhost:${BUN_PORT}/docker-vnc/sift ...`)

const ws = new WebSocket(`ws://localhost:${BUN_PORT}/docker-vnc/sift`, {
  headers: { "Sec-WebSocket-Protocol": "binary" }
})
ws.binaryType = "arraybuffer"

let msgCount = 0
let stage = 0
let handshakeStarted = false
let eventsSent = 0
let connected = true

function sendAndLog(data, label) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
  ws.send(data)
  return buf
}

ws.onopen = () => {
  console.log(`Connected, waiting for VNC server...`)
}

ws.onmessage = (e) => {
  msgCount++
  const isArrayBuf = e.data instanceof ArrayBuffer
  const len = isArrayBuf ? e.data.byteLength : (typeof e.data === "string" ? e.data.length : (e.data?.length ?? "?"))
  let hex = "?"
  try {
    const raw = isArrayBuf ? new Uint8Array(e.data) : (Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data))
    hex = raw.slice(0, Math.min(raw.length, 8)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "")
  } catch {}

  if (!handshakeStarted && hex.startsWith("524642")) {
    handshakeStarted = true
    stage = 1
    sendAndLog(Buffer.from("RFB 003.008\n"), "RFB version")
    return
  }

  if (stage === 1) {
    const raw = new Uint8Array(e.data)
    const numTypes = raw[0]
    const types = Array.from(raw.slice(1, 1 + numTypes))
    const chosenType = types.includes(1) ? 1 : types[0]
    sendAndLog(new Uint8Array([chosenType]), `security`)
    stage = chosenType === 1 ? 2 : 10
  } else if (stage === 2 || stage === 11) {
    stage = 3
    sendAndLog(new Uint8Array([1]), "ClientInit")
  } else if (stage === 10) {
    stage = 11
    sendAndLog(new Uint8Array(len).fill(0), "challenge")
  } else if (stage === 3) {
    stage = 4
    const setPF = Buffer.alloc(20)
    setPF[0] = 0
    setPF[4] = 32; setPF[5] = 24
    setPF[6] = 0; setPF[7] = 1
    setPF[8] = 0; setPF[9] = 255
    setPF[10] = 0; setPF[11] = 255
    setPF[12] = 0; setPF[13] = 255
    setPF[14] = 16; setPF[15] = 8; setPF[16] = 0
    sendAndLog(setPF, "SetPixelFormat")

    const enc = Buffer.alloc(12)
    enc[0] = 2
    enc.writeUInt16BE(2, 2)
    enc.writeInt32BE(0, 4)
    enc.writeInt32BE(1, 8)
    sendAndLog(enc, "SetEncodings")

    const fbur = Buffer.alloc(10)
    fbur[0] = 3; fbur[1] = 0
    fbur.writeUInt16BE(0, 2); fbur.writeUInt16BE(0, 4)
    fbur.writeUInt16BE(800, 6); fbur.writeUInt16BE(600, 8)
    sendAndLog(fbur, "FBUR")

    // Start sending pointer events at the specified interval
    setTimeout(() => {
      console.log(`Starting ${15} PointerEvents at ${INTERVAL}ms interval`)
      for (let i = 0; i < 15; i++) {
        setTimeout(() => {
          if (!connected) return
          const ptr = Buffer.alloc(6)
          ptr[0] = 5; ptr[1] = 0
          ptr.writeUInt16BE(100 + i * 10, 2)
          ptr.writeUInt16BE(100 + i * 5, 4)
          ws.send(ptr)
          eventsSent++
        }, i * INTERVAL)
      }
    }, 500)
  }
}

ws.onerror = (e) => {
  console.error("ERROR:", e?.message || e?.type || JSON.stringify(e))
}

ws.onclose = (e) => {
  connected = false
  console.log(`RESULT: interval=${INTERVAL}ms events_sent=${eventsSent} msgs=${msgCount} code=${e.code} reason="${e.reason}" clean=${e.wasClean}`)
  process.exit(0)
}

setTimeout(() => {
  console.log("=== Timeout (connection survived!) ===")
  ws.close()
}, 15000)
