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

function sendAndWait(ws, msg, timeoutMs = 10000) {
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

function assert(condition, msg) {
  if (!condition) throw new Error(`FAIL: ${msg}`)
  console.log(`  PASS: ${msg}`)
}

async function runTests(ws) {
  const testAbility = {
    name: "Test LSASS Dump",
    description: "Test ability for LSASS memory dump",
    command: "echo test",
    kali_prereq: "",
    win_prereq: "",
  }

  console.log("\n1. getCustomAbilities (empty)")
  const empty = await sendAndWait(ws, { type: "getCustomAbilities" })
  assert(!empty.error, "no error")
  assert(Array.isArray(empty.result), "returns array")
  assert(empty.result.length === 0, "empty array")

  console.log("\n2. createCustomAbility")
  const created = await sendAndWait(ws, { type: "createCustomAbility", data: testAbility })
  assert(!created.error, "no error")
  assert(created.result.ability_id !== undefined, "has ability_id")
  assert(created.result.name === "Test LSASS Dump", "name matches")
  assert(created.result.command === "echo test", "command matches")

  console.log("\n3. getCustomAbilities (after create)")
  const afterCreate = await sendAndWait(ws, { type: "getCustomAbilities" })
  assert(!afterCreate.error, "no error")
  assert(afterCreate.result.length === 1, "has 1 ability")
  assert(afterCreate.result[0].ability_id === created.result.ability_id, "ability_id matches")

  console.log("\n4. updateCustomAbility")
  const updated = await sendAndWait(ws, { type: "updateCustomAbility", data: {
    abilityId: created.result.ability_id,
    data: { name: "Updated LSASS Dump", description: "Updated description" },
  }})
  assert(!updated.error, "no error")
  assert(updated.result.name === "Updated LSASS Dump", "name updated")
  assert(updated.result.description === "Updated description", "description updated")

  console.log("\n5. updateCustomAbility (command and prereqs)")
  const updatedCmd = await sendAndWait(ws, { type: "updateCustomAbility", data: {
    abilityId: created.result.ability_id,
    data: { command: "Get-Process lsass", kali_prereq: "apt install tool", win_prereq: "choco install tool" },
  }})
  assert(!updatedCmd.error, "no error")
  assert(updatedCmd.result.command === "Get-Process lsass", "command updated")
  assert(updatedCmd.result.kali_prereq === "apt install tool", "kali_prereq updated")
  assert(updatedCmd.result.win_prereq === "choco install tool", "win_prereq updated")

  console.log("\n6. deleteCustomAbility")
  const deleted = await sendAndWait(ws, { type: "deleteCustomAbility", data: { abilityId: created.result.ability_id } })
  assert(!deleted.error, "no error")
  assert(deleted.result.success === true, "delete success")

  console.log("\n7. getCustomAbilities (after delete)")
  const afterDelete = await sendAndWait(ws, { type: "getCustomAbilities" })
  assert(!afterDelete.error, "no error")
  assert(afterDelete.result.length === 0, "empty after deleting all")

  console.log("\nAll WebSocket tests passed!")
}

async function main() {
  const ws = await connect()
  await runTests(ws)
  ws.close()
}

main().catch(err => {
  console.error("error:", err.message)
  process.exit(1)
})
