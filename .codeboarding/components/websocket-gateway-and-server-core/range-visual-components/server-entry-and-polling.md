---
component_id: 1.6.3
component_name: Server Entry & Polling
---

# Server Entry & Polling

## Component Description

The Bun server entry point (index.js) with operation registrations, health check, and the 1-second polling engine (poller.js) that fans Ludus status to subscribed clients.

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

### /home/cozyty/Projects/shadowProtocol/server/poller.js (lines 7-11)
```
function broadcast(type, data, error, extra = {}) {
  if (client && subscriptions.has(type)) {
    client.send(JSON.stringify(error ? { type, error } : { type, result: data, ...extra }))
  }
}
```


## Source Files:

- `server/index.js`
- `server/poller.js`
- `web/src/components/app/authenticated-app.tsx`

