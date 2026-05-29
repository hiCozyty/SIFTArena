---
component_id: 3
component_name: Caldera Adversary Simulation Engine
---

# Caldera Adversary Simulation Engine

## Component Description

Integrates with MITRE Caldera for automated adversary emulation. Manages attack abilities (local SQLite CRUD), fetches MITRE ATT&CK categories and techniques, and generates focused training data. Powers the attack configuration workspace.

---

## Key References:

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

### /home/cozyty/Projects/shadowProtocol/server/caldera/customAbilities.js (lines 9-26)
```
export function initDatabase() {
  mkdirSync(join(import.meta.dir, "..", "data"), { recursive: true })
  db = new Database(DB_PATH, { create: true })
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_abilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ability_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      tactic TEXT NOT NULL,
      technique_id TEXT NOT NULL,
      technique_name TEXT DEFAULT '',
      executors TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
}
```

### /home/cozyty/Projects/shadowProtocol/server/caldera/customAbilities.js (lines 49-52)
```
export function getCustomAbilities() {
  const rows = db.query("SELECT * FROM custom_abilities ORDER BY created_at DESC").all()
  return rows.map(toAbility)
}
```

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

### /home/cozyty/Projects/shadowProtocol/server/caldera/atomic.js (lines 101-113)
```
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
```


## Source Files:

- `server/caldera/atomic.js`
- `server/caldera/categories.js`
- `server/caldera/custom.js`
- `server/caldera/customAbilities.js`
- `server/caldera/generateFocusedData.js`

