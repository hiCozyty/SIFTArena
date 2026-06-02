// Disable TLS verification for self-signed Proxmox certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"

const PROXMOX_HOST = process.env.PROXMOX_HOST
const PROXMOX_USER = process.env.PROXMOX_USER
const PROXMOX_PASSWORD = process.env.PROXMOX_PASSWORD
const PROXMOX_REALM = process.env.PROXMOX_REALM || "pam"
const PROXMOX_NODE = process.env.PROXMOX_NODE

const TLS_OPTS = { rejectUnauthorized: false }

let authTicket = null
let csrfToken = null
let authExpiry = 0
let nodeName = null

const pendingSessions = new Map()

function buildUser() {
  return PROXMOX_USER.includes("@") ? PROXMOX_USER : `${PROXMOX_USER}@${PROXMOX_REALM}`
}

function proxmoxUrl(path) {
  return `${PROXMOX_HOST}/api2/json${path}`
}

async function createTicket() {
  const user = buildUser()
  const body = new URLSearchParams()
  body.append("username", user)
  body.append("password", PROXMOX_PASSWORD)

  const res = await fetch(proxmoxUrl("/access/ticket"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    tls: TLS_OPTS,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Proxmox auth failed (${res.status}): ${text}`)
  }

  const json = await res.json()
  authTicket = json.data.ticket
  csrfToken = json.data.CSRFPreventionToken
  authExpiry = Date.now() + 1.5 * 60 * 60 * 1000
}

async function ensureAuth() {
  if (authTicket && Date.now() < authExpiry - 60000) return
  await createTicket()
}

async function ensureNode() {
  if (nodeName) return nodeName
  if (PROXMOX_NODE) {
    nodeName = PROXMOX_NODE
    return nodeName
  }
  await ensureAuth()

  const res = await fetch(proxmoxUrl("/nodes"), {
    headers: { Cookie: `PVEAuthCookie=${authTicket}` },
    tls: TLS_OPTS,
  })

  if (!res.ok) throw new Error(`Proxmox nodes failed: ${res.status}`)
  const json = await res.json()
  if (!json.data?.length) throw new Error("No Proxmox nodes found")
  nodeName = json.data[0].node
  return nodeName
}

async function getVncInfo(vmid) {
  const node = await ensureNode()
  await ensureAuth()

  const res = await fetch(proxmoxUrl(`/nodes/${node}/qemu/${vmid}/vncproxy`), {
    method: "POST",
    headers: {
      Cookie: `PVEAuthCookie=${authTicket}`,
      CSRFPreventionToken: csrfToken,
    },
    tls: TLS_OPTS,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`VNC proxy failed for VM ${vmid} (${res.status}): ${text}`)
  }

  const json = await res.json()
  return { port: json.data.port, ticket: json.data.ticket }
}

async function getOrCreateVncSession(vmid) {
  const existing = pendingSessions.get(vmid)
  if (existing && Date.now() < existing.expiresAt) {
    return existing
  }
  const info = await getVncInfo(vmid)
  const session = { ...info, expiresAt: Date.now() + 8000 }
  pendingSessions.set(vmid, session)
  return session
}

function vncWebSocketUrl(node, vmid, port, ticket) {
  const host = new URL(PROXMOX_HOST).host
  const encodedTicket = encodeURIComponent(ticket)
  return `wss://${host}/api2/json/nodes/${node}/qemu/${vmid}/vncwebsocket?port=${port}&vncticket=${encodedTicket}`
}

export function createVncProxyHandler(config = {}) {
  const getVncInfoFn = config.getVncInfo || getOrCreateVncSession
  const wSOptionsFn = config.websocketOptions || (() => ({
    tls: TLS_OPTS,
    headers: { Cookie: `PVEAuthCookie=${authTicket}` },
  }))

  const activeSessions = new Map()

  return {
    open(ws) {
      const vmid = ws.data?.vmid
      console.log(`[vnc ${vmid}] Browser WebSocket opened`)
      if (!vmid) {
        console.error("[vnc ?] No VM ID in WebSocket data")
        ws.close(1008, "Missing VM ID")
        return
      }

      if (activeSessions.has(vmid)) {
        console.log(`[vnc ${vmid}] Aborting existing session`)
        activeSessions.get(vmid).abort()
        activeSessions.delete(vmid)
      }

      ws.binaryType = "arraybuffer"
      let proxmoxWs = null
      let aborted = false

      let proxmoxHeartbeat = null

      const heartbeat = setInterval(() => {
        if (ws.readyState === 1) ws.ping()
      }, 30000)

      function abort() {
        aborted = true
        clearInterval(heartbeat)
        if (proxmoxHeartbeat) clearInterval(proxmoxHeartbeat)
        if (proxmoxWs) {
          proxmoxWs.close()
          proxmoxWs = null
        }
      }

      activeSessions.set(vmid, { abort, proxmoxWs: null })

      getVncInfoFn(vmid)
      .then((info) => {
        if (aborted) return

        if (activeSessions.get(vmid)?.abort !== abort) {
          console.log(`[vnc ${vmid}] Session superseded, dropping`)
          return
        }

        const url = info.url || vncWebSocketUrl(nodeName, vmid, info.port, info.ticket)
        console.log(`[vnc ${vmid}] Info: port=${info.port}, ticket=${info.ticket?.slice(0, 20)}...`)

        proxmoxWs = new WebSocket(url, wSOptionsFn())
        proxmoxWs.binaryType = "arraybuffer"

        proxmoxHeartbeat = setInterval(() => {
          if (proxmoxWs?.readyState === 1) proxmoxWs.ping()
        }, 60000)

        activeSessions.set(vmid, { abort, proxmoxWs })

        proxmoxWs.onopen = () => {
          if (aborted) { proxmoxWs.close(); return }
          console.log(`[vnc ${vmid}] Proxmox WebSocket connected`)
        }

        proxmoxWs.onmessage = (event) => {
          if (aborted) return
          if (ws.readyState === 1) {
            if (event.data instanceof ArrayBuffer || ArrayBuffer.isView(event.data)) {
              ws.send(event.data, true)
            } else {
              ws.send(event.data)
            }
          }
        }

        proxmoxWs.onerror = (event) => {
          console.error(`[vnc ${vmid}] Proxmox WS error:`, event?.message || event?.type || "unknown")
          if (ws.readyState === 1) ws.close(1011, "Connection failed")
        }

        proxmoxWs.onclose = (event) => {
          console.log(`[vnc ${vmid}] Proxmox WS closed (code: ${event?.code || "?"}, reason: ${event?.reason || "?"})`)
          if (ws.readyState === 1) ws.close()
        }
      })
      .catch((err) => {
        console.error(`[vnc ${vmid}] Setup error:`, err.message)
        activeSessions.delete(vmid)
        if (ws.readyState === 1) ws.close(1011, err.message)
      })
    },
    message(ws, message) {
      const vmid = ws.data?.vmid
      const session = activeSessions.get(vmid)
      if (session?.proxmoxWs?.readyState === 1) {
        session.proxmoxWs.send(message)
      }
    },
    close(ws, code, reason) {
      const vmid = ws.data?.vmid
      console.log(`[vnc ${vmid}] Browser WebSocket closed (code: ${code}, reason: ${reason})`)
      const session = activeSessions.get(vmid)
      if (session) {
        session.abort()
        activeSessions.delete(vmid)
      }
    },
  }
}

function getAuthTicket() {
  return authTicket
}

export { ensureAuth, ensureNode, getVncInfo, getOrCreateVncSession, createTicket, getAuthTicket }
