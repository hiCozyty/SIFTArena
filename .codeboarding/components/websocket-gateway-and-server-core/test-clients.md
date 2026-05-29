---
component_id: 1.13
component_name: Test Clients
---

# Test Clients

## Component Description

Standalone WebSocket test scripts (ansibleScriptTest.js, snapshotTest.js) for manual validation of the server's WebSocket API.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/server/ansibleScriptTest.js (lines 95-100)
```
  const handlers = {
    run:   (ws, label) => exampleRun(ws, label, extra),
    check: (ws, label) => exampleCheck(ws, label),
    reset: (ws, label) => exampleReset(ws, label),
    save:  (ws, label) => exampleSave(ws, label),
  }
```

### /home/cozyty/Projects/shadowProtocol/server/snapshotTest.js (lines 44-48)
```
async function exampleList(ws, label) {
  const res = await sendAndWait(ws, { type: "listSnapshots", label })
  if (res.error) { console.error("error:", res.error); return }
  console.log(JSON.stringify(res.result, null, 2))
}
```

### /home/cozyty/Projects/shadowProtocol/server/snapshotTest.js (lines 53-58)
```
async function exampleReset(ws, label) {
  console.log(`Resetting ${label} to base-clean...`)
  const res = await sendAndWait(ws, { type: "restoreToBaseClean", label })
  if (res.error) { console.error("error:", res.error); return }
  console.log(JSON.stringify(res.result, null, 2))
}
```

### /home/cozyty/Projects/shadowProtocol/server/snapshotTest.js (lines 62-67)
```
async function exampleSave(ws, label) {
  console.log(`Saving ${label} as new base-clean...`)
  const res = await sendAndWait(ws, { type: "saveBaseClean", label })
  if (res.error) { console.error("error:", res.error); return }
  console.log(JSON.stringify(res.result, null, 2))
}
```


