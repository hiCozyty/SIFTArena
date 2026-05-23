const CALDERA_URL = "http://10.1.99.1:8888"
const CALDERA_KEY = "ADMIN123"
const OUT_FILE = import.meta.dir + "/focusedTechniques.json"

const CATEGORIES = {
  "credential-access": [
    "T1003", "T1003.001", "T1003.002", "T1003.003", "T1003.004",
    "T1003.005", "T1003.006", "T1040", "T1055.002", "T1110.001",
    "T1110.002", "T1110.003", "T1110.004", "T1187", "T1539", "T1552",
    "T1552.001", "T1552.002", "T1552.004", "T1552.006", "T1555",
    "T1555.003", "T1555.004", "T1558.001", "T1558.002", "T1558.003",
    "T1558.004", "T1649",
  ],
  "privilege-escalation": [
    "T1548.002",
  ],
}

const VALID_TECHNIQUES = new Set(Object.values(CATEGORIES).flat())

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
  console.log("Fetching all abilities from Caldera...")
  const abilities = await fetchAbilities()
  console.log(`Total abilities: ${abilities.length}`)

  const filtered = abilities.filter(a => VALID_TECHNIQUES.has(a.technique_id) && hasWindowsExecutor(a))
  console.log(`Windows abilities in focused techniques: ${filtered.length}`)

  const result = build()

  for (const ability of filtered) {
    const cat = ability.tactic
    const tid = ability.technique_id
    if (!result.techniques[cat]?.[tid]) continue

    if (!result.techniques[cat][tid].technique_name) {
      result.techniques[cat][tid].technique_name = ability.technique_name
    }

    const seen = result.techniques[cat][tid].abilities.map(a => a.ability_id)
    if (!seen.includes(ability.ability_id)) {
      result.techniques[cat][tid].abilities.push(filterExecutors(ability))
    }
  }

  // Deduplicate: remove cmd-only abilities when a psh-only version exists
  let totalRemoved = 0
  for (const cat of result.categories) {
    for (const tid of Object.keys(result.techniques[cat])) {
      const { keep, removed } = deduplicate(result.techniques[cat][tid].abilities)
      if (removed.length > 0) {
        result.techniques[cat][tid].abilities = keep
        console.log(`  Deduped ${tid}: removed ${removed.length} cmd duplicate(s): ${removed.join(", ")}`)
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

  // Stats
  let totalAbilities = 0
  let totalTechs = 0
  for (const cat of result.categories) {
    if (!result.techniques[cat]) continue
    const techs = result.techniques[cat]
    totalTechs += Object.keys(techs).length
    for (const [tid, t] of Object.entries(techs)) {
      totalAbilities += t.abilities.length
      console.log(`  ${cat}/${tid}: ${t.technique_name} (${t.abilities.length} abilities)`)
    }
  }
  console.log(`\nTotal: ${totalAbilities} abilities across ${totalTechs} techniques (${totalRemoved} duplicates removed)`)

  Bun.write(OUT_FILE, JSON.stringify(result, null, 2))
  const size = (Bun.file(OUT_FILE).size / 1024).toFixed(1)
  console.log(`\nWrote ${OUT_FILE} (${size} KB)`)
}

main().catch(err => {
  console.error("Error:", err.message)
  process.exit(1)
})
