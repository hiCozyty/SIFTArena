---
component_id: 4
component_name: RDP Proxy Service
---

# RDP Proxy Service

## Component Description

Tunnels Remote Desktop Protocol traffic from the browser to lab VMs via WebSocket-to-TCP proxying. Performs TLS negotiation and DER encoding/decoding of RDP protocol structures.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/server/rdp-proxy.js (lines 292-376)
```
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
```

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


## Source Files:

- `server/rdp-proxy.js`

