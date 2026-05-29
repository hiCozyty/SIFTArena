---
component_id: 1
component_name: WebSocket Gateway & Server Core
---

# WebSocket Gateway & Server Core

## Component Description

Central BFF (Backend-for-Frontend) — a thin Bun server that owns all WebSocket lifecycle, request routing, and the 1-second polling loop that fans Ludus and Caldera state to subscribed frontend clients. All frontend-to-backend communication flows through this single entry point.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/server/index.js (lines 80-115)
```
const server = Bun.serve({
  port: BUN_SERVER_PORT,
  fetch(request, server) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders })
    }

    const url = new URL(request.url)
    if (url.pathname.startsWith("/rdp/")) {
      const vmIp = url.pathname.split("/rdp/")[1]
      if (vmIp && server.upgrade(request, { data: { vmIp, isRdp: true } })) {
        return
      }
    }

    if (server.upgrade(request)) {
      return
    }

    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    })
  },
  websocket: {
    open(ws) {
      (ws.data?.isRdp ? rdpHandler : pollerHandler).open(ws)
    },
    message(ws, message) {
      (ws.data?.isRdp ? rdpHandler : pollerHandler).message(ws, message)
    },
    close(ws, code, reason) {
      (ws.data?.isRdp ? rdpHandler : pollerHandler).close(ws, code, reason)
    },
  },
})
```

### /home/cozyty/Projects/shadowProtocol/server/poller.js (lines 21-65)
```
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
    },
    message(ws, message) {
      try {
        const data = JSON.parse(message)

        if (data.type === "subscribe") { subscriptions.add(data.channel); return }
        if (data.type === "unsubscribe") { subscriptions.delete(data.channel); return }

        const handler = operations.get(data.type)
        if (handler) {
          handler(ludusUrl, apiKey, data, ws)
            .then(result => ws.send(JSON.stringify({ type: data.type, result })))
            .catch(err => ws.send(JSON.stringify({ type: data.type, error: err.message })))
        }
      } catch {}
    },
    close(ws) {
      if (client === ws) {
        client = null
        subscriptions.clear()
      }
    },
  }
}
```

### /home/cozyty/Projects/shadowProtocol/server/poller.js (lines 13-15)
```
export function addFetcher(type, fetchFn) {
  fetchers.push({ type, fetchFn })
}
```

### /home/cozyty/Projects/shadowProtocol/server/poller.js (lines 17-19)
```
export function addOperation(type, handler) {
  operations.set(type, handler)
}
```

### /home/cozyty/Projects/shadowProtocol/server/index.js (lines 23-38)
```
async function healthCheck() {
  if (!LUDUS_SERVER_URL) return { status: "missing LUDUS_SERVER_URL" }
  if (!LUDUS_API_KEY) return { status: "missing LUDUS_API_KEY" }

  try {
    const res = await fetch(`${LUDUS_SERVER_URL}/`, {
      headers: { "X-API-KEY": LUDUS_API_KEY },
      tls: { rejectUnauthorized: false },
    })
    const data = await res.json()
    if (!res.ok) return { status: "error", error: data.error || `HTTP ${res.status}` }
    return { status: "ok", version: data.version }
  } catch (err) {
    return { status: "error", error: err.message }
  }
}
```


## Source Files:

- `server/ansibleScriptTest.js`
- `server/index.js`
- `server/poller.js`
- `server/range.js`
- `server/rdp-proxy.js`
- `server/snapshotTest.js`
- `server/templates.js`
- `web/src/components/app/app-layout.tsx`
- `web/src/components/app/authenticated-app.tsx`
- `web/src/components/ui/typing-indicator.tsx`

