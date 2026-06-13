const fetchers = []
const operations = new Map()
let polling = false
let client = null
const subscriptions = new Set()

function broadcast(type, data, error, extra = {}) {
  if (client && subscriptions.has(type)) {
    client.send(JSON.stringify(error ? { type, error } : { type, result: data, ...extra }))
  }
}

export function addFetcher(type, fetchFn) {
  fetchers.push({ type, fetchFn })
}

export function addOperation(type, handler) {
  operations.set(type, handler)
}

export function createWsHandler(ludusUrl, apiKey) {
  if (!polling) {
    polling = true
    setInterval(async () => {
      for (const { type, fetchFn } of fetchers) {
        if (!client || !subscriptions.has(type)) continue
        try {
          const result = await fetchFn(ludusUrl, apiKey)
          const [data, extra] = Array.isArray(result) ? result : [result, {}]
          broadcast(type, data, null, extra)
        } catch (err) {
          broadcast(type, null, err.message)
        }
      }
    }, 1000)
  }

  return {
    open(ws) {
      client = ws
      ws.send(JSON.stringify({ type: "connected" }))
      ws.heartbeat = setInterval(() => {
        if (ws.readyState === 1) ws.ping()
      }, 30000)
    },
    message(ws, message) {
      try {
        const data = JSON.parse(message)

        if (data.type === "subscribe") { subscriptions.add(data.channel); return }
        if (data.type === "unsubscribe") { subscriptions.delete(data.channel); return }

        const handler = operations.get(data.type)
        if (handler) {
          const result = handler(ludusUrl, apiKey, data, ws)
          if (result instanceof Promise) {
            const t0 = performance.now()
            result
              .then(r => {
                if (r !== undefined) ws.send(JSON.stringify({ type: data.type, result: r }))
              })
              .catch(err => {
                ws.send(JSON.stringify({ type: data.type, error: err.message }))
              })
          }
        }
      } catch {}
    },
    close(ws) {
      clearInterval(ws.heartbeat)
      if (client === ws) {
        client = null
        subscriptions.clear()
      }
    },
  }
}
