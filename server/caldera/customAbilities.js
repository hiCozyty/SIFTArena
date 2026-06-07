import { Database } from "bun:sqlite"
import { mkdirSync } from "fs"
import { join } from "path"
import { buildAbility, createAbility, deleteAbility } from "./custom.js"

const DB_PATH = join(import.meta.dir, "..", "data", "custom_abilities.db")
const CALDERA_URL = "http://10.1.99.1:8888"
const CALDERA_KEY = "ADMIN123"

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
    win_prereq: row.win_prereq,
    custom: true,
  }
}

export function getCustomAbilities() {
  const rows = db.query("SELECT * FROM custom_abilities ORDER BY created_at DESC").all()
  return rows.map(toAbility)
}

export async function createCustomAbility(data) {
  const now = new Date().toISOString()
  const abilityId = crypto.randomUUID().replace(/-/g, "")
  const row = db
    .query(
      `INSERT INTO custom_abilities (ability_id, name, description, command, win_prereq, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`
    )
    .get(
      abilityId,
      data.name,
      data.description || "",
      data.command,
      data.win_prereq || "",
      now,
      now
    )
  const ability = toAbility(row)
  try {
    const calderaResult = await createAbility(ability)
    } catch (err) {
    console.error("[customAbilities] Caldera POST failed — ability saved to SQLite, will sync on restart:", err.message)
  }

  return ability
}

export function updateCustomAbility(abilityId, data) {
  const now = new Date().toISOString()
  const fields = []
  const values = []

  if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name) }
  if (data.description !== undefined) { fields.push("description = ?"); values.push(data.description) }
  if (data.command !== undefined) { fields.push("command = ?"); values.push(data.command) }
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

export async function deleteCustomAbility(abilityId) {
  try {
    await deleteAbility(abilityId)
    } catch (err) {
    console.error("[customAbilities] Caldera DELETE failed:", err.message)
  }
  const result = db.query("DELETE FROM custom_abilities WHERE ability_id = ?").run(abilityId)
  return { success: result.changes > 0 }
}

export async function syncToCaldera() {
  const rows = db.query("SELECT * FROM custom_abilities").all()
  if (rows.length === 0) {
    return
  }

  let synced = 0
  let skipped = 0
  let failed = 0

  for (const row of rows) {
    try {
      const res = await fetch(`${CALDERA_URL}/api/v2/abilities/${row.ability_id}`, {
        method: "PUT",
        headers: { "KEY": CALDERA_KEY, "Content-Type": "application/json" },
        body: JSON.stringify(buildAbility(toAbility(row))),
        signal: AbortSignal.timeout(10000),
      })
      if (res.status === 201) {
        synced++
      } else if (res.ok) {
        skipped++
      } else {
        const text = await res.text()
        console.error(`[syncToCaldera] PUT ${row.ability_id} failed (${res.status}): ${text}`)
        failed++
      }
    } catch (err) {
      console.error(`[syncToCaldera] PUT ${row.ability_id} error:`, err.message)
      failed++
    }
  }

  }
