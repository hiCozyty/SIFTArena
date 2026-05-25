import { Database } from "bun:sqlite"
import { mkdirSync } from "fs"
import { join } from "path"

const DB_PATH = join(import.meta.dir, "..", "data", "custom_abilities.db")

let db = null

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

function toAbility(row) {
  return {
    ability_id: row.ability_id,
    tactic: row.tactic,
    technique_name: row.technique_name,
    technique_id: row.technique_id,
    name: row.name,
    description: row.description,
    executors: JSON.parse(row.executors),
    requirements: [],
    privilege: "",
    repeatable: false,
    buckets: [row.tactic],
    additional_info: {},
    access: {},
    singleton: false,
    plugin: "custom",
    delete_payload: true,
  }
}

export function getCustomAbilities() {
  const rows = db.query("SELECT * FROM custom_abilities ORDER BY created_at DESC").all()
  return rows.map(toAbility)
}

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

export function updateCustomAbility(abilityId, data) {
  const now = new Date().toISOString()
  const fields = []
  const values = []

  if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name) }
  if (data.description !== undefined) { fields.push("description = ?"); values.push(data.description) }
  if (data.tactic !== undefined) { fields.push("tactic = ?"); values.push(data.tactic) }
  if (data.technique_id !== undefined) { fields.push("technique_id = ?"); values.push(data.technique_id) }
  if (data.technique_name !== undefined) { fields.push("technique_name = ?"); values.push(data.technique_name) }
  if (data.executors !== undefined) { fields.push("executors = ?"); values.push(JSON.stringify(data.executors)) }

  if (fields.length === 0) {
    const existing = db.query("SELECT * FROM custom_abilities WHERE ability_id = ?").get(abilityId)
    if (!existing) return null
    return toAbility(existing)
  }

  fields.push("updated_at = ?")
  values.push(now)
  values.push(abilityId)

  const row = db.query(
    `UPDATE custom_abilities SET ${fields.join(", ")} WHERE ability_id = ? RETURNING *`
  ).get(...values)

  if (!row) return null
  return toAbility(row)
}

export function deleteCustomAbility(abilityId) {
  const result = db.query("DELETE FROM custom_abilities WHERE ability_id = ?").run(abilityId)
  return { success: result.changes > 0 }
}
