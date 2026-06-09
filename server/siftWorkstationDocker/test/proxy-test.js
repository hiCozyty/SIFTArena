// Test Bun client → Bun server proxy → VNC
// Goal: reproduce the full production flow to isolate the disconnect bug

const BUN_PORT = 8011

console.log("=== Full proxy flow test ===")
console.log(`Connecting to ws://localhost:${BUN_PORT}/docker-vnc/sift ...`)

const ws = new WebSocket(`ws://localhost:${BUN_PORT}/docker-vnc/sift`)
ws.binaryType = "arraybuffer"

let msgCount = 0
let stage = 0
let handshakeStarted = false

function sendAndLog(data, label) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
  const hex = buf.slice(0, Math.min(buf.length, 32)).toString("hex")
  console.log(`send "${label}" len=${buf.length} hex=${hex}`)
  ws.send(data)
}

ws.onopen = () => {
  console.log(`Connected to proxy, waiting for VNC server to send RFB version...`)
  // Don't send anything; wait for VNC server to send version first
}

ws.onmessage = (e) => {
  msgCount++
  const isArrayBuf = e.data instanceof ArrayBuffer
  const isBuffer = Buffer.isBuffer(e.data)
  const isString = typeof e.data === "string"
  const len = isArrayBuf ? e.data.byteLength : (isString ? e.data.length : (e.data?.length ?? "?"))
  let hex = "?"
  try {
    const raw = isArrayBuf ? new Uint8Array(e.data) : (isBuffer ? e.data : Buffer.from(e.data))
    hex = raw.slice(0, Math.min(raw.length, 32)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "")
  } catch {}

  const ctor = e.data?.constructor?.name || "?"
  console.log(`recv #${msgCount} ctor=${ctor} len=${len} hex=${hex} text=${isString ? JSON.stringify(e.data.slice(0, 50)) : "n/a"}`)

  if (!handshakeStarted && hex.startsWith("524642")) {
    // VNC server sent RFB version "RFB 003.008\n"
    handshakeStarted = true
    stage = 1 // Next message will be security types
    console.log("VNC RFB version received, starting handshake")
    sendAndLog(Buffer.from("RFB 003.008\n"), "RFB version")
    return
  }

  if (stage === 1) {
    // Security types list
    const raw = new Uint8Array(e.data)
    const numTypes = raw[0]
    const types = Array.from(raw.slice(1, 1 + numTypes))
    console.log(`Security types: count=${numTypes} types=[${types.join(",")}]`)
    const chosenType = types.includes(1) ? 1 : types[0]
    const isNoneAuth = chosenType === 1
    console.log(`Selecting: ${chosenType} (${isNoneAuth ? "None" : "VNC"})`)
    sendAndLog(new Uint8Array([chosenType]), `security type=${chosenType}`)
    stage = isNoneAuth ? 2 : 10
  } else if (stage === 2) {
    stage = 3
    console.log(`Security result: ${hex}`)
    sendAndLog(new Uint8Array([1]), "ClientInit")
  } else if (stage === 10) {
    stage = 11
    console.log(`VNC challenge (${len} bytes)`)
    sendAndLog(new Uint8Array(len).fill(0), "challenge zeros")
  } else if (stage === 11) {
    stage = 3
    console.log(`Security result: ${hex}`)
    sendAndLog(new Uint8Array([1]), "ClientInit")
  } else if (stage === 3) {
    stage = 4
    console.log("ServerInit received, sending PixelFormat + Encodings + FBUR")
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
  } else if (stage >= 4) {
    if (len > 100) {
      console.log(`FB update #${stage - 3} (${len} bytes)`)
    } else {
      console.log(`Data (stage ${stage}, len=${len}, hex=${hex})`)
    }
  }
}

ws.onerror = (e) => {
  console.error("ERROR:", e?.message || e?.type || JSON.stringify(e))
}

ws.onclose = (e) => {
  console.log(`CLOSED code=${e.code} reason="${e.reason}" wasClean=${e.wasClean}`)
  console.log(`Total messages received: ${msgCount}`)
  process.exit(0)
}

// Send pointer events
setTimeout(() => {
  if (ws.readyState === 1 && stage >= 4) {
    const ptr = Buffer.alloc(6)
    ptr[0] = 5; ptr[1] = 0
    ptr.writeUInt16BE(200, 2)
    ptr.writeUInt16BE(150, 4)
    sendAndLog(ptr, "PointerEvent #1 (200,150)")
  } else {
    console.log(`Cannot send PointerEvent: readyState=${ws.readyState} stage=${stage}`)
  }
}, 3000)

setTimeout(() => {
  if (ws.readyState === 1) {
    const ptr2 = Buffer.alloc(6)
    ptr2[0] = 5; ptr2[1] = 0
    ptr2.writeUInt16BE(300, 2)
    ptr2.writeUInt16BE(250, 4)
    sendAndLog(ptr2, "PointerEvent #2 (300,250)")
  } else {
    console.log(`Cannot send PointerEvent #2: readyState=${ws.readyState}`)
  }
}, 5000)

setTimeout(() => {
  console.log("=== Timeout: closing ===")
  ws.close()
}, 15000)
