import { CATEGORY_TECHNIQUES } from "./focus.js"
import { getCustomAbilities, getCustomAbility } from "./custom.js"

function findVM(vms, label) {
  const vm = vms.find(v => v.name === label || v.name?.includes(label))
  if (!vm) throw new Error(`VM matching "${label}" not found`)
  return vm
}

async function apiCall(ludusUrl, apiKey, path, method = "GET", body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
    tls: { rejectUnauthorized: false },
  }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const response = await fetch(`${ludusUrl}${path}`, opts)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || `Ludus API error: ${response.status}`)
  return data
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForIP(ludusUrl, apiKey, vmName, timeoutSecs = 120) {
  for (let i = 0; i < timeoutSecs / 5; i++) {
    const range = await apiCall(ludusUrl, apiKey, "/range")
    const vm = range.VMs?.find(v => v.name === vmName)
    if (vm?.ip && vm.ip !== "null") return vm.ip
    await sleep(5000)
  }
  throw new Error(`Timeout waiting for IP on ${vmName}`)
}

export async function fetchAtomicAbilities(ludusUrl, apiKey, data) {
  const { label, calderaApiKey, techniqueId, abilityId } = data
  if (!label) throw new Error("label is required (Kali VM)")
  const calderaKey = calderaApiKey || "ADMIN123"

  const range = await apiCall(ludusUrl, apiKey, "/range")
  const vm = findVM(range.VMs ?? [], label)
  const ip = vm.ip && vm.ip !== "null" ? vm.ip : await waitForIP(ludusUrl, apiKey, vm.name)

  const [calderaAbilities, customResp] = await Promise.all([
    fetchCalderaAbilities(ip, calderaKey),
    getCustomAbilities(ludusUrl, apiKey, {}).catch(() => ({ abilities: [] })),
  ])
  const customAbilities = customResp.abilities || []

  const validIds = new Set(Object.values(CATEGORY_TECHNIQUES).flat())
  const filtered = calderaAbilities.filter(a => validIds.has(a.technique_id))

  if (abilityId) {
    const calderaAbility = filtered.find(a => a.ability_id === abilityId)
    if (calderaAbility) return calderaAbility
    return await getCustomAbility(ludusUrl, apiKey, data)
  }

  if (techniqueId) {
    const fromCaldera = filtered.filter(a => a.technique_id === techniqueId)
    const fromCustom = customAbilities.filter(a => a.technique_id === techniqueId)
    const merged = [
      ...fromCaldera.map(a => ({ ability_id: a.ability_id, name: a.name, description: a.description, tactic: a.tactic, technique_id: a.technique_id, technique_name: a.technique_name, source: "atomic" })),
      ...fromCustom,
    ]
    const techniqueName = fromCaldera[0]?.technique_name || fromCustom[0]?.technique_name || null
    return { technique_id: techniqueId, technique_name: techniqueName, count: merged.length, abilities: merged }
  }

  const grouped = {}
  for (const ability of filtered) {
    const t = ability.technique_id
    if (!grouped[t]) {
      grouped[t] = { technique_id: t, technique_name: ability.technique_name, tactic: ability.tactic, count: 0, abilities: [] }
    }
    grouped[t].count++
    grouped[t].abilities.push({ ability_id: ability.ability_id, name: ability.name, source: "atomic" })
  }
  for (const ability of customAbilities) {
    const t = ability.technique_id
    if (!grouped[t]) {
      grouped[t] = { technique_id: t, technique_name: ability.technique_name || null, tactic: ability.tactic, count: 0, abilities: [] }
    }
    grouped[t].count++
    grouped[t].abilities.push({ ability_id: ability.ability_id, name: ability.name, source: "user" })
  }

  return {
    categories: Object.keys(CATEGORY_TECHNIQUES),
    techniques: Object.fromEntries(
      Object.entries(CATEGORY_TECHNIQUES).map(([cat, techs]) => [
        cat,
        techs.map(tid => grouped[tid] || { technique_id: tid, technique_name: null, count: 0, abilities: [] }),
      ])
    ),
  }
}

async function fetchCalderaAbilities(ip, apiKey) {
  const res = await fetch(`http://${ip}:8888/api/rest`, {
    method: "POST",
    headers: { "KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ index: "abilities" }),
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Caldera API error (${res.status}): ${text}`)
  }
  return await res.json()
}
