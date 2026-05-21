export const FOCUS_CATEGORIES = [
  "credential-access",
]

export const MITRE_TACTICS = new Set([
  "reconnaissance",
  "resource-development",
  "initial-access",
  "execution",
  "persistence",
  "privilege-escalation",
  "defense-evasion",
  "credential-access",
  "discovery",
  "lateral-movement",
  "collection",
  "command-and-control",
  "exfiltration",
  "impact",
])

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

async function waitForCalderaIP(ludusUrl, apiKey, vmName, timeoutSecs = 120) {
  for (let i = 0; i < timeoutSecs / 5; i++) {
    const range = await apiCall(ludusUrl, apiKey, "/range")
    const vm = range.VMs?.find(v => v.name === vmName)
    if (vm?.ip && vm.ip !== "null") return vm.ip
    await sleep(5000)
  }
  throw new Error(`Timeout waiting for IP on ${vmName}`)
}

export async function fetchCalderaCategories(ludusUrl, apiKey, data) {
  const { label, calderaApiKey } = data
  if (!label) throw new Error("label is required (Kali VM)")
  const calderaKey = calderaApiKey || "ADMIN123"

  const range = await apiCall(ludusUrl, apiKey, "/range")
  const vm = findVM(range.VMs ?? [], label)
  const ip = vm.ip && vm.ip !== "null" ? vm.ip : await waitForCalderaIP(ludusUrl, apiKey, vm.name)

  const res = await fetch(`http://${ip}:8888/api/rest`, {
    method: "POST",
    headers: { "KEY": calderaKey, "Content-Type": "application/json" },
    body: JSON.stringify({ index: "abilities" }),
    signal: AbortSignal.timeout(15000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Caldera API error (${res.status}): ${text}`)
  }

  const abilities = await res.json()
  const allTactics = [...new Set(abilities.map(a => a.tactic).filter(Boolean))].sort()
  const mitreTactics = allTactics.filter(t => MITRE_TACTICS.has(t))

  return { categories: mitreTactics, count: mitreTactics.length }
}
