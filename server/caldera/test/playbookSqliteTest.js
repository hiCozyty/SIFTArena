import { initDatabase, getPlaybooks, createPlaybook, updatePlaybook, deletePlaybook } from "../playbooks.js"
import { existsSync, copyFileSync, unlinkSync } from "fs"
import { join } from "path"

const DB_PATH = join(import.meta.dir, "..", "..", "data", "playbooks.db")
const BACKUP_PATH = DB_PATH + ".bak"

function backupDb() {
  if (existsSync(DB_PATH)) {
    copyFileSync(DB_PATH, BACKUP_PATH)
  }
}

function restoreDb() {
  if (existsSync(BACKUP_PATH)) {
    if (existsSync(DB_PATH)) unlinkSync(DB_PATH)
    copyFileSync(BACKUP_PATH, DB_PATH)
    unlinkSync(BACKUP_PATH)
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(`FAIL: ${msg}`)
  console.log(`  PASS: ${msg}`)
}

function runTests() {
  initDatabase()
  backupDb()

  try {
    // Test 1: Empty database
    console.log("\n1. getPlaybooks (empty)")
    const empty = getPlaybooks()
    assert(Array.isArray(empty), "returns array")
    assert(empty.length === 0, "empty array")

    // Test 2: Create playbook
    console.log("\n2. createPlaybook")
    const created = createPlaybook({
      name: "Initial Access",
      timelineEvents: ["ability-001", "ability-002"],
      persistentBgCommands: ["whoami /all"],
      settings: { interval: 30 },
    })
    assert(created.name === "Initial Access", "name matches")
    assert(Array.isArray(created.timelineEvents), "timelineEvents is array")
    assert(created.timelineEvents.length === 2, "timelineEvents has 2 items")
    assert(created.timelineEvents[0] === "ability-001", "timelineEvents[0] matches")
    assert(Array.isArray(created.persistentBgCommands), "persistentBgCommands is array")
    assert(created.persistentBgCommands.length === 1, "persistentBgCommands has 1 item")
    assert(created.persistentBgCommands[0] === "whoami /all", "persistentBgCommands[0] matches")
    assert(typeof created.settings === "object", "settings is object")
    assert(created.settings.interval === 30, "settings.interval matches")

    // Test 3: Get after create
    console.log("\n3. getPlaybooks (after create)")
    const afterCreate = getPlaybooks()
    assert(afterCreate.length === 1, "has 1 playbook")
    assert(afterCreate[0].name === "Initial Access", "name matches")

    // Test 4: Create second playbook
    console.log("\n4. createPlaybook (second)")
    const created2 = createPlaybook({
      name: "Credential Dump",
      timelineEvents: ["ability-003"],
      persistentBgCommands: [],
      settings: {},
    })
    assert(created2.name === "Credential Dump", "name matches")
    assert(created2.timelineEvents.length === 1, "timelineEvents has 1 item")
    assert(Array.isArray(created2.persistentBgCommands), "persistentBgCommands is array")
    assert(created2.persistentBgCommands.length === 0, "persistentBgCommands empty")
    assert(typeof created2.settings === "object", "settings is object")
    const afterCreate2 = getPlaybooks()
    assert(afterCreate2.length === 2, "has 2 playbooks")

    // Test 5: Create with duplicate name
    console.log("\n5. createPlaybook (duplicate name)")
    try {
      createPlaybook({ name: "Initial Access" })
      assert(false, "should have thrown")
    } catch {
      assert(true, "throws on duplicate name")
    }

    // Test 6: Update playbook (partial)
    console.log("\n6. updatePlaybook (partial)")
    const updated = updatePlaybook("Initial Access", {
      settings: { interval: 120 },
      persistentBgCommands: ["netstat -ano"],
    })
    assert(updated.name === "Initial Access", "name unchanged")
    assert(updated.settings.interval === 120, "settings updated")
    assert(Array.isArray(updated.persistentBgCommands), "persistentBgCommands is array")
    assert(updated.persistentBgCommands[0] === "netstat -ano", "persistentBgCommands updated")
    assert(updated.timelineEvents.length === 2, "timelineEvents unchanged")

    // Test 7: Update playbook (timeline events)
    console.log("\n7. updatePlaybook (timeline events)")
    const updated2 = updatePlaybook("Initial Access", {
      timelineEvents: ["ability-004", "ability-005"],
    })
    assert(updated2.timelineEvents.length === 2, "timelineEvents updated")
    assert(updated2.timelineEvents[0] === "ability-004", "timelineEvents[0] updated")

    // Test 8: Update non-existent playbook
    console.log("\n8. updatePlaybook (non-existent)")
    const notFound = updatePlaybook("Nope", { persistentBgCommands: ["x"] })
    assert(notFound === null, "returns null")

    // Test 9: Update with no fields
    console.log("\n9. updatePlaybook (no fields)")
    const noChange = updatePlaybook("Credential Dump", {})
    assert(noChange !== null, "returns existing playbook")
    assert(noChange.name === "Credential Dump", "name unchanged")

    // Test 10: Delete playbook
    console.log("\n10. deletePlaybook")
    const deleted = deletePlaybook("Initial Access")
    assert(deleted.success === true, "delete success")
    const afterDelete = getPlaybooks()
    assert(afterDelete.length === 1, "has 1 playbook after delete")
    assert(afterDelete[0].name === "Credential Dump", "remaining playbook is correct")

    // Test 11: Delete non-existent playbook
    console.log("\n11. deletePlaybook (non-existent)")
    const deleteNotFound = deletePlaybook("Nope")
    assert(deleteNotFound.success === false, "delete returns false")

    // Test 12: Delete last playbook
    console.log("\n12. deletePlaybook (last)")
    deletePlaybook("Credential Dump")
    assert(getPlaybooks().length === 0, "empty after deleting all")

    console.log("\nAll tests passed!")
  } finally {
    restoreDb()
  }
}

runTests()
