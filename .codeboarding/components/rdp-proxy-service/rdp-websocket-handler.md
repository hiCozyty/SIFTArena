---
component_id: 4.4
component_name: RDP WebSocket Handler
---

# RDP WebSocket Handler

## Component Description

Entry point activated by the Bun server when a WebSocket upgrade has isRdp: true. Parses the initial RDCleanPath protocol request, builds certificate/error responses, and orchestrates the tunnel.

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


