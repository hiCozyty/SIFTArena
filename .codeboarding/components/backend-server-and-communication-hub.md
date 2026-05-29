---
component_id: 1
component_name: Backend Server & Communication Hub
---

# Backend Server & Communication Hub

## Component Description

Central Node.js server that accepts WebSocket connections, dispatches operations to backend services, broadcasts state updates to connected clients, and performs health monitoring. Acts as the communication backbone between all frontend components and backend infrastructure.

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

### /home/cozyty/Projects/shadowProtocol/server/snapshotTest.js (lines 69-102)
```
async function main() {
  const cmd = Bun.argv[2]
  const label = Bun.argv[3]

  if (!cmd || cmd === "help") {
    console.log("Usage:")
    console.log("  bun test.js list <label>")
    console.log("  bun test.js reset <label>")
    console.log("  bun test.js save <label>")
    console.log("")
    console.log("Examples:")
    console.log("  bun test.js list win11-22h2")
    console.log("  bun test.js reset win11-22h2")
    console.log("  bun test.js save kali")
    process.exit(0)
  }

  const handlers = { list: exampleList, reset: exampleReset, save: exampleSave }
  const handler = handlers[cmd]
  if (!handler) {
    console.error(`Unknown command: ${cmd}. Use "help" for usage.`)
    process.exit(1)
  }
  if (!label) {
    console.error("Missing <label> argument")
    process.exit(1)
  }

  const ws = await connect()
  ws.addEventListener("close", (e) => console.log(`WebSocket closed: code=${e.code} reason="${e.reason}"`))
  ws.addEventListener("error", (e) => console.error("WebSocket error during session:", e.message ?? "no message"))
  await handler(ws, label)
  ws.close()
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
- `web/src/hooks/use-copy-to-clipboard.ts`
- `web/src/hooks/use-health-check.ts`

