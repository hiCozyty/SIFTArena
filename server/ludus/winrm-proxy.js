import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, "../..")

export function createWinrmProxy() {
  const activeSessions = new Map()

  return {
    open(ws) {
      const vmid = ws.data?.vmid
      const host = ws.data?.host
      const username = ws.data?.username
      const password = ws.data?.password

      if (!host || !username || !password) {
        console.error(`[winrm ${vmid}] Missing connection info in ws.data`)
        ws.close(1008, "Missing WinRM connection info")
        return
      }

      if (activeSessions.has(vmid)) {
        activeSessions.get(vmid).abort()
        activeSessions.delete(vmid)
      }

      let proc = null
      let aborted = false
      let firstOutput = false

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
        const args = ["run", "evil-winrm-py", "-i", host, "-u", username, "-p", password, "--ssl", "--port", "5986"]
        proc = Bun.spawn(["uv", ...args], {
          cwd: projectRoot,
          terminal: {
            cols: 80,
            rows: 30,
            data(terminal, data) {
              if (!firstOutput) {
                firstOutput = true
                }
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
        console.error(`[winrm ${vmid}] Failed to spawn evil-winrm-py:`, err.message)
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

      const text = typeof message === "string" ? message : Buffer.from(message).toString()
      if (text.length > 1 || text.charCodeAt(0) !== 13) {
        }
      session.proc.terminal.write(text)
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
