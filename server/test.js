const PORT = process.env.BUN_SERVER_PORT
const WS_URL = `ws://localhost:${PORT}`
const TIMEOUT = 15000

let passed = 0
let failed = 0
let total = 0

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

function sendAndWait(ws, msg) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", handler)
      reject(new Error(`timeout waiting for ${msg.type}`))
    }, TIMEOUT)
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

function waitForType(ws, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener("message", handler)
      reject(new Error(`timeout waiting for ${type}`))
    }, TIMEOUT)
    const handler = (e) => {
      const data = JSON.parse(e.data)
      if (data.type === type) {
        clearTimeout(timer)
        ws.removeEventListener("message", handler)
        resolve(data)
      }
    }
    ws.addEventListener("message", handler)
  })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  console.log(`connecting to ${WS_URL}`)
  const ws = await connect(WS_URL)
  console.log("  ok connected\n")

  // console.log("1. delete all VMs")
  // const del = await sendAndWait(ws, { type: "deleteRangeVMs", all: true })
  // console.log("  result:", JSON.stringify(del.result, null, 2))


  console.log("1. deleteVM (router)")
  const del = await sendAndWait(ws, { type: "deleteVM", isRouter: true })
  console.log("  result:", JSON.stringify(del.result, null, 2))


  // console.log("\n2. waiting 5 seconds...")
  // await sleep(5000)

  // console.log("\n3. deployRouter")
  // const res = await sendAndWait(ws, { type: "deployRouter" })
  // if (res.error) {
  //   console.log("  error:", res.error)
  // } else {
  //   console.log("  result:", JSON.stringify(res.result, null, 2))
  // }

  ws.send(JSON.stringify({ type: "subscribe", channel: "rangeStatus" }))
  console.log("\nlistening for range status updates (ctrl-c to stop)...")
  ws.addEventListener("message", (e) => {
    const d = JSON.parse(e.data)
    if (d.type === "rangeStatus") {
      const names = d.result.map((v) => v.name).join(", ")
      console.log("  [range]", names)
      if (!d.logEmpty) {
        const tail = d.latestLog.split("\n").slice(-5).join("\n")
        console.log(tail)
      }
    }
  })
}

main().catch((err) => {
  console.error("test error:", err.message)
  process.exit(1)
})
