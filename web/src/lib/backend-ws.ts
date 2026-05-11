type WsState = "disconnected" | "connecting" | "connected"

let ws: WebSocket | null = null
let state: WsState = "disconnected"
const handlers = new Set<(data: Record<string, unknown>) => void>()
let sendQueue: string[] = []

export function connect(url: string, onClose?: () => void) {
  if (ws && state !== "disconnected") return
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
    } catch { /* ignore parse errors */ }
  }
  ws.onclose = () => {
    state = "disconnected"
    ws = null
    sendQueue = []
    onClose?.()
  }
}

export function close() {
  sendQueue = []
  if (ws) {
    ws.onclose = null
    ws.close()
  }
  ws = null
  state = "disconnected"
}

export function send(msg: Record<string, unknown>) {
  const payload = JSON.stringify(msg)
  if (state === "connected") {
    ws?.send(payload)
  } else if (state === "connecting") {
    sendQueue.push(payload)
  }
}

export function subscribe(handler: (data: Record<string, unknown>) => void): () => void {
  handlers.add(handler)
  return () => handlers.delete(handler)
}

export function getState(): WsState {
  return state
}
