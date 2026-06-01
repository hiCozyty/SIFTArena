import { createWsHandler, addFetcher, addOperation } from "./poller.js"
import { fetchTemplates, fetchTemplatesWithLog, buildTemplates } from "./templates.js"
import { fetchRangeWithLog, deleteRangeVMs, deployVM, deployAllBaseVMs, deleteVM, deployCustomVM, preloadInventory, updateRangeConfig, fetchSystemInfo, abortRange, restoreToBaseClean, listSnapshots, saveBaseClean, prepareGoldenImage, runAnsibleScript, checkCaldera, fetchRdpConfigs, getVmDefs, listProxmoxVMs } from "./ludus/range.js"
import { fetchFocusedCategoriesAndTechniques } from "./caldera/categories.js"
import { initDatabase, getCustomAbilities, createCustomAbility, updateCustomAbility, deleteCustomAbility } from "./caldera/customAbilities.js"
import { initDatabase as initVmConfigDb, getDeployableVmConfigs, createDeployableVmConfig, updateDeployableVmConfig, deleteDeployableVmConfig } from "./ludus/deployableVmConfigs.js"
import { createRdpProxyHandler } from "./rdp-proxy.js"

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
addOperation("deployCustomVM", deployCustomVM)
addOperation("deployAllBaseVMs", deployAllBaseVMs)
addOperation("prepareGoldenImage", prepareGoldenImage)
addOperation("setRangeConfig", updateRangeConfig)
addOperation("getVmDefs", getVmDefs)
addOperation("listProxmoxVMs", listProxmoxVMs)
addOperation("systemInfo", fetchSystemInfo)
addOperation("abortRange", abortRange)
addOperation("restoreToBaseClean", restoreToBaseClean)
addOperation("listSnapshots", listSnapshots)
addOperation("saveBaseClean", saveBaseClean)
addOperation("runAnsibleScript", runAnsibleScript)
addOperation("checkCaldera", checkCaldera)
addOperation("getRdpConfigs", fetchRdpConfigs)
addFetcher("getFocusedCategoriesAndTechniques", fetchFocusedCategoriesAndTechniques)
addOperation("getFocusedCategoriesAndTechniques", fetchFocusedCategoriesAndTechniques)

addOperation("getCustomAbilities", async () => getCustomAbilities())
addOperation("createCustomAbility", async (_, __, data) => createCustomAbility(data.data))
addOperation("updateCustomAbility", async (_, __, data) => updateCustomAbility(data.data.abilityId, data.data.data))
addOperation("deleteCustomAbility", async (_, __, data) => deleteCustomAbility(data.data.abilityId))

addOperation("getDeployableVmConfigs", async () => getDeployableVmConfigs())
addOperation("createDeployableVmConfig", async (_, __, data) => createDeployableVmConfig(data.data))
addOperation("updateDeployableVmConfig", async (_, __, data) => updateDeployableVmConfig(data.data.id, data.data.data))
addOperation("deleteDeployableVmConfig", async (_, __, data) => deleteDeployableVmConfig(data.data.id))

initDatabase()
initVmConfigDb()

const pollerHandler = createWsHandler(LUDUS_SERVER_URL, LUDUS_API_KEY)
const rdpHandler = createRdpProxyHandler()

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

preloadInventory(LUDUS_SERVER_URL, LUDUS_API_KEY).catch(() => {})

console.log(`Bun API server running on ws://localhost:${BUN_SERVER_PORT}`)
