import { Database } from "bun:sqlite"
import { mkdirSync } from "fs"
import { join } from "path"

const DB_PATH = join(import.meta.dir, "..", "data", "deployable_vm_configs.db")

let db = null

export function initDatabase() {
  mkdirSync(join(import.meta.dir, "..", "data"), { recursive: true })
  db = new Database(DB_PATH, { create: true })
  db.exec(`
    CREATE TABLE IF NOT EXISTS deployable_vm_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hostname TEXT UNIQUE NOT NULL,
      config TEXT NOT NULL,
      parsed_config TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
}

function toConfig(row) {
  return {
    id: row.id,
    hostname: row.hostname,
    config: row.config,
    parsed_config: JSON.parse(row.parsed_config),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function getDeployableVmConfigs() {
  const rows = db.query("SELECT * FROM deployable_vm_configs ORDER BY created_at DESC").all()
  return rows.map(toConfig)
}

export function createDeployableVmConfig(data) {
  const now = new Date().toISOString()
  const row = db
    .query(
      `INSERT INTO deployable_vm_configs (hostname, config, parsed_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?) RETURNING *`
    )
    .get(
      data.hostname,
      data.config,
      JSON.stringify(data.parsed_config),
      now,
      now
    )
  return toConfig(row)
}

export function updateDeployableVmConfig(id, data) {
  const now = new Date().toISOString()
  const fields = []
  const values = []

  if (data.hostname !== undefined) { fields.push("hostname = ?"); values.push(data.hostname) }
  if (data.config !== undefined) { fields.push("config = ?"); values.push(data.config) }
  if (data.parsed_config !== undefined) { fields.push("parsed_config = ?"); values.push(JSON.stringify(data.parsed_config)) }

  if (fields.length === 0) {
    const existing = db.query("SELECT * FROM deployable_vm_configs WHERE id = ?").get(id)
    if (!existing) return null
    return toConfig(existing)
  }

  fields.push("updated_at = ?")
  values.push(now)
  values.push(id)

  const row = db.query(
    `UPDATE deployable_vm_configs SET ${fields.join(", ")} WHERE id = ? RETURNING *`
  ).get(...values)

  if (!row) return null
  return toConfig(row)
}

export function deleteDeployableVmConfig(id) {
  const result = db.query("DELETE FROM deployable_vm_configs WHERE id = ?").run(id)
  return { success: result.changes > 0 }
}
