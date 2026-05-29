---
component_id: 1.7.1.4
component_name: WebSocket Poller Subsystem
---

# WebSocket Poller Subsystem

## Component Description

Processes incoming WebSocket messages in the polling engine, handling promise resolution and errors for the data stream that feeds the deployment pipeline.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/server/poller.js (lines 54-54)
```
            .catch(err => ws.send(JSON.stringify({ type: data.type, error: err.message })))
```

### /home/cozyty/Projects/shadowProtocol/server/poller.js (lines 53-53)
```
            .then(result => ws.send(JSON.stringify({ type: data.type, result })))
```


## Source Files:

- `server/poller.js`

