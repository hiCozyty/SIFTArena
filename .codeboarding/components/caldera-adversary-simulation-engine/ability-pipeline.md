---
component_id: 3.2
component_name: Ability Pipeline
---

# Ability Pipeline

## Component Description

Generates focused training data by fetching abilities from both Caldera API and local SQLite, then deduplicating, filtering by executor type (PowerShell/cmd), and enriching with payload metadata.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/server/caldera/generateFocusedData.js (lines 37-50)
```
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
```

### /home/cozyty/Projects/shadowProtocol/server/caldera/generateFocusedData.js (lines 142-160)
```
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
```

### /home/cozyty/Projects/shadowProtocol/server/caldera/generateFocusedData.js (lines 28-35)
```
function filterExecutors(ability) {
  const hasPsh = ability.executors.some(e => e.name === "psh" && e.platform === "windows")
  const filtered = ability.executors.filter(e => e.platform === "windows")
  return {
    ...ability,
    executors: hasPsh ? filtered.filter(e => e.name === "psh") : filtered,
  }
}
```

### /home/cozyty/Projects/shadowProtocol/server/caldera/generateFocusedData.js (lines 101-125)
```
function enrichPayloads(ability) {
  const desc = ability.description || ""
  const cmds = ability.executors?.map(e => e.command || "").join("\n") || ""

  if (!desc.includes("PathToAtomicsFolder") && !cmds.includes("PathToAtomicsFolder")) {
    return ability
  }

  const hasPayloads = ability.executors?.some(e => (e.payloads || []).length > 0)
  if (hasPayloads) return ability

  const filename = extractPayloadFilename(cmds) || extractPayloadFilename(desc)
  if (!filename) return ability

  const info = PAYLOAD_DOWNLOADS[filename] || PAYLOAD_DOWNLOADS[Object.keys(PAYLOAD_DOWNLOADS).find(k => filename.includes(k))]
  if (!info) return ability

  return {
    ...ability,
    download_instructions: `${PREREQ_HEADER}

Payload: ${info.name}
${info.steps}`,
  }
}
```


