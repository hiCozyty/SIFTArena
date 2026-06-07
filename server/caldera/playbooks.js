import { Database } from "bun:sqlite"
import { mkdirSync } from "fs"
import { join } from "path"

const DB_PATH = join(import.meta.dir, "..", "data", "playbooks.db")

let db = null

export function initDatabase() {
  mkdirSync(join(import.meta.dir, "..", "data"), { recursive: true })
  db = new Database(DB_PATH, { create: true })
  db.exec(`
    CREATE TABLE IF NOT EXISTS playbooks (
      name TEXT PRIMARY KEY,
      timeline_events TEXT DEFAULT '[]',
      persistent_bg_interval_time INTEGER DEFAULT 0,
      persistent_bg_command TEXT DEFAULT '',
      timeline_bg_events TEXT DEFAULT '[]'
    )
  `)
}

function toPlaybook(row) {
  return {
    name: row.name,
    timelineEvents: JSON.parse(row.timeline_events),
    persistentBgIntervalTime: row.persistent_bg_interval_time,
    persistentBgCommand: row.persistent_bg_command,
    timelineBgEvents: JSON.parse(row.timeline_bg_events),
  }
}

export function getPlaybooks() {
  const rows = db.query("SELECT * FROM playbooks ORDER BY name ASC").all()
  return rows.map(toPlaybook)
}

export function createPlaybook(data) {
  const row = db
    .query(
      `INSERT INTO playbooks (name, timeline_events, persistent_bg_interval_time, persistent_bg_command, timeline_bg_events)
       VALUES (?, ?, ?, ?, ?) RETURNING *`
    )
    .get(
      data.name,
      JSON.stringify(data.timelineEvents ?? []),
      data.persistentBgIntervalTime ?? 0,
      data.persistentBgCommand ?? "",
      JSON.stringify(data.timelineBgEvents ?? [])
    )
  return toPlaybook(row)
}

export function updatePlaybook(name, data) {
  const fields = []
  const values = []

  if (data.timelineEvents !== undefined) { fields.push("timeline_events = ?"); values.push(JSON.stringify(data.timelineEvents)) }
  if (data.persistentBgIntervalTime !== undefined) { fields.push("persistent_bg_interval_time = ?"); values.push(data.persistentBgIntervalTime) }
  if (data.persistentBgCommand !== undefined) { fields.push("persistent_bg_command = ?"); values.push(data.persistentBgCommand) }
  if (data.timelineBgEvents !== undefined) { fields.push("timeline_bg_events = ?"); values.push(JSON.stringify(data.timelineBgEvents)) }

  if (fields.length === 0) {
    const existing = db.query("SELECT * FROM playbooks WHERE name = ?").get(name)
    if (!existing) return null
    return toPlaybook(existing)
  }

  values.push(name)

  const row = db.query(
    `UPDATE playbooks SET ${fields.join(", ")} WHERE name = ? RETURNING *`
  ).get(...values)

  if (!row) return null
  return toPlaybook(row)
}

export function deletePlaybook(name) {
  const result = db.query("DELETE FROM playbooks WHERE name = ?").run(name)
  return { success: result.changes > 0 }
}
