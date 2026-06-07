const CALDERA_URL = "http://10.1.99.1:8888"
const CALDERA_KEY = "ADMIN123"
const OUT_FILE = import.meta.dir + "/focusedTechniques.json"

const CATEGORIES = {
  "credential-access": [
    "T1003.001",
  ],
}

const VALID_TECHNIQUES = new Set(Object.values(CATEGORIES).flat())

const EXCLUDE_ABILITY_IDS = new Set([
  "bbc786e45aff314d33e60133f010f00c", // Dump LSASS.exe using lolbin rdrleakdiag.exe (doesn't produce files on Win11 22H2)
  "7049e3ec-b822-4fdf-a4ac-18190f9b66d1", // Powerkatz (Staged) — deprecated on Win11
  "baac2c6d-4652-4b7e-ab0a-f1bf246edd12", // Run PowerKatz — deprecated on Win11
  "82dcefb5c3512d73bf2248cb0127c4ae", // Powershell Mimikatz — deprecated on Win11
])

async function fetchAbilities() {
  const res = await fetch(`${CALDERA_URL}/api/rest`, {
    method: "POST",
    headers: { "KEY": CALDERA_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ index: "abilities" }),
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`Caldera API error (${res.status}): ${await res.text()}`)
  return await res.json()
}

function hasWindowsExecutor(ability) {
  return ability.executors?.some(e => e.platform === "windows")
}

function filterExecutors(ability) {
  const hasPsh = ability.executors.some(e => e.name === "psh" && e.platform === "windows")
  const filtered = ability.executors.filter(e => e.platform === "windows")
  return {
    ...ability,
    executors: hasPsh ? filtered.filter(e => e.name === "psh") : filtered,
  }
}

function build() {
  const techniques = {}
  for (const cat of Object.keys(CATEGORIES)) {
    techniques[cat] = {}
    for (const tid of CATEGORIES[cat]) {
      techniques[cat][tid] = { technique_name: null, abilities: [] }
    }
  }

  return {
    categories: Object.keys(CATEGORIES),
    techniques,
  }
}

import CUSTOM_ABILITY_OVERRIDES from "./customCommandEnrichment.js"
import WIN_PREREQS from "./customWinReqEnrichment.js"

function enrichWinReq(ability) {
  const prereq = WIN_PREREQS[ability.ability_id]
  if (!prereq) return ability
  return { ...ability, win_prereq: prereq }
}

function enrichCustom(ability) {
  const override = CUSTOM_ABILITY_OVERRIDES[ability.ability_id]
  if (!override) return ability

  const executors = ability.executors.map(e => {
    if (e.platform !== "windows") return e
    if (override.executor) {
      return { ...e, command: override.command, name: override.executor }
    }
    if (e.name === "psh") {
      return { ...e, command: override.command }
    }
    return e
  })

  return {
    ...ability,
    executors,
    win_prereq: override.win_prereq || ability.win_prereq || "",
  }
}

function strip(ability) {
  const executor = ability.executors?.[0] ?? {}
  return {
    ability_id: ability.ability_id,
    name: ability.name,
    description: ability.description ?? "",
    command: executor.command ?? "",
    win_prereq: ability.win_prereq ?? "",
  }
}

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/\(cmd\)/gi, "")
    .replace(/\(powershell\)/gi, "")
    .replace(/- powershell/gi, "")
    .replace(/- cmd/gi, "")
    .replace(/via command prompt/gi, "")
    .replace(/via powershell/gi, "")
    .replace(/with powershell/gi, "")
    .replace(/with cmd/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

function deduplicate(abilities) {
  const pshOnly = abilities.filter(a => a.executors.every(e => e.name === "psh"))
  const cmdOnly = abilities.filter(a => a.executors.every(e => e.name === "cmd"))
  const mixed = abilities.filter(a => a.executors.some(e => e.name === "psh") && a.executors.some(e => e.name === "cmd"))

  const pshNames = new Set(pshOnly.map(a => normalizeName(a.name)))
  const keep = [...pshOnly, ...mixed]
  const removed = []

  for (const a of cmdOnly) {
    if (pshNames.has(normalizeName(a.name))) {
      removed.push(a.name)
    } else {
      keep.push(a)
    }
  }

  return { keep, removed }
}

async function main() {
  const abilities = await fetchAbilities()
  const filtered = abilities.filter(a => VALID_TECHNIQUES.has(a.technique_id) && hasWindowsExecutor(a))
  const result = build()

  for (const ability of filtered) {
    if (EXCLUDE_ABILITY_IDS.has(ability.ability_id)) continue

    const cat = ability.tactic
    const tid = ability.technique_id
    if (!result.techniques[cat]?.[tid]) continue

    if (!result.techniques[cat][tid].technique_name) {
      result.techniques[cat][tid].technique_name = ability.technique_name
    }

    const seen = result.techniques[cat][tid].abilities.map(a => a.ability_id)
    if (!seen.includes(ability.ability_id)) {
      result.techniques[cat][tid].abilities.push(enrichCustom(enrichWinReq(filterExecutors(ability))))
    }
  }

  // Deduplicate: remove cmd-only abilities when a psh-only version exists
  let totalRemoved = 0
  for (const cat of result.categories) {
    for (const tid of Object.keys(result.techniques[cat])) {
      const { keep, removed } = deduplicate(result.techniques[cat][tid].abilities)
      if (removed.length > 0) {
        result.techniques[cat][tid].abilities = keep
        totalRemoved += removed.length
      }
    }
  }

  // Remove techniques with no abilities
  for (const cat of result.categories) {
    for (const tid of Object.keys(result.techniques[cat])) {
      if (result.techniques[cat][tid].abilities.length === 0) {
        delete result.techniques[cat][tid]
      }
    }
    if (Object.keys(result.techniques[cat]).length === 0) {
      delete result.techniques[cat]
    }
  }

  // Strip abilities to only needed fields
  for (const cat of result.categories) {
    const catTechs = result.techniques[cat]
    if (!catTechs) continue
    for (const tid of Object.keys(catTechs)) {
      catTechs[tid].abilities = catTechs[tid].abilities.map(strip)
    }
  }

  // Stats
  let totalAbilities = 0
  let totalTechs = 0
  for (const cat of result.categories) {
    if (!result.techniques[cat]) continue
    const techs = result.techniques[cat]
    totalTechs += Object.keys(techs).length
    for (const [tid, t] of Object.entries(techs)) {
      totalAbilities += t.abilities.length
      }
  }
  Bun.write(OUT_FILE, JSON.stringify(result, null, 2))
  const size = (Bun.file(OUT_FILE).size / 1024).toFixed(1)
  }

main().catch(err => {
  console.error("Error:", err.message)
  process.exit(1)
})
