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
      persistentBgIntervalTime: 30,
      persistentBgCommand: "whoami /all",
      timelineBgEvents: [{ before: "cmd1", after: "cmd2" }],
    })
    assert(created.name === "Initial Access", "name matches")
    assert(Array.isArray(created.timelineEvents), "timelineEvents is array")
    assert(created.timelineEvents.length === 2, "timelineEvents has 2 items")
    assert(created.timelineEvents[0] === "ability-001", "timelineEvents[0] matches")
    assert(created.persistentBgIntervalTime === 30, "persistentBgIntervalTime matches")
    assert(created.persistentBgCommand === "whoami /all", "persistentBgCommand matches")
    assert(Array.isArray(created.timelineBgEvents), "timelineBgEvents is array")
    assert(created.timelineBgEvents.length === 1, "timelineBgEvents has 1 item")
    assert(created.timelineBgEvents[0].before === "cmd1", "timelineBgEvents[0].before matches")
    assert(created.timelineBgEvents[0].after === "cmd2", "timelineBgEvents[0].after matches")

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
      persistentBgIntervalTime: 60,
      persistentBgCommand: "",
      timelineBgEvents: [],
    })
    assert(created2.name === "Credential Dump", "name matches")
    assert(created2.timelineEvents.length === 1, "timelineEvents has 1 item")
    assert(created2.persistentBgIntervalTime === 60, "persistentBgIntervalTime matches")
    assert(created2.persistentBgCommand === "", "persistentBgCommand empty")
    assert(created2.timelineBgEvents.length === 0, "timelineBgEvents empty array")
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
      persistentBgIntervalTime: 120,
      persistentBgCommand: "netstat -ano",
    })
    assert(updated.name === "Initial Access", "name unchanged")
    assert(updated.persistentBgIntervalTime === 120, "persistentBgIntervalTime updated")
    assert(updated.persistentBgCommand === "netstat -ano", "persistentBgCommand updated")
    assert(updated.timelineEvents.length === 2, "timelineEvents unchanged")

    // Test 7: Update playbook (timeline arrays)
    console.log("\n7. updatePlaybook (timeline arrays)")
    const updated2 = updatePlaybook("Initial Access", {
      timelineEvents: ["ability-004"],
      timelineBgEvents: [{ before: "pre", after: "post" }, { before: "pre2", after: "post2" }],
    })
    assert(updated2.timelineEvents.length === 1, "timelineEvents updated")
    assert(updated2.timelineEvents[0] === "ability-004", "timelineEvents[0] updated")
    assert(updated2.timelineBgEvents.length === 2, "timelineBgEvents has 2 items")
    assert(updated2.timelineBgEvents[1].after === "post2", "timelineBgEvents[1].after matches")

    // Test 8: Update non-existent playbook
    console.log("\n8. updatePlaybook (non-existent)")
    const notFound = updatePlaybook("Nope", { persistentBgCommand: "x" })
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
