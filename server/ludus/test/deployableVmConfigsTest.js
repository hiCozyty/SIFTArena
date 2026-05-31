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
  const testConfig = {
    hostname: "win11-22h2",
    config: `- vm_name: "{{ range_id }}-win11-22h2"
  hostname: WIN11-22H2
  template: win11-22h2-x64-enterprise-template
  vlan: 99
  ip_last_octet: 24
  ram_gb: 4
  cpus: 2
  windows:
    sysprep: false`,
    parsed_config: {
      vm_name: "{{ range_id }}-win11-22h2",
      hostname: "WIN11-22H2",
      template: "win11-22h2-x64-enterprise-template",
      vlan: 99,
      ip_last_octet: 24,
      ram_gb: 4,
      cpus: 2,
      windows: { sysprep: false },
    },
  }

  console.log("\n1. getDeployableVmConfigs (empty)")
  const empty = await sendAndWait(ws, { type: "getDeployableVmConfigs" })
  assert(!empty.error, "no error")
  assert(Array.isArray(empty.result), "returns array")
  assert(empty.result.length === 0, "empty array")

  console.log("\n2. createDeployableVmConfig")
  const created = await sendAndWait(ws, { type: "createDeployableVmConfig", data: testConfig })
  assert(!created.error, "no error")
  assert(created.result.id !== undefined, "has id")
  assert(created.result.hostname === "win11-22h2", "hostname matches")
  assert(created.result.config.includes("WIN11-22H2"), "config contains hostname")

  console.log("\n3. getDeployableVmConfigs (after create)")
  const afterCreate = await sendAndWait(ws, { type: "getDeployableVmConfigs" })
  assert(!afterCreate.error, "no error")
  assert(afterCreate.result.length === 1, "has 1 config")
  assert(afterCreate.result[0].id === created.result.id, "id matches")

  console.log("\n4. createDeployableVmConfig (second)")
  const created2 = await sendAndWait(ws, { type: "createDeployableVmConfig", data: {
    hostname: "kali",
    config: `- vm_name: "{{ range_id }}-kali"
  hostname: kali
  template: kali-template
  vlan: 99
  ip_last_octet: 10
  ram_gb: 4
  cpus: 2`,
    parsed_config: {
      vm_name: "{{ range_id }}-kali",
      hostname: "kali",
      template: "kali-template",
      vlan: 99,
      ip_last_octet: 10,
      ram_gb: 4,
      cpus: 2,
    },
  }})
  assert(!created2.error, "no error")
  assert(created2.result.id !== created.result.id, "different id")

  console.log("\n5. updateDeployableVmConfig")
  const updated = await sendAndWait(ws, { type: "updateDeployableVmConfig", data: { id: created.result.id, data: {
    hostname: "win11-updated",
    config: `- vm_name: "{{ range_id }}-win11-updated"
  hostname: WIN11-UPDATED
  template: win11-22h2-x64-enterprise-template
  vlan: 99
  ip_last_octet: 24
  ram_gb: 8
  cpus: 4
  windows:
    sysprep: false`,
  }}})
  assert(!updated.error, "no error")
  assert(updated.result.hostname === "win11-updated", "hostname updated")
  assert(updated.result.config.includes("WIN11-UPDATED"), "config updated")

  console.log("\n6. deleteDeployableVmConfig")
  const deleted = await sendAndWait(ws, { type: "deleteDeployableVmConfig", data: { id: created.result.id } })
  assert(!deleted.error, "no error")
  assert(deleted.result.success === true, "delete success")

  console.log("\n7. getDeployableVmConfigs (after delete)")
  const afterDelete = await sendAndWait(ws, { type: "getDeployableVmConfigs" })
  assert(!afterDelete.error, "no error")
  assert(afterDelete.result.length === 1, "has 1 config after delete")

  console.log("\n8. deleteDeployableVmConfig (last)")
  await sendAndWait(ws, { type: "deleteDeployableVmConfig", data: { id: created2.result.id } })
  const final = await sendAndWait(ws, { type: "getDeployableVmConfigs" })
  assert(final.result.length === 0, "empty after deleting all")

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
