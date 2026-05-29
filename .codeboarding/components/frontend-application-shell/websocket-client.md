---
component_id: 5.9
component_name: WebSocket Client
---

# WebSocket Client

## Component Description

Singleton WebSocket connection manager maintaining a persistent connection to the Bun BFF server with automatic reconnection, message queuing during disconnection, and pub/sub handler dispatch.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/web/src/lib/backend-ws.ts (lines 10-39)
```
export function connect(url: string, onClose?: () => void) {
  if (ws && state !== "disconnected") return
  reconnectUrl = url
  reconnectOnClose = onClose ?? null
  state = "connecting"
  ws = new WebSocket(url)
  ws.onopen = () => {
    state = "connected"
    for (const msg of sendQueue) {
      ws?.send(msg)
    }
    sendQueue = []
  }
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      for (const handler of handlers) {
        handler(data)
      }
    } catch {
      // ignore parse errors
    }
  }
  ws.onclose = () => {
    state = "disconnected"
    ws = null
    sendQueue = []
    onClose?.()
  }
}
```

### /home/cozyty/Projects/shadowProtocol/web/src/lib/backend-ws.ts (lines 53-63)
```
export function send(msg: Record<string, unknown>) {
  const payload = JSON.stringify(msg)
  if (state === "connected") {
    ws?.send(payload)
  } else {
    sendQueue.push(payload)
    if (state === "disconnected" && reconnectUrl) {
      connect(reconnectUrl, reconnectOnClose ?? undefined)
    }
  }
}
```

### /home/cozyty/Projects/shadowProtocol/web/src/lib/backend-ws.ts (lines 65-70)
```
export function subscribe(handler: (data: Record<string, unknown>) => void): () => void {
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
  }
}
```


