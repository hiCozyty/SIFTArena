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

async function cmdCategories(ws, label) {
  console.log(`\n=== Categories (${label}) ===`)
  const res = await sendAndWait(ws, { type: "getCalderaCategories", label })
  if (res.error) { console.error("error:", res.error); return }
  console.log(JSON.stringify(res.result, null, 2))
}

async function cmdOverview(ws, label) {
  console.log(`\n=== Atomic Overview (${label}) ===`)
  const res = await sendAndWait(ws, { type: "getAtomicAbilities", label })
  if (res.error) { console.error("error:", res.error); return }
  console.log(JSON.stringify(res.result, null, 2))
}

async function cmdTechnique(ws, label, techniqueId) {
  console.log(`\n=== Technique ${techniqueId} (${label}) ===`)
  const res = await sendAndWait(ws, { type: "getAtomicAbilities", label, techniqueId })
  if (res.error) { console.error("error:", res.error); return }
  console.log(JSON.stringify(res.result, null, 2))
}

async function cmdAbility(ws, label, abilityId) {
  console.log(`\n=== Ability ${abilityId} (${label}) ===`)
  const res = await sendAndWait(ws, { type: "getAtomicAbilities", label, abilityId })
  if (res.error) { console.error("error:", res.error); return }
  console.log(JSON.stringify(res.result, null, 2))
}

async function cmdCreate(ws, label, name, tactic, techniqueId, command, platform, executor) {
  console.log(`\n=== Create Ability ===`)
  const msg = { type: "createAbility", label, name, tactic, technique_id: techniqueId, command }
  if (platform) msg.platform = platform
  if (executor) msg.executor = executor
  const res = await sendAndWait(ws, msg)
  if (res.error) { console.error("error:", res.error); return }
  console.log(JSON.stringify(res.result, null, 2))
  return res.result
}

async function cmdCustomList(ws, label) {
  console.log(`\n=== Custom Abilities ===`)
  const res = await sendAndWait(ws, { type: "getCustomAbilities", label })
  if (res.error) { console.error("error:", res.error); return }
  console.log(JSON.stringify(res.result, null, 2))
  return res.result
}

async function cmdCustomGet(ws, label, abilityId) {
  console.log(`\n=== Custom Ability ${abilityId} ===`)
  const res = await sendAndWait(ws, { type: "getCustomAbility", label, abilityId })
  if (res.error) { console.error("error:", res.error); return }
  console.log(JSON.stringify(res.result, null, 2))
}

async function main() {
  const cmd = Bun.argv[2]
  const label = Bun.argv[3]
  const extra = Bun.argv[4]
  const extra2 = Bun.argv[5]

  if (!cmd || cmd === "help") {
    console.log("Usage:")
    console.log("  bun calderaAPITest.js categories <label>")
    console.log("  bun calderaAPITest.js overview <label>")
    console.log("  bun calderaAPITest.js technique <label> <techniqueId>")
    console.log("  bun calderaAPITest.js ability <label> <abilityId>")
    console.log("  bun calderaAPITest.js create <label> <name> <tactic> <techniqueId> <command> [platform] [executor]")
    console.log("  bun calderaAPITest.js list <label>")
    console.log("  bun calderaAPITest.js get <label> <abilityId>")
    console.log("")
    console.log("Examples:")
    console.log("  bun calderaAPITest.js categories attacker-kali")
    console.log("  bun calderaAPITest.js overview attacker-kali")
    console.log("  bun calderaAPITest.js technique attacker-kali T1003.001")
    console.log("  bun calderaAPITest.js create attacker-kali 'My Dump' credential-access T1003.001 'reg save HKLM\\SAM sam.save' windows psh")
    process.exit(0)
  }

  if (!label && cmd !== "help") {
    console.error("Missing <label> argument")
    process.exit(1)
  }

  const handlers = {
    categories: (ws) => cmdCategories(ws, label),
    overview: (ws) => cmdOverview(ws, label),
    technique: (ws) => cmdTechnique(ws, label, extra),
    ability: (ws) => cmdAbility(ws, label, extra),
    create: (ws) => cmdCreate(ws, label, extra, Bun.argv[4], Bun.argv[5], Bun.argv[6], Bun.argv[7], Bun.argv[8]),
    list: (ws) => cmdCustomList(ws, label),
    get: (ws) => cmdCustomGet(ws, label, extra),
  }

  const handler = handlers[cmd]
  if (!handler) {
    console.error(`Unknown command: ${cmd}. Use "help" for usage.`)
    process.exit(1)
  }

  const ws = await connect()
  ws.addEventListener("close", (e) => console.log(`WebSocket closed: code=${e.code} reason="${e.reason}"`))
  ws.addEventListener("error", (e) => console.error("WebSocket error during session:", e.message ?? "no message"))
  await handler(ws)
  ws.close()
}

main().catch(err => {
  console.error("error:", err.message)
  process.exit(1)
})
