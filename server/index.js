import { createWsHandler, addFetcher, addOperation } from "./poller.js"
import { fetchTemplates, fetchTemplatesWithLog, buildTemplates } from "./ludus/templates.js"
import { fetchRangeWithLog, deleteRangeVMs, deployVM, deployAllBaseVMs, deleteVM, preloadInventory, fetchRangeConfig, updateRangeConfig, fetchSystemInfo, abortRange, restoreToBaseClean, listSnapshots, saveBaseClean, prepareGoldenImage, runAnsibleScript, checkCaldera } from "./ludus/range.js"
import { fetchCalderaCategories } from "./caldera/categories.js"
import { fetchAtomicAbilities } from "./caldera/atomic.js"
import { createAbility, getCustomAbilities, getCustomAbility } from "./caldera/custom.js"

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
addOperation("deleteVM", deleteVM)
addOperation("deployVM", deployVM)
addOperation("deployAllBaseVMs", deployAllBaseVMs)
addOperation("prepareGoldenImage", prepareGoldenImage)
addOperation("getRangeConfig", fetchRangeConfig)
addOperation("setRangeConfig", updateRangeConfig)
addOperation("systemInfo", fetchSystemInfo)
addOperation("abortRange", abortRange)
addOperation("restoreToBaseClean", restoreToBaseClean)
addOperation("listSnapshots", listSnapshots)
addOperation("saveBaseClean", saveBaseClean)
addOperation("runAnsibleScript", runAnsibleScript)
addOperation("checkCaldera", checkCaldera)
addOperation("getCalderaCategories", fetchCalderaCategories)
addOperation("getAtomicAbilities", fetchAtomicAbilities)
addOperation("createAbility", createAbility)
addOperation("getCustomAbilities", getCustomAbilities)
addOperation("getCustomAbility", getCustomAbility)

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

preloadInventory(LUDUS_SERVER_URL, LUDUS_API_KEY).catch(() => {})

console.log(`Bun API server running on ws://localhost:${BUN_SERVER_PORT}`)
