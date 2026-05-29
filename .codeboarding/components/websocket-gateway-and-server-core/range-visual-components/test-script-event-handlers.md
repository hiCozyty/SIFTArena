---
component_id: 1.6.8
component_name: Test Script Event Handlers
---

# Test Script Event Handlers

## Component Description

WebSocket event listeners and handler classes from ansibleScriptTest.js and snapshotTest.js.

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


