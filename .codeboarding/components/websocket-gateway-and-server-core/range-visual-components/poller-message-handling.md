---
component_id: 1.6.9
component_name: Poller Message Handling
---

# Poller Message Handling

## Component Description

Promise continuations from the poller's WebSocket message handler — .then() and .catch() for operation dispatch responses.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/server/poller.js (lines 53-53)
```
            .then(result => ws.send(JSON.stringify({ type: data.type, result })))
```

### /home/cozyty/Projects/shadowProtocol/server/poller.js (lines 54-54)
```
            .catch(err => ws.send(JSON.stringify({ type: data.type, error: err.message })))
```


