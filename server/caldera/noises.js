import { Database } from "bun:sqlite"
import { mkdirSync } from "fs"
import { join } from "path"

const DB_PATH = join(import.meta.dir, "..", "data", "noises.db")

let db = null

export function initDatabase() {
  mkdirSync(join(import.meta.dir, "..", "data"), { recursive: true })
  db = new Database(DB_PATH, { create: true })
  db.exec(`
    CREATE TABLE IF NOT EXISTS noises (
      name TEXT PRIMARY KEY,
      command TEXT,
      description TEXT DEFAULT ''
    )
  `)
}

export function getNoises() {
  const rows = db.query("SELECT * FROM noises ORDER BY name ASC").all()
  return rows
}

export function createNoise(data) {
  const row = db
    .query(
      "INSERT INTO noises (name, command, description) VALUES (?, ?, ?) RETURNING *"
    )
    .get(data.name, data.command, data.description ?? "")
  return row
}

export function updateNoise(name, data) {
  const fields = []
  const values = []

  if (data.command !== undefined) { fields.push("command = ?"); values.push(data.command) }
  if (data.description !== undefined) { fields.push("description = ?"); values.push(data.description) }

  if (fields.length === 0) {
    const existing = db.query("SELECT * FROM noises WHERE name = ?").get(name)
    if (!existing) return null
    return existing
  }

  values.push(name)

  const row = db.query(
    `UPDATE noises SET ${fields.join(", ")} WHERE name = ? RETURNING *`
  ).get(...values)

  if (!row) return null
  return row
}

export function deleteNoise(name) {
  const result = db.query("DELETE FROM noises WHERE name = ?").run(name)
  return { success: result.changes > 0 }
}
