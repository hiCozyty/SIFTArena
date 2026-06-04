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
      ability_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      command TEXT NOT NULL,
      kali_prereq TEXT DEFAULT '',
      win_prereq TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
}

function toAbility(row) {
  return {
    ability_id: row.ability_id,
    name: row.name,
    description: row.description,
    command: row.command,
    kali_prereq: row.kali_prereq,
    win_prereq: row.win_prereq,
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
      `INSERT INTO custom_abilities (ability_id, name, description, command, kali_prereq, win_prereq, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    )
    .get(
      abilityId,
      data.name,
      data.description || "",
      data.command,
      data.kali_prereq || "",
      data.win_prereq || "",
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
  if (data.command !== undefined) { fields.push("command = ?"); values.push(data.command) }
  if (data.kali_prereq !== undefined) { fields.push("kali_prereq = ?"); values.push(data.kali_prereq) }
  if (data.win_prereq !== undefined) { fields.push("win_prereq = ?"); values.push(data.win_prereq) }

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
