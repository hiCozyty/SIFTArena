export function createDockerVncProxy() {
  const activeSessions = new Map()

  return {
    open(ws) {
      const id = ws.data?.id
      const host = ws.data?.host
      const port = ws.data?.port

      if (!host || !port) {
        console.error("[docker-vnc ?] Missing host or port in ws.data")
        ws.close(1008, "Missing connection info")
        return
      }

      if (activeSessions.has(id)) {
        activeSessions.get(id).abort()
        activeSessions.delete(id)
      }

      ws.binaryType = "arraybuffer"
      let containerWs = null
      let aborted = false

      const heartbeat = setInterval(() => {
        if (ws.readyState === 1) ws.ping()
      }, 30000)

      function abort() {
        aborted = true
        clearInterval(heartbeat)
        if (containerWs) {
          containerWs.close()
          containerWs = null
        }
      }

      activeSessions.set(id, { abort, containerWs: null })

      try {
        const auth = Buffer.from(`${ws.data.user}:${ws.data.pass}`).toString("base64")
        console.log(`[docker-vnc ${id}] Connecting to ws://${host}:${port}/ (user: ${ws.data.user})`)
        containerWs = new WebSocket(`ws://${host}:${port}/`, {
          headers: {
            Authorization: `Basic ${auth}`,
            Origin: "http://localhost",
            "Sec-WebSocket-Protocol": "binary",
          },
        })
        containerWs.binaryType = "arraybuffer"

        activeSessions.set(id, { abort, containerWs })

        containerWs.onopen = () => {
          console.log(`[docker-vnc ${id}] Connected to ${host}:${port}`)
          if (aborted) {
            containerWs.close()
            return
          }
        }

        containerWs.onmessage = (event) => {
          if (aborted) return
          if (ws.readyState === 1) {
            const data = Buffer.isBuffer(event.data) ? event.data : Buffer.from(event.data)
            ws.send(data, true)
          }
        }

        containerWs.onerror = (event) => {
          console.error(`[docker-vnc ${id}] Container WS error:`, event?.message || event?.error?.message || event?.type || event)
          if (ws.readyState === 1) ws.close(1011, "Container connection failed")
        }

        containerWs.onclose = (event) => {
          console.log(`[docker-vnc ${id}] Container WS closed: code=${event.code} reason=${event.reason}`)
          if (ws.readyState === 1) ws.close()
        }
      } catch (err) {
        console.error(`[docker-vnc ${id}] Setup error:`, err.message)
        if (ws.readyState === 1) ws.close(1011, err.message)
      }
    },

    message(ws, message) {
      const id = ws.data?.id
      const session = activeSessions.get(id)
      if (session?.containerWs?.readyState === 1) {
        const data = Buffer.isBuffer(message) ? message : Buffer.from(message)
        session.containerWs.send(data)
      }
    },

    close(ws, code, reason) {
      const id = ws.data?.id
      const session = activeSessions.get(id)
      if (session) {
        session.abort()
        activeSessions.delete(id)
      }
    },
  }
}
