---
component_id: 3.1
component_name: Technique & Category Service
---

# Technique & Category Service

## Component Description

Fetches MITRE ATT&CK categories and techniques from the Caldera API. Serves as the primary data source for the attack configuration workspace's technique tree.

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

### /home/cozyty/Projects/shadowProtocol/server/caldera/categories.js (lines 4-10)
```
export async function fetchCalderaCategories() {
  return {
    categories: FOCUS_CATEGORIES,
    techniques: FOCUS_TECHNIQUES,
    count: FOCUS_CATEGORIES.length,
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

