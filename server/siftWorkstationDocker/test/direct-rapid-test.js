// Direct Bun → websockify rapid pointer event test
// Goal: isolate whether the bug is in Bun's client WebSocket or in the proxy

console.log("=== Direct rapid pointer event test (bypasses proxy) ===")

const ws = new WebSocket("ws://localhost:6901/")
ws.binaryType = "arraybuffer"

let msgCount = 0
let stage = 0

function sendAndLog(data, label) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
  const hex = buf.slice(0, Math.min(buf.length, 32)).toString("hex")
  if (buf.length <= 20) {
    console.log(`send "${label}" len=${buf.length} hex=${hex}`)
  }
  ws.send(data)
}

ws.onopen = () => {
  console.log(`Connected, protocol: "${ws.protocol}"`)
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

  if (stage === 0) {
    stage = 1
    console.log("RFB version received, responding...")
    sendAndLog(Buffer.from("RFB 003.008\n"), "RFB version")
  } else if (stage === 1) {
    const raw = new Uint8Array(e.data)
    const numTypes = raw[0]
    const types = Array.from(raw.slice(1, 1 + numTypes))
    console.log(`Security types: [${types.join(",")}]`)
    const chosenType = types.includes(1) ? 1 : types[0]
    sendAndLog(new Uint8Array([chosenType]), `security type=${chosenType}`)
    stage = chosenType === 1 ? 2 : 10
  } else if (stage === 2) {
    stage = 3
    console.log(`Security result: ${hex}`)
    sendAndLog(new Uint8Array([1]), "ClientInit")
  } else if (stage === 10) {
    stage = 11
    sendAndLog(new Uint8Array(len).fill(0), "challenge")
  } else if (stage === 11) {
    stage = 3
    console.log(`Security result: ${hex}`)
    sendAndLog(new Uint8Array([1]), "ClientInit")
  } else if (stage === 3) {
    stage = 4
    console.log("ServerInit received, sending setup...")
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

    // Wait 3s then send rapid pointer events
    setTimeout(() => {
      console.log("=== Starting rapid pointer events (20 events, 10ms apart) ===")
      for (let i = 0; i < 20; i++) {
        setTimeout(() => {
          if (ws.readyState !== 1) {
            console.log(`Connection closed at event ${i}`)
            return
          }
          const ptr = Buffer.alloc(6)
          ptr[0] = 5; ptr[1] = 0
          ptr.writeUInt16BE(100 + i * 10, 2)
          ptr.writeUInt16BE(100 + i * 5, 4)
          sendAndLog(ptr, `PointerEvent #${i}`)
        }, i * 10)
      }
    }, 3000)
  } else if (stage >= 4) {
    if (len <= 20) {
      console.log(`recv small msg #${msgCount} len=${len} hex=${hex}`)
    }
  }
}

ws.onerror = (e) => {
  console.error("ERROR:", e?.message || e?.type || JSON.stringify(e))
}

ws.onclose = (e) => {
  console.log(`CLOSED code=${e.code} reason="${e.reason}" wasClean=${e.wasClean} msgs=${msgCount}`)
  process.exit(0)
}

setTimeout(() => {
  console.log("=== Timeout: closing ===")
  ws.close()
}, 15000)
