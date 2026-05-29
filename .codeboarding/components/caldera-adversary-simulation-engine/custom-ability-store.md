---
component_id: 3.3
component_name: Custom Ability Store
---

# Custom Ability Store

## Component Description

Local SQLite-backed CRUD for custom attack abilities. Users can create, read, update, and delete custom abilities that supplement the Caldera-provided ones.

---

## Key References:

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

### /home/cozyty/Projects/shadowProtocol/server/caldera/customAbilities.js (lines 106-109)
```
export function deleteCustomAbility(abilityId) {
  const result = db.query("DELETE FROM custom_abilities WHERE ability_id = ?").run(abilityId)
  return { success: result.changes > 0 }
}
```


