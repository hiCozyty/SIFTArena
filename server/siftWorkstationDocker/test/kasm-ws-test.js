// Test Bun WebSocket client directly to VNC via websockify
// Goal: confirm whether Bun ↔ websockify ↔ TigerVNC works for VNC handshake + input events

console.log("=== Test 1: Basic RFB handshake + pointer event ===")
console.log("Connecting to ws://localhost:6901/ ...")

const ws = new WebSocket("ws://localhost:6901/")
ws.binaryType = "arraybuffer"

let msgCount = 0
let stage = 0

function sendAndLog(data, label) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
  const hex = buf.slice(0, Math.min(buf.length, 32)).toString("hex")
  console.log(`send "${label}" len=${buf.length} hex=${hex}`)
  ws.send(data)
}

ws.onopen = () => {
  console.log(`Connected, protocol: "${ws.protocol}"`)
  sendAndLog(Buffer.from("RFB 003.008\n"), "RFB version")
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

  console.log(`recv #${msgCount} type=${isArrayBuf ? "ArrayBuffer" : isBuffer ? "Buffer" : isString ? "string" : typeof e.data} len=${len} hex=${hex} text=${isString ? JSON.stringify(e.data.slice(0, 50)) : "n/a"}`)

  if (stage === 0) {
    // Server RFB version received, server will send security types next
    stage = 1
    // Wait for security types from server, don't send anything yet
    console.log("Waiting for security types...")
  } else if (stage === 1) {
    // Security types list from server: first byte = count, rest = types
    const raw = isArrayBuf ? new Uint8Array(e.data) : (isBuffer ? e.data : new Uint8Array(e.data))
    const numTypes = raw[0]
    const types = Array.from(raw.slice(1, 1 + numTypes))
    console.log(`Security types: count=${numTypes} types=[${types.join(",")}]`)
    // Select first available security type (VncAuth=2 for TigerVNC)
    const chosenType = types.includes(1) ? 1 : types[0]
    const isNoneAuth = chosenType === 1
    console.log(`Selecting security type: ${chosenType} (${isNoneAuth ? "None - no auth" : "VNC auth"})`)
    sendAndLog(new Uint8Array([chosenType]), `security type=${chosenType}`)
    if (isNoneAuth) {
      // No challenge for None auth — next message will be SecurityResult
      stage = 2
    } else {
      // VNC auth — server will send challenge
      stage = 10
    }
  } else if (stage === 2) {
    // SecurityResult (should be 00000000 for OK)
    stage = 3
    const ok = hex === "00000000"
    console.log(`Security result: ${hex} — ${ok ? "OK" : "FAILED"}`)
    if (!ok) {
      console.log("WARNING: Security failed! Aborting.")
      ws.close()
      return
    }
    sendAndLog(new Uint8Array([1]), "ClientInit shared=true")
  } else if (stage === 10) {
    // VNC challenge received
    stage = 11
    console.log(`VNC challenge received (${len} bytes), sending zero response`)
    sendAndLog(new Uint8Array(len).fill(0), "challenge response (zeros)")
  } else if (stage === 11) {
    // SecurityResult after VNC auth
    stage = 3
    console.log(`Security result: ${hex} — should be 00000000 for OK`)
    if (hex !== "00000000") {
      console.log("WARNING: Security failed! Aborting.")
      ws.close()
      return
    }
    sendAndLog(new Uint8Array([1]), "ClientInit shared=true")
  } else if (stage === 3) {
    // ServerInit (framebuffer info)
    stage = 4
    console.log("ServerInit received, sending PixelFormat + Encodings + FBUR")
    // SetPixelFormat (msg 0, 20 bytes)
    const setPF = Buffer.alloc(20)
    setPF[0] = 0 // message type
    setPF[4] = 32  // bits-per-pixel
    setPF[5] = 24  // depth
    setPF[6] = 0   // big-endian
    setPF[7] = 1   // true-color
    setPF[8] = 0; setPF[9] = 255   // red-max
    setPF[10] = 0; setPF[11] = 255 // green-max
    setPF[12] = 0; setPF[13] = 255 // blue-max
    setPF[14] = 16 // red-shift
    setPF[15] = 8  // green-shift
    setPF[16] = 0  // blue-shift
    sendAndLog(setPF, "SetPixelFormat")

    // SetEncodings (msg 2)
    const enc = Buffer.alloc(4 + 2 * 4)
    enc[0] = 2 // message type
    enc.writeUInt16BE(2, 2) // count
    enc.writeInt32BE(0, 4) // raw
    enc.writeInt32BE(1, 8) // copyrect
    sendAndLog(enc, "SetEncodings (raw, copyrect)")

    // FramebufferUpdateRequest (msg 3, 10 bytes)
    const fbur = Buffer.alloc(10)
    fbur[0] = 3  // message type
    fbur[1] = 0  // incremental
    fbur.writeUInt16BE(0, 2)  // x
    fbur.writeUInt16BE(0, 4)  // y
    fbur.writeUInt16BE(800, 6) // width
    fbur.writeUInt16BE(600, 8) // height
    sendAndLog(fbur, "FramebufferUpdateRequest")
  } else if (stage >= 4) {
    // We should be receiving framebuffer updates
    console.log(`FB update or other data (stage ${stage})`)
  }
}

ws.onerror = (e) => {
  console.error("ERROR event:", e?.message || e?.type || JSON.stringify(e))
}

ws.onclose = (e) => {
  console.log(`CLOSED code=${e.code} reason="${e.reason}" wasClean=${e.wasClean}`)
  console.log(`Total messages received: ${msgCount}`)
  process.exit(0)
}

// After 2 seconds, send a pointer event to test mouse input
setTimeout(() => {
  if (ws.readyState === 1) {
    const ptr = Buffer.alloc(6)
    ptr[0] = 5  // pointer event
    ptr[1] = 0  // button mask
    ptr.writeUInt16BE(200, 2) // x
    ptr.writeUInt16BE(150, 4) // y
    sendAndLog(ptr, "PointerEvent (200,150)")
    console.log("Waiting 2s to see if connection survives...")
  } else {
    console.log(`Cannot send PointerEvent: readyState=${ws.readyState}`)
  }
}, 2000)

// Timeout after 10s
setTimeout(() => {
  console.log("=== Timeout: closing ===")
  ws.close()
}, 10000)
