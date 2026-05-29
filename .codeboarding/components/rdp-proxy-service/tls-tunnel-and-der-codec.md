---
component_id: 4.5
component_name: TLS Tunnel & DER Codec
---

# TLS Tunnel & DER Codec

## Component Description

Performs TLS handshake with the target VM, encodes/decodes ASN.1 DER structures for RDP protocol fields, and establishes the full-duplex TCP-to-WebSocket relay.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/server/rdp-proxy.js (lines 189-246)
```
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
```

### /home/cozyty/Projects/shadowProtocol/server/rdp-proxy.js (lines 267-288)
```
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
```


