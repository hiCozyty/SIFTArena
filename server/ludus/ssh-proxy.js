export function createSshProxy() {
  const activeSessions = new Map()

  return {
    open(ws) {
      const vmid = ws.data?.vmid
      const host = ws.data?.host
      const port = ws.data?.port
      const username = ws.data?.username
      const password = ws.data?.password

      if (!host || !username || !password) {
        console.error(`[ssh ${vmid}] Missing connection info in ws.data`)
        ws.close(1008, "Missing SSH connection info")
        return
      }

      if (activeSessions.has(vmid)) {
        activeSessions.get(vmid).abort()
        activeSessions.delete(vmid)
      }

      let proc = null
      let aborted = false

      const heartbeat = setInterval(() => {
        if (ws.readyState === 1) ws.ping()
      }, 30000)

      function abort() {
        aborted = true
        clearInterval(heartbeat)
        if (proc) {
          proc.kill()
          proc = null
        }
      }

      activeSessions.set(vmid, { abort })

      try {
        const args = ["-p", password, "ssh", "-tt"]
        if (port) args.push("-p", String(port))
        args.push("-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "ConnectTimeout=5", `${username}@${host}`)
        proc = Bun.spawn(["sshpass", ...args], {
          terminal: {
            cols: 80,
            rows: 30,
            data(terminal, data) {
              if (!aborted && ws.readyState === 1) {
                ws.send(data)
              }
            },
          },
        })

        activeSessions.set(vmid, { abort, proc })

        proc.exited.then((exitCode) => {
          activeSessions.delete(vmid)
          if (!aborted && ws.readyState === 1) ws.close()
        })
      } catch (err) {
        console.error(`[ssh ${vmid}] Failed to spawn ssh:`, err.message)
        activeSessions.delete(vmid)
        if (ws.readyState === 1) ws.close(1011, err.message)
      }
    },

    message(ws, message) {
      const vmid = ws.data?.vmid
      const session = activeSessions.get(vmid)

      if (!session?.proc?.terminal) return

      if (typeof message === "string") {
        try {
          const parsed = JSON.parse(message)
          if (parsed.type === "resize") {
            session.proc.terminal.resize(parsed.cols, parsed.rows)
            return
          }
        } catch {}
      }

      session.proc.terminal.write(
        typeof message === "string" ? message : Buffer.from(message).toString()
      )
    },

    close(ws, code, reason) {
      const vmid = ws.data?.vmid
      const session = activeSessions.get(vmid)
      if (session) {
        session.abort()
        activeSessions.delete(vmid)
      }
    },
  }
}
