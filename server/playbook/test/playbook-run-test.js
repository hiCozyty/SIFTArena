const PORT = process.env.BUN_SERVER_PORT
const WS_URL = `ws://localhost:${PORT}`

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL)
    ws.addEventListener("open", () => {
      resolve(ws)
    })
    ws.addEventListener("error", (e) => {
      console.error("WebSocket error event:", e.message ?? "no message")
      reject(new Error("connection failed"))
    })
    setTimeout(() => reject(new Error("connect timeout")), 5000)
  })
}

function sendAndWait(ws, msg, timeoutMs = 300000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", handler)
      console.error(`TIMEOUT: no response for "${msg.type}" after ${timeoutMs}ms`)
      reject(new Error(`timeout waiting for ${msg.type}`))
    }, timeoutMs)
    const handler = (e) => {
      const data = JSON.parse(e.data)
      if (data.type === msg.type) {
        clearTimeout(timer)
        ws.removeEventListener("message", handler)
        resolve(data)
      }
    }
    ws.addEventListener("message", handler)
    ws.send(JSON.stringify(msg))
  })
}

async function main() {
  const ws = await connect()

  console.log("Starting playbook run test")

  ws.addEventListener("message", (e) => {
    const data = JSON.parse(e.data)
    if (data.type === "runPlaybookStatus") {
      const icon = data.status === "error" ? "✗" : data.status === "success" ? "✓" : "→"
      console.log(`  [${icon}] ${data.step}: ${data.message}`)
    }
  })

  ws.addEventListener("error", (e) => console.error("WebSocket error during session:", e.message ?? "no message"))

  const res = await sendAndWait(ws, {
    type: "runPlaybook",
    data: { playbookName: "negative control with noise" },
  })

  if (res.error || res.result?.error) {
    console.error("FAIL:", res.error || res.result.error)
    process.exit(1)
  }

  console.log("Finished playbook run test")
  ws.close()
}

main().catch(err => {
  console.error("error:", err.message)
  process.exit(1)
})
