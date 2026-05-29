---
component_id: 1.6.6
component_name: Test Scripts
---

# Test Scripts

## Component Description

Standalone WebSocket test scripts for manual validation of the server's WebSocket API.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/server/ansibleScriptTest.js (lines 74-129)
```
async function main() {
  const cmd = Bun.argv[2]
  const label = Bun.argv[3]
  const extra = Bun.argv[4]

  if (!cmd || cmd === "help") {
    console.log("Usage:")
    console.log("  bun ansibleScriptTest.js run <label> <playbook>")
    console.log("  bun ansibleScriptTest.js check <label>")
    console.log("  bun ansibleScriptTest.js reset <label>")
    console.log("  bun ansibleScriptTest.js save <label>")
    console.log("")
    console.log("Examples:")
    console.log("  bun ansibleScriptTest.js run kali ./kaliAnsibleStart.yml")
    console.log("  bun ansibleScriptTest.js run win11-22h2 ./somePlaybook.yml")
    console.log("  bun ansibleScriptTest.js check kali")
    console.log("  bun ansibleScriptTest.js reset win11-22h2")
    console.log("  bun ansibleScriptTest.js save kali")
    process.exit(0)
  }

  const handlers = {
    run:   (ws, label) => exampleRun(ws, label, extra),
    check: (ws, label) => exampleCheck(ws, label),
    reset: (ws, label) => exampleReset(ws, label),
    save:  (ws, label) => exampleSave(ws, label),
  }
  const handler = handlers[cmd]
  if (!handler) {
    console.error(`Unknown command: ${cmd}. Use "help" for usage.`)
    process.exit(1)
  }
  if (!label) {
    console.error("Missing <label> argument")
    process.exit(1)
  }
  if (cmd === "run" && !extra) {
    console.error("Missing <playbook> argument")
    process.exit(1)
  }

  const ws = await connect()

  ws.addEventListener("message", (e) => {
    const data = JSON.parse(e.data)
    if (data.type === "ansibleLog") {
      if (data.line) console.log(data.line)
      if (data.state) console.log(`[${data.state}]`)
    }
  })

  ws.addEventListener("close", (e) => console.log(`WebSocket closed: code=${e.code} reason="${e.reason}"`))
  ws.addEventListener("error", (e) => console.error("WebSocket error during session:", e.message ?? "no message"))
  await handler(ws, label)
  ws.close()
}
```

### /home/cozyty/Projects/shadowProtocol/server/snapshotTest.js (lines 69-102)
```
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
```


## Source Files:

- `server/ansibleScriptTest.js`
- `server/snapshotTest.js`

