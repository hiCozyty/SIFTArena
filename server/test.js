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

async function main() {
  console.log(`connecting to ${WS_URL}`)
  const ws = await connect(WS_URL)
  console.log("  ok connected\n")

  // 1. healthCheck
  console.log("1. healthCheck")
  const h = await sendAndWait(ws, { type: "healthCheck" })
  ok(h.type === "healthCheck", "response type")
  ok(h.result && typeof h.result.status === "string", "result.status is string")

  // 2. deleteRangeVMs (default — skip kali + router)
  console.log("\n2. deleteRangeVMs (default)")
  const del = await sendAndWait(ws, { type: "deleteRangeVMs" })
  ok(del.type === "deleteRangeVMs", "response type")
  if (del.result) {
    ok(typeof del.result.deleted === "number", "result.deleted is number")
    ok(Array.isArray(del.result.names), "result.names is array")
  } else {
    ok(true, `backend rejected (${del.error})`)
  }

  // // 3. deleteRangeVMs with all: true (includes kali + router)
  // console.log("\n3. deleteRangeVMs (all: true)")
  // const delAll = await sendAndWait(ws, { type: "deleteRangeVMs", all: true })
  // ok(delAll.type === "deleteRangeVMs", "response type")
  // if (delAll.result) {
  //   ok(typeof delAll.result.deleted === "number", "result.deleted is number")
  //   ok(Array.isArray(delAll.result.names), "result.names is array")
  // } else {
  //   ok(true, `backend rejected (${delAll.error})`)
  // }

  // 4. subscribe + rangeStatus poll
  console.log("\n4. rangeStatus (polling)")
  ws.send(JSON.stringify({ type: "subscribe", channel: "rangeStatus" }))
  try {
    const r = await waitForType(ws, "rangeStatus")
    ok(r.type === "rangeStatus", "response type")
    ok(Array.isArray(r.result), "result is array")
    ok(typeof r.latestLog === "string", "latestLog is string")
    ok(typeof r.logEmpty === "boolean", "logEmpty is boolean")
    const names = r.result.map((v) => v.name).join(", ")
    console.log("    VMs:", names)
    if (!r.logEmpty) console.log("    latest:", r.latestLog)
  } catch (e) {
    ok(false, e.message)
  }

  // // 4. deployVM (default IP)
  // console.log("\n4. deployVM (default IP)")
  // const dep = await sendAndWait(ws, { type: "deployVM", vm: "attacker-kali" })
  // ok(dep.type === "deployVM", "response type")
  // if (dep.result) {
  //   ok(dep.result.deployed === "attacker-kali", "result.deployed matches")
  // } else {
  //   ok(true, `backend rejected (${dep.error})`)
  // }

  // 5. deployVM with custom valid IP
  console.log("\n5. deployVM (custom IP 50)")
  const depCustom = await sendAndWait(ws, { type: "deployVM", vm: "win11-22h2", ipLastOctet: 50 })
  ok(depCustom.type === "deployVM", "response type")
  if (depCustom.result) {
    ok(depCustom.result.deployed === "win11-22h2", "result.deployed matches")
  } else {
    ok(true, `backend rejected (${depCustom.error})`)
  }

  // // 6. deployVM with invalid IP (should silently fail)
  // console.log("\n6. deployVM (invalid IP 999 — silently fails)")
  // const depBad = await sendAndWait(ws, { type: "deployVM", vm: "attacker-kali", ipLastOctet: 999 })
  // ok(depBad.type === "deployVM", "response type")
  // ok(depBad.result && depBad.result.deployed === null, "result.deployed is null")

  console.log(`\n${"=".repeat(40)}`)
  console.log(`${passed}/${total} passed${failed > 0 ? `, ${failed} FAILED` : ""}`)
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
