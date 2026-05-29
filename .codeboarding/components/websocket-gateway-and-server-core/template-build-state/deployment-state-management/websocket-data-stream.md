---
component_id: 1.9.1.3
component_name: WebSocket Data Stream
---

# WebSocket Data Stream

## Component Description

Processes incoming WebSocket messages in the polling engine, handling promise resolution and errors for the data stream that feeds the deployment pipeline's Ansible recap subscription.

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

