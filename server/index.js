import { createWsHandler, addFetcher, addOperation } from "./poller.js"
import { fetchTemplates, fetchTemplatesWithLog, buildTemplates } from "./templates.js"
import { fetchRangeWithLog, deleteRangeVMs, deployVM } from "./range.js"

const LUDUS_SERVER_URL = process.env.LUDUS_SERVER_URL + "/api/v2"
const LUDUS_API_KEY = process.env.LUDUS_API_KEY
const BUN_SERVER_PORT = parseInt(process.env.BUN_SERVER_PORT)

console.log("CWD:", process.cwd())
console.log("LUDUS_SERVER_URL:", process.env.LUDUS_SERVER_URL)
console.log("LUDUS_API_KEY (first 5):", process.env.LUDUS_API_KEY?.slice(0, 5))
console.log("BUN_SERVER_PORT:", process.env.BUN_SERVER_PORT)

function maskKey(key) {
  if (!key) return undefined
  if (key.length <= 8) return key.slice(0, 3) + "****"
  return key.slice(0, 3) + "****" + key.slice(-3)
}

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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-API-KEY",
}

addFetcher("templatesList", fetchTemplatesWithLog)
addOperation("templatesList", fetchTemplates)
addOperation("buildTemplates", buildTemplates)
addOperation("healthCheck", healthCheck)
addFetcher("rangeStatus", fetchRangeWithLog)
addOperation("rangeStatus", fetchRangeWithLog)
addOperation("deleteRangeVMs", deleteRangeVMs)
addOperation("deployVM", deployVM)

const server = Bun.serve({
  port: BUN_SERVER_PORT,
  fetch(request, server) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders })
    }

    if (server.upgrade(request)) {
      return
    }

    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    })
  },
  websocket: createWsHandler(LUDUS_SERVER_URL, LUDUS_API_KEY),
})

console.log(`Bun API server running on ws://localhost:${BUN_SERVER_PORT}`)
