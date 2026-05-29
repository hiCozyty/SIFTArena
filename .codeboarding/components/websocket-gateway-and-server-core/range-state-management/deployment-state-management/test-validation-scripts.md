---
component_id: 1.7.1.5
component_name: Test Validation Scripts
---

# Test Validation Scripts

## Component Description

Standalone WebSocket test scripts for manual validation of the deployment pipeline's data flow. Includes handler class definitions and WebSocket event listeners.

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


## Source Files:

- `server/ansibleScriptTest.js`
- `server/snapshotTest.js`
- `web/src/components/app/app-layout.tsx`

