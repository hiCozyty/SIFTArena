---
component_id: 3
component_name: Attack Simulation Engine
---

# Attack Simulation Engine

## Component Description

Integration layer with MITRE Caldera for fetching atomic red team abilities, managing custom attack techniques, merging ability databases, and generating focused technique data. Provides the attack catalog that drives scenario configuration and training exercises.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/server/caldera/atomic.js (lines 37-99)
```
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
```

### /home/cozyty/Projects/shadowProtocol/server/caldera/custom.js (lines 22-61)
```
function buildAbility(body) {
  const abilityId = generateId()
  const platform = body.platform || "windows"
  const executor = body.executor || DEFAULT_EXECUTOR[platform] || "sh"
  return {
    ability_id: abilityId,
    name: body.name,
    description: body.description || "",
    tactic: body.tactic,
    technique_id: body.technique_id,
    technique_name: body.technique_name || "",
    plugin: "",
    source: "user",
    privilege: "",
    repeatable: false,
    singleton: false,
    delete_payload: true,
    requirements: [],
    buckets: [body.tactic],
    additional_info: {},
    access: {},
    executors: [
      {
        name: executor,
        platform,
        command: body.command,
        code: null,
        language: null,
        build_target: null,
        payloads: [],
        uploads: [],
        timeout: 60,
        parsers: [],
        cleanup: [],
        variations: [],
        additional_info: {},
      },
    ],
  }
}
```

### /home/cozyty/Projects/shadowProtocol/server/caldera/customAbilities.js (lines 54-74)
```
export function createCustomAbility(data) {
  const now = new Date().toISOString()
  const abilityId = crypto.randomUUID().replace(/-/g, "")
  const row = db
    .query(
      `INSERT INTO custom_abilities (ability_id, name, description, tactic, technique_id, technique_name, executors, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    )
    .get(
      abilityId,
      data.name,
      data.description || "",
      data.tactic,
      data.technique_id,
      data.technique_name || "",
      JSON.stringify(data.executors),
      now,
      now
    )
  return toAbility(row)
}
```

### /home/cozyty/Projects/shadowProtocol/server/ansibleScriptTest.js (lines 74-129)
```
async function main() {
  const cmd = Bun.argv[2]
  const label = Bun.argv[3]
  const extra = Bun.argv[4]

  if (!cmd || cmd === "help") {
    console.log("Usage:")
    console.log("  bun ansibleScriptTest.js run <label> <playbook>")
    console.log("  bun ansibleScriptTest.js check <label>")
    console.log("  bun ansibleScriptTest.js reset <label>")
    console.log("  bun ansibleScriptTest.js save <label>")
    console.log("")
    console.log("Examples:")
    console.log("  bun ansibleScriptTest.js run kali ./kaliAnsibleStart.yml")
    console.log("  bun ansibleScriptTest.js run win11-22h2 ./somePlaybook.yml")
    console.log("  bun ansibleScriptTest.js check kali")
    console.log("  bun ansibleScriptTest.js reset win11-22h2")
    console.log("  bun ansibleScriptTest.js save kali")
    process.exit(0)
  }

  const handlers = {
    run:   (ws, label) => exampleRun(ws, label, extra),
    check: (ws, label) => exampleCheck(ws, label),
    reset: (ws, label) => exampleReset(ws, label),
    save:  (ws, label) => exampleSave(ws, label),
  }
  const handler = handlers[cmd]
  if (!handler) {
    console.error(`Unknown command: ${cmd}. Use "help" for usage.`)
    process.exit(1)
  }
  if (!label) {
    console.error("Missing <label> argument")
    process.exit(1)
  }
  if (cmd === "run" && !extra) {
    console.error("Missing <playbook> argument")
    process.exit(1)
  }

  const ws = await connect()

  ws.addEventListener("message", (e) => {
    const data = JSON.parse(e.data)
    if (data.type === "ansibleLog") {
      if (data.line) console.log(data.line)
      if (data.state) console.log(`[${data.state}]`)
    }
  })

  ws.addEventListener("close", (e) => console.log(`WebSocket closed: code=${e.code} reason="${e.reason}"`))
  ws.addEventListener("error", (e) => console.error("WebSocket error during session:", e.message ?? "no message"))
  await handler(ws, label)
  ws.close()
}
```

### /home/cozyty/Projects/shadowProtocol/server/caldera/categories.js (lines 12-27)
```
export async function fetchFocusedCategoriesAndTechniques() {
  const result = { ...focusedTechniques }
  for (const cat of result.categories) {
    const catTechs = result.techniques[cat]
    if (!catTechs) continue
    for (const tid of Object.keys(catTechs)) {
      const seen = new Set()
      catTechs[tid].abilities = catTechs[tid].abilities.filter((ab) => {
        if (seen.has(ab.ability_id)) return false
        seen.add(ab.ability_id)
        return true
      })
    }
  }
  return result
}
```


## Source Files:

- `server/caldera/atomic.js`
- `server/caldera/categories.js`
- `server/caldera/custom.js`
- `server/caldera/customAbilities.js`
- `server/caldera/generateFocusedData.js`

