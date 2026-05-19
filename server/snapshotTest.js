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

function sendAndWait(ws, msg, timeoutMs = 300000) {
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

// Usage: bun test.js list win11-22h2
// Lists all snapshots for a VM matched by label
async function exampleList(ws, label) {
  const res = await sendAndWait(ws, { type: "listSnapshots", label })
  if (res.error) { console.error("error:", res.error); return }
  console.log(JSON.stringify(res.result, null, 2))
}

// Usage: bun test.js reset win11-22h2
// Full lifecycle: rollback to base-clean → wait IP → wait WinRM → ansible ping
// Returns timing breakdown of each phase
async function exampleReset(ws, label) {
  console.log(`Resetting ${label} to base-clean...`)
  const res = await sendAndWait(ws, { type: "restoreToBaseClean", label })
  if (res.error) { console.error("error:", res.error); return }
  console.log(JSON.stringify(res.result, null, 2))
}

// Usage: bun test.js save win11-22h2
// Waits for connectivity, then removes old base-clean and creates a new one
async function exampleSave(ws, label) {
  console.log(`Saving ${label} as new base-clean...`)
  const res = await sendAndWait(ws, { type: "saveBaseClean", label })
  if (res.error) { console.error("error:", res.error); return }
  console.log(JSON.stringify(res.result, null, 2))
}

async function main() {
  const cmd = Bun.argv[2]
  const label = Bun.argv[3]

  if (!cmd || cmd === "help") {
    console.log("Usage:")
    console.log("  bun test.js list <label>")
    console.log("  bun test.js reset <label>")
    console.log("  bun test.js save <label>")
    console.log("")
    console.log("Examples:")
    console.log("  bun test.js list win11-22h2")
    console.log("  bun test.js reset win11-22h2")
    console.log("  bun test.js save kali")
    process.exit(0)
  }

  const handlers = { list: exampleList, reset: exampleReset, save: exampleSave }
  const handler = handlers[cmd]
  if (!handler) {
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
  await handler(ws, label)
  ws.close()
}

main().catch(err => {
  console.error("error:", err.message)
  process.exit(1)
})
