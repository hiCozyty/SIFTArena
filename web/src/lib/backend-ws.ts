type WsState = "disconnected" | "connecting" | "connected"

let ws: WebSocket | null = null
let state: WsState = "disconnected"
const handlers = new Set<(data: Record<string, unknown>) => void>()
let sendQueue: string[] = []
let reconnectUrl: string | null = null
let reconnectOnClose: (() => void) | null = null

const P = "[ws]"

export function connect(url: string, onClose?: () => void) {
  console.log(P, `connect() called — url=${url} currentState=${state} hasWs=${!!ws}`)
  if (ws && state !== "disconnected") {
    console.log(P, `connect() aborted — already connected/connecting`)
    return
  }
  reconnectUrl = url
  reconnectOnClose = onClose ?? null
  state = "connecting"
  ws = new WebSocket(url)
  ws.onopen = () => {
    console.log(P, `onopen fired — state=${state} queued=${sendQueue.length}`)
    state = "connected"
    for (const msg of sendQueue) {
      console.log(P, `onopen — flushing queued message: ${msg}`)
      ws?.send(msg)
    }
    sendQueue = []
  }
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      console.log(P, `onmessage received: type=${data.type} handlerCount=${handlers.size}`)
      for (const handler of handlers) {
        handler(data)
      }
    } catch {
      console.log(P, `onmessage — parse error for raw:`, event.data)
    }
  }
  ws.onclose = () => {
    console.log(P, `onclose fired — wasState=${state} queueCleared=${sendQueue.length}`)
    state = "disconnected"
    ws = null
    sendQueue = []
    onClose?.()
  }
}

export function close() {
  console.log(P, `close() called — state=${state} hasWs=${!!ws} queueCleared=${sendQueue.length}`)
  sendQueue = []
  reconnectUrl = null
  reconnectOnClose = null
  if (ws) {
    ws.onclose = null
    ws.close()
  }
  ws = null
  state = "disconnected"
}

export function send(msg: Record<string, unknown>) {
  const payload = JSON.stringify(msg)
  console.log(P, `send() — type=${msg.type} payload=${payload} state=${state} queueBefore=${sendQueue.length}`)
  if (state === "connected") {
    ws?.send(payload)
  } else {
    sendQueue.push(payload)
    console.log(P, `send() — queued (state=${state}), queueLen=${sendQueue.length}`)
    if (state === "disconnected" && reconnectUrl) {
      console.log(P, `send() — triggering reconnect`)
      connect(reconnectUrl, reconnectOnClose ?? undefined)
    }
  }
}

export function subscribe(handler: (data: Record<string, unknown>) => void): () => void {
  handlers.add(handler)
  console.log(P, `subscribe — handler added, total=${handlers.size}`)
  return () => {
    handlers.delete(handler)
    console.log(P, `subscribe — handler removed, total=${handlers.size}`)
  }
}

export function getState(): WsState {
  return state
}
