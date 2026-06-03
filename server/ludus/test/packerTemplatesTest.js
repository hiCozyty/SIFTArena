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

function assert(condition, msg) {
  if (!condition) throw new Error(`FAIL: ${msg}`)
  console.log(`  PASS: ${msg}`)
}

async function runTests(ws) {
  console.log("\n1. templatesFromPacker — fetch packer directory listing")
  const result = await sendAndWait(ws, { type: "templatesFromPacker" })
  assert(!result.error, `no error: ${result.error ?? ""}`)
  assert(Array.isArray(result.result), "returns array")
  assert(result.result.length > 0, `has templates: ${result.result.length}`)
  console.log(`  Found ${result.result.length} templates`)

  console.log("\n2. Verify template structure")
  for (const tmpl of result.result) {
    console.log(`\n  Template: ${tmpl.templateName} (dir: ${tmpl.dirname})`)
    assert(typeof tmpl.dirname === "string", "has dirname")
    assert(typeof tmpl.templateName === "string", "has templateName")
    assert(Array.isArray(tmpl.files), "files is array")
    assert(tmpl.files.length > 0, `${tmpl.templateName} has files`)

    for (const f of tmpl.files) {
      console.log(`    File: ${f.name} (${f.content.length} chars)`)
      assert(typeof f.name === "string", "file has name")
      assert(typeof f.content === "string", "file has content")
    }
  }

  console.log("\n3. Verify known template mappings")
  const found = result.result.map(t => t.templateName)
  const expected = [
    "kali-x64-desktop-template",
    "debian-11-x64-server-template",
    "win11-22h2-x64-enterprise-template",
  ]
  for (const name of expected) {
    assert(found.includes(name), `found template: ${name}`)
  }

  console.log("\nAll packer template tests passed!")
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
