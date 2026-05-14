const PORT = process.env.BUN_SERVER_PORT
const WS_URL = `ws://localhost:${PORT}`

let passed = 0; let failed = 0; let total = 0
function ok(cond, label) {
  total++
  if (cond) { passed++; console.log(`  ok ${label}`) }
  else { failed++; console.log(`  FAIL ${label}`) }
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.addEventListener("open", () => resolve(ws))
    ws.addEventListener("error", () => reject(new Error("connection failed")))
    setTimeout(() => reject(new Error("connect timeout")), 5000)
  })
}

function sendAndWait(ws, msg, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", handler)
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
  console.log(`connecting to ${WS_URL}`)
  const ws = await connect(WS_URL)
  console.log("  ok connected\n")

  console.log("1. prepareGoldenImage (fast path — existing snapshots)")
  const r1 = await sendAndWait(ws, { type: "prepareGoldenImage" })
  console.log("  result:", JSON.stringify(r1.result, null, 2))
  ok(!r1.error, "prepareGoldenImage succeeded")
  for (const entry of r1.result?.prepared ?? []) {
    if (entry.created === false) {
      console.log(`  fast path: ${entry.label} snapshot existed, skipped`)
    }
  }

  console.log("\n2. prepareGoldenImage (overwrite — remove + recreate)")
  const r2 = await sendAndWait(ws, { type: "prepareGoldenImage", overwrite: true }, 300000)
  console.log("  result:", JSON.stringify(r2.result, null, 2))
  ok(!r2.error, "prepareGoldenImage overwrite succeeded")
  for (const entry of r2.result?.prepared ?? []) {
    if (entry.overwritten) {
      console.log(`  overwritten: ${entry.label} removed + recreated`)
    }
  }

  ws.close()
  console.log(`\n${total} tests, ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error("test error:", err.message)
  process.exit(1)
})
