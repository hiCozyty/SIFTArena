const PORT = process.env.BUN_SERVER_PORT
const WS_URL = `ws://localhost:${PORT}`

function connect() {
  return new Promise((resolve, reject) => {
    console.log(`Connecting to ${WS_URL}...`)
    const ws = new WebSocket(WS_URL)
    ws.addEventListener("open", () => {
      console.log("WebSocket connected")
      resolve(ws)
    })
    ws.addEventListener("error", (e) => {
      console.error("WebSocket error event:", e.message ?? "no message")
      reject(new Error("connection failed"))
    })
    setTimeout(() => reject(new Error("connect timeout")), 5000)
  })
}

function sendAndWait(ws, msg, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", handler)
      console.error(`TIMEOUT: no response for "${msg.type}" after ${timeoutMs}ms`)
      reject(new Error(`timeout waiting for ${msg.type}`))
    }, timeoutMs)
    const handler = (e) => {
      const data = JSON.parse(e.data)
      console.log(`RECV: type="${data.type}"${data.error ? ` error="${data.error}"` : ""}`)
      if (data.type === msg.type) {
        clearTimeout(timer)
        ws.removeEventListener("message", handler)
        resolve(data)
      }
    }
    ws.addEventListener("message", handler)
    console.log(`SEND: ${JSON.stringify(msg)}`)
    ws.send(JSON.stringify(msg))
  })
}

async function exampleCategories(ws, label, calderaApiKey) {
  console.log(`Fetching Caldera categories on ${label}...`)
  const msg = { type: "getCalderaCategories", label }
  if (calderaApiKey) msg.calderaApiKey = calderaApiKey
  const res = await sendAndWait(ws, msg)
  if (res.error) { console.error("error:", res.error); return }
  console.log(JSON.stringify(res.result, null, 2))
}

async function main() {
  const cmd = Bun.argv[2]
  const label = Bun.argv[3]
  const calderaApiKey = Bun.argv[4]

  if (!cmd || cmd === "help") {
    console.log("Usage:")
    console.log("  bun categoriesTest.js list <label> [calderaApiKey]")
    console.log("")
    console.log("Examples:")
    console.log("  bun categoriesTest.js list attacker-kali")
    console.log("  bun categoriesTest.js list attacker-kali ADMIN123")
    process.exit(0)
  }

  if (cmd !== "list") {
    console.error(`Unknown command: ${cmd}. Use "help" for usage.`)
    process.exit(1)
  }
  if (!label) {
    console.error("Missing <label> argument")
    process.exit(1)
  }

  const ws = await connect()
  ws.addEventListener("close", (e) => console.log(`WebSocket closed: code=${e.code} reason="${e.reason}"`))
  ws.addEventListener("error", (e) => console.error("WebSocket error during session:", e.message ?? "no message"))
  await exampleCategories(ws, label, calderaApiKey)
  ws.close()
}

main().catch(err => {
  console.error("error:", err.message)
  process.exit(1)
})
