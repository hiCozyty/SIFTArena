import { createWsHandler, addFetcher, addOperation } from "./poller.js"
import { fetchTemplates, fetchTemplatesWithLog, buildTemplates } from "./ludus/templates.js"
import { fetchPackerTemplates } from "./ludus/packer-templates.js"
import { fetchRangeWithLog, deleteRangeVMs, deployVM, deployAllBaseVMs, deleteVM, powerOffVM, powerOnVM, deployCustomVM, updateRangeConfig, fetchSystemInfo, abortRange, restoreToBaseClean, listSnapshots, saveBaseClean, prepareGoldenImage, runAnsibleScript, checkCaldera, checkLsaProtection, getVmDefs, listProxmoxVMs, getVMInfo } from "./ludus/range.js"
import { fetchFocusedCategoriesAndTechniques } from "./caldera/categories.js"
import { initDatabase, getCustomAbilities, createCustomAbility, updateCustomAbility, deleteCustomAbility, syncToCaldera } from "./caldera/customAbilities.js"
import { testAbility } from "./caldera/testAbility.js"
import { initDatabase as initVmConfigDb, getDeployableVmConfigs, createDeployableVmConfig, updateDeployableVmConfig, deleteDeployableVmConfig } from "./ludus/deployableVmConfigs.js"
import { initDatabase as initNoiseDb, getNoises, createNoise, updateNoise, deleteNoise } from "./caldera/noises.js"
import { initDatabase as initPlaybookDb, getPlaybooks, createPlaybook, updatePlaybook, deletePlaybook } from "./caldera/playbooks.js"
import { createVncProxyHandler, getOrCreateVncSession } from "./ludus/proxmox.js"
import { createWinrmProxy } from "./ludus/winrm-proxy.js"
import { createSshProxy } from "./ludus/ssh-proxy.js"

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
addOperation("templatesFromPacker", fetchPackerTemplates)
addOperation("healthCheck", healthCheck)
addFetcher("rangeStatus", fetchRangeWithLog)
addOperation("rangeStatus", fetchRangeWithLog)
addOperation("deleteRangeVMs", deleteRangeVMs)
addOperation("deleteVM", deleteVM)
addOperation("powerOffVM", powerOffVM)
addOperation("powerOnVM", powerOnVM)
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
addOperation("checkLsaProtection", checkLsaProtection)
addFetcher("getFocusedCategoriesAndTechniques", fetchFocusedCategoriesAndTechniques)
addOperation("getFocusedCategoriesAndTechniques", fetchFocusedCategoriesAndTechniques)

addOperation("getCustomAbilities", async () => getCustomAbilities())
addOperation("createCustomAbility", async (_, __, data) => createCustomAbility(data.data))
addOperation("updateCustomAbility", async (_, __, data) => updateCustomAbility(data.data.abilityId, data.data.data))
addOperation("deleteCustomAbility", async (_, __, data) => deleteCustomAbility(data.data.abilityId))
addOperation("testAbility", testAbility)

addOperation("getDeployableVmConfigs", async () => getDeployableVmConfigs())
addOperation("createDeployableVmConfig", async (_, __, data) => createDeployableVmConfig(data.data))
addOperation("updateDeployableVmConfig", async (_, __, data) => updateDeployableVmConfig(data.data.id, data.data.data))
addOperation("deleteDeployableVmConfig", async (_, __, data) => deleteDeployableVmConfig(data.data.id))

addOperation("getNoises", async () => getNoises())
addOperation("createNoise", async (_, __, data) => createNoise(data.data))
addOperation("updateNoise", async (_, __, data) => updateNoise(data.data.name, data.data.data))
addOperation("deleteNoise", async (_, __, data) => deleteNoise(data.data.name))

addOperation("getPlaybooks", async () => getPlaybooks())
addOperation("createPlaybook", async (_, __, data) => createPlaybook(data.data))
addOperation("updatePlaybook", async (_, __, data) => updatePlaybook(data.data.name, data.data.data))
addOperation("deletePlaybook", async (_, __, data) => deletePlaybook(data.data.name))

initDatabase()
initVmConfigDb()
initNoiseDb()
initPlaybookDb()
syncToCaldera()

const pollerHandler = createWsHandler(LUDUS_SERVER_URL, LUDUS_API_KEY)
const vncHandler = createVncProxyHandler()
const winrmHandler = createWinrmProxy()
const sshHandler = createSshProxy()

const server = Bun.serve({
  port: BUN_SERVER_PORT,
  async fetch(request, server) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders })
    }

    const url = new URL(request.url)
    
    if (url.pathname.startsWith("/vnc-ticket/")) {
      const vmid = url.pathname.split("/vnc-ticket/")[1]
      return getOrCreateVncSession(vmid)
        .then((info) => new Response(JSON.stringify(info), {
          headers: { "Content-Type": "application/json", ...corsHeaders }
        }))
        .catch((e) => new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders }
        }))
    }

    if (url.pathname.startsWith("/vnc/")) {
      const vmid = url.pathname.split("/vnc/")[1]
      if (vmid && server.upgrade(request, { data: { vmid, isVnc: true } })) {
        return
      }
    }

    if (url.pathname.startsWith("/term/")) {
      const vmid = url.pathname.split("/term/")[1]
      if (!vmid) return new Response(JSON.stringify({ error: "Missing VM ID" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      })

      if (LUDUS_SERVER_URL && LUDUS_API_KEY) {
        try {
          const vm = await getVMInfo(LUDUS_SERVER_URL, LUDUS_API_KEY, vmid)
          if (!vm?.ip) {
            console.log(`[term ${vmid}] VM IP not reachable`)
          } else {
            console.log(`[term ${vmid}] VM found: ${vm.name} (${vm.ip}), isWindows=${vm.isWindows}`)

            if (vm.isWindows) {
              console.log(`[term ${vmid}] Upgrading to WinRM for ${vm.ip}`)
              if (server.upgrade(request, { data: { vmid, isWinrm: true, host: vm.ip, username: "localuser", password: "password" } })) {
                return
              }
              console.log(`[term ${vmid}] WebSocket upgrade to WinRM failed`)
            } else {
              console.log(`[term ${vmid}] Upgrading to SSH for ${vm.ip}`)
              if (server.upgrade(request, { data: { vmid, isSsh: true, host: vm.ip, username: "kali", password: "kali" } })) {
                return
              }
              console.log(`[term ${vmid}] WebSocket upgrade to SSH failed`)
            }
          }
        } catch (err) {
          console.log(`[term ${vmid}] Route error:`, err.message)
        }
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
      if (ws.data?.isVnc) return vncHandler.open(ws)
      if (ws.data?.isWinrm) return winrmHandler.open(ws)
      if (ws.data?.isSsh) return sshHandler.open(ws)
      pollerHandler.open(ws)
    },
    message(ws, message) {
      if (ws.data?.isVnc) return vncHandler.message(ws, message)
      if (ws.data?.isWinrm) return winrmHandler.message(ws, message)
      if (ws.data?.isSsh) return sshHandler.message(ws, message)
      pollerHandler.message(ws, message)
    },
    close(ws, code, reason) {
      if (ws.data?.isVnc) return vncHandler.close(ws, code, reason)
      if (ws.data?.isWinrm) return winrmHandler.close(ws, code, reason)
      if (ws.data?.isSsh) return sshHandler.close(ws, code, reason)
      pollerHandler.close(ws, code, reason)
    },
  },
})

console.log(`Bun API server running on ws://localhost:${BUN_SERVER_PORT}`)
