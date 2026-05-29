---
component_id: 1.6.6.4
component_name: Test Validation Scripts
---

# Test Validation Scripts

## Component Description

Standalone WebSocket test scripts for manual validation of the deployment pipeline's data flow.

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

- server.snapshotTest.main.ws.addEventListener `/home/cozyty/Projects/shadowProtocol/server/snapshotTest.js`

## Source Files:

- `server/ansibleScriptTest.js`

