import tls from "node:tls"

// ── RDCleanPath ASN.1 DER Constants ──
const VERSION_1 = 3390 // 3389 + 1

const TAG_SEQUENCE = 0x30
const TAG_INTEGER = 0x02
const TAG_OCTET_STRING = 0x04
const TAG_UTF8STRING = 0x0c
const TAG_CTX = (n) => 0xa0 + n

// ── ASN.1 DER Encoding ──

function derEncodeLength(length) {
  if (length < 0x80) return new Uint8Array([length])
  const bytes = []
  let temp = length
  while (temp > 0) {
    bytes.unshift(temp & 0xff)
    temp >>= 8
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes])
}

function derWrap(tag, content) {
  const len = derEncodeLength(content.length)
  return new Uint8Array([tag, ...len, ...content])
}

function derEncodeInteger(value) {
  if (value === 0) return derWrap(TAG_INTEGER, new Uint8Array([0]))
  const bytes = []
  let temp = value
  while (temp > 0) {
    bytes.unshift(temp & 0xff)
    temp >>= 8
  }
  if (bytes[0] & 0x80) bytes.unshift(0)
  return derWrap(TAG_INTEGER, new Uint8Array(bytes))
}

function derEncodeUtf8String(str) {
  return derWrap(TAG_UTF8STRING, new TextEncoder().encode(str))
}

function derEncodeOctetString(buf) {
  return derWrap(TAG_OCTET_STRING, new Uint8Array(buf))
}

function derWrapContext(tagNum, content) {
  return derWrap(TAG_CTX(tagNum), content)
}

function derDecodeLength(buf, offset) {
  const first = buf[offset]
  if (first < 0x80) return { length: first, bytesRead: 1 }
  const numBytes = first & 0x7f
  let length = 0
  for (let i = 0; i < numBytes; i++) {
    length = (length << 8) | buf[offset + 1 + i]
  }
  return { length, bytesRead: 1 + numBytes }
}

function derDecodeTLV(buf, offset) {
  const tag = buf[offset]
  const { length, bytesRead } = derDecodeLength(buf, offset + 1)
  const headerLen = 1 + bytesRead
  const value = buf.slice(offset + headerLen, offset + headerLen + length)
  return { tag, value, totalLength: headerLen + length }
}

function derDecodeInteger(buf) {
  let val = 0
  for (let i = 0; i < buf.length; i++) val = (val << 8) | buf[i]
  return val
}

function derDecodeChildren(buf) {
  const children = []
  let offset = 0
  while (offset < buf.length) {
    const tlv = derDecodeTLV(buf, offset)
    children.push(tlv)
    offset += tlv.totalLength
  }
  return children
}

// ── RDCleanPath PDU Parsing ──

function parseRDCleanPathRequest(data) {
  const buf = new Uint8Array(data)
  const outer = derDecodeTLV(buf, 0)
  if (outer.tag !== TAG_SEQUENCE)
    throw new Error(`Expected SEQUENCE (0x30), got 0x${outer.tag.toString(16)}`)

  const children = derDecodeChildren(outer.value)
  let version = null
  let destination = null
  let proxyAuth = null
  let x224ConnectionRequest = null
  let preconnectionBlob = null

  for (const child of children) {
    const ctxTag = child.tag & 0x1f
    switch (ctxTag) {
      case 0: {
        const intTlv = derDecodeTLV(child.value, 0)
        version = derDecodeInteger(intTlv.value)
        break
      }
      case 2: {
        const strTlv = derDecodeTLV(child.value, 0)
        destination = new TextDecoder().decode(strTlv.value)
        break
      }
      case 3: {
        const strTlv = derDecodeTLV(child.value, 0)
        proxyAuth = new TextDecoder().decode(strTlv.value)
        break
      }
      case 5: {
        const strTlv = derDecodeTLV(child.value, 0)
        preconnectionBlob = new TextDecoder().decode(strTlv.value)
        break
      }
      case 6: {
        const octTlv = derDecodeTLV(child.value, 0)
        x224ConnectionRequest = octTlv.value
        break
      }
    }
  }

  if (version !== VERSION_1)
    throw new Error(`Unsupported RDCleanPath version: ${version} (expected ${VERSION_1})`)
  if (!destination) throw new Error("Missing destination in RDCleanPath request")
  if (!x224ConnectionRequest) throw new Error("Missing x224_connection_pdu in RDCleanPath request")

  return { destination, proxyAuth, x224ConnectionRequest, preconnectionBlob }
}

function buildRDCleanPathResponse(serverAddr, x224Response, certChain) {
  const parts = []
  parts.push(derWrapContext(0, derEncodeInteger(VERSION_1)))
  parts.push(derWrapContext(6, derEncodeOctetString(x224Response)))

  const certOctets = certChain.map((cert) => derEncodeOctetString(cert))
  const certSeq = derWrap(TAG_SEQUENCE, new Uint8Array(certOctets.flatMap((c) => [...c])))
  parts.push(derWrapContext(7, certSeq))
  parts.push(derWrapContext(9, derEncodeUtf8String(serverAddr)))

  return derWrap(TAG_SEQUENCE, new Uint8Array(parts.flatMap((p) => [...p])))
}

function buildRDCleanPathError(errorCode, httpStatusCode) {
  const errParts = []
  errParts.push(derWrapContext(0, derEncodeInteger(errorCode)))
  if (httpStatusCode != null) errParts.push(derWrapContext(1, derEncodeInteger(httpStatusCode)))
  const errSeq = derWrap(TAG_SEQUENCE, new Uint8Array(errParts.flatMap((p) => [...p])))

  const parts = []
  parts.push(derWrapContext(0, derEncodeInteger(VERSION_1)))
  parts.push(derWrapContext(1, errSeq))
  return derWrap(TAG_SEQUENCE, new Uint8Array(parts.flatMap((p) => [...p])))
}

// ── Destination Parsing ──

function parseDestination(destination) {
  if (destination.startsWith("[")) {
    const bracketEnd = destination.indexOf("]")
    if (bracketEnd === -1) throw new Error(`Invalid IPv6 destination: ${destination}`)
    const host = destination.slice(1, bracketEnd)
    const rest = destination.slice(bracketEnd + 1)
    const port = rest.startsWith(":") ? parseInt(rest.slice(1), 10) : 3389
    return { host, port }
  }
  const lastColon = destination.lastIndexOf(":")
  if (lastColon === -1) return { host: destination, port: 3389 }
  const host = destination.slice(0, lastColon)
  const port = parseInt(destination.slice(lastColon + 1), 10)
  return { host, port: isNaN(port) ? 3389 : port }
}

// ── RDP Handshake ──

function performRDPHandshake(host, port, x224Request) {
  return new Promise((resolve, reject) => {
    const log = `[${host}:${port}]`
    const timeout = setTimeout(() => {
      tcpSocket.destroy()
      reject(new Error("Connection timed out"))
    }, 15000)

    const tcpSocket = new tls.TLSSocket(undefined, {
      socket: undefined,
      rejectUnauthorized: false,
      servername: host,
    })

    // Step 1: TCP connect
    const conn = Bun.connect({
      hostname: host,
      port,
      socket: {
        data(tcp, data) {
          // First data: X.224 Connection Confirm
          tcp.removeAllListeners?.("data")
          const x224Response = new Uint8Array(data)

          // Step 4: TLS handshake
          const tlsSocket = tls.connect({
            socket: tcp,
            servername: host,
            rejectUnauthorized: false,
          })

          tlsSocket.on("secureConnect", () => {
            clearTimeout(timeout)
            const peerCert = tlsSocket.getPeerCertificate(true)
            const certChain = extractCertChain(peerCert)
            resolve({ x224Response, certChain, tlsSocket })
          })

          tlsSocket.on("error", (err) => {
            clearTimeout(timeout)
            reject(new Error(`TLS handshake failed: ${err.message}`))
          })
        },
        error(tcp, err) {
          clearTimeout(timeout)
          reject(new Error(`TCP connection failed: ${err.message}`))
        },
        close() {
          clearTimeout(timeout)
          reject(new Error("TCP connection closed during handshake"))
        },
      },
    })

    // Step 2: Send X.224 Connection Request
    conn.write(new Uint8Array(x224Request))
  })
}

function extractCertChain(peerCert) {
  const certs = []
  if (!peerCert || !peerCert.raw) return certs
  const seen = new Set()
  let current = peerCert
  while (current && current.raw) {
    const fp = current.fingerprint256 || current.raw.toString("hex")
    if (seen.has(fp)) break
    seen.add(fp)
    certs.push(new Uint8Array(current.raw))
    if (current.issuerCertificate && current.issuerCertificate !== current) {
      current = current.issuerCertificate
    } else break
  }
  return certs
}

// ── Bidirectional Relay ──

function setupRelay(ws, tlsSocket, vmIp) {
  let wsBytes = 0
  let tlsBytes = 0
  const log = `[relay ${vmIp}]`

  tlsSocket.on("data", (data) => {
    tlsBytes += data.length
    if (ws.readyState === 1) ws.send(data)
  })

  ws.binaryType = "arraybuffer"

  tlsSocket.on("end", () => {
    console.log(`${log} TLS ended — WS→TLS: ${wsBytes}B, TLS→WS: ${tlsBytes}B`)
    ws.close()
  })

  tlsSocket.on("error", (err) => {
    console.error(`${log} TLS error:`, err.message)
    ws.close()
  })
}

// ── Main Handler ──

export function createRdpProxyHandler() {
  const activeSessions = new Map()

  return {
    open(ws) {
      const vmIp = ws.data?.vmIp
      if (!vmIp) {
        ws.close(1008, "Missing VM IP")
        return
      }

      console.log(`[rdp] WebSocket opened for ${vmIp}:3389`)

      let handshakeDone = false

      ws.binaryType = "arraybuffer"
      ws.addEventListener("message", async (event) => {
        if (handshakeDone) {
          // Relay mode: forward to TLS socket
          const session = activeSessions.get(ws)
          if (session?.tlsSocket && !session.tlsSocket.destroyed) {
            session.tlsSocket.write(new Uint8Array(event.data))
          }
          return
        }

        handshakeDone = true
        try {
          const requestData = new Uint8Array(event.data)
          console.log(`[rdp ${vmIp}] RDCleanPath request (${requestData.length} bytes)`)

          // Parse RDCleanPath request (use vmIp from URL, not destination from PDU)
          const request = parseRDCleanPathRequest(requestData)
          console.log(`[rdp ${vmIp}] destination: ${request.destination}`)

          // Perform RDP handshake
          const { x224Response, certChain, tlsSocket } = await performRDPHandshake(
            vmIp,
            3389,
            request.x224ConnectionRequest
          )

          // Send RDCleanPath response
          const serverAddr = `${vmIp}:3389`
          const responsePdu = buildRDCleanPathResponse(serverAddr, x224Response, certChain)
          console.log(`[rdp ${vmIp}] Sending RDCleanPath response (${responsePdu.length} bytes)`)
          ws.send(responsePdu)

          // Set up relay
          activeSessions.set(ws, { tlsSocket, vmIp })
          setupRelay(ws, tlsSocket, vmIp)

          // Handle WS messages for relay
          ws.addEventListener("message", (ev) => {
            if (!handshakeDone) return
            const session = activeSessions.get(ws)
            if (session?.tlsSocket && !session.tlsSocket.destroyed) {
              session.tlsSocket.write(new Uint8Array(ev.data))
            }
          })

          console.log(`[rdp ${vmIp}] Handshake complete — relay active`)
        } catch (err) {
          console.error(`[rdp ${vmIp}] Handshake error:`, err.message)
          try {
            const errorPdu = buildRDCleanPathError(1, 502)
            ws.send(errorPdu)
          } catch {}
          ws.close(1011, err.message)
        }
      })

      ws.addEventListener("close", () => {
        const session = activeSessions.get(ws)
        if (session?.tlsSocket) {
          session.tlsSocket.destroy()
          activeSessions.delete(ws)
        }
        console.log(`[rdp ${vmIp}] WebSocket closed`)
      })
    },
    message() {},
    close() {},
  }
}
