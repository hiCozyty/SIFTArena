import { initDatabase, getCustomAbilities, createCustomAbility, updateCustomAbility, deleteCustomAbility } from "../customAbilities.js"
import { Database } from "bun:sqlite"
import { existsSync, copyFileSync, unlinkSync } from "fs"
import { join } from "path"

const DB_PATH = join(import.meta.dir, "..", "..", "data", "custom_abilities.db")
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
    console.log("\n1. getCustomAbilities (empty)")
    const empty = getCustomAbilities()
    assert(Array.isArray(empty), "returns array")
    assert(empty.length === 0, "empty array")

    // Test 2: Create ability
    console.log("\n2. createCustomAbility")
    const created = createCustomAbility({
      name: "Test LSASS Dump",
      description: "Test ability for LSASS memory dump",
      tactic: "credential-access",
      technique_id: "T1003.001",
      technique_name: "OS Credential Dumping: LSASS Memory",
      executors: [
        { name: "cmd", platform: "windows", command: "echo test", timeout: 60 },
      ],
    })
    assert(created.ability_id !== undefined, "has ability_id")
    assert(created.name === "Test LSASS Dump", "name matches")
    assert(created.plugin === "custom", "plugin is custom")
    assert(Array.isArray(created.executors), "executors is array")
    assert(created.executors.length === 1, "has 1 executor")
    assert(created.executors[0].command === "echo test", "command matches")

    // Test 3: Get after create
    console.log("\n3. getCustomAbilities (after create)")
    const afterCreate = getCustomAbilities()
    assert(afterCreate.length === 1, "has 1 ability")
    assert(afterCreate[0].ability_id === created.ability_id, "ability_id matches")

    // Test 4: Create second ability
    console.log("\n4. createCustomAbility (second)")
    const created2 = createCustomAbility({
      name: "Test Mimikatz",
      description: "Test mimikatz ability",
      tactic: "credential-access",
      technique_id: "T1003.001",
      technique_name: "OS Credential Dumping: LSASS Memory",
      executors: [
        { name: "psh", platform: "windows", command: "Invoke-Mimikatz", timeout: 120 },
      ],
    })
    assert(created2.ability_id !== created.ability_id, "different ability_id")
    const afterCreate2 = getCustomAbilities()
    assert(afterCreate2.length === 2, "has 2 abilities")

    // Test 5: Update ability
    console.log("\n5. updateCustomAbility")
    const updated = updateCustomAbility(created.ability_id, {
      name: "Updated LSASS Dump",
      description: "Updated description",
    })
    assert(updated.name === "Updated LSASS Dump", "name updated")
    assert(updated.description === "Updated description", "description updated")
    assert(updated.ability_id === created.ability_id, "ability_id unchanged")
    assert(updated.technique_id === "T1003.001", "technique_id unchanged")

    // Test 6: Update executors
    console.log("\n6. updateCustomAbility (executors)")
    const updatedExec = updateCustomAbility(created.ability_id, {
      executors: [
        { name: "psh", platform: "windows", command: "Get-Process", timeout: 30 },
        { name: "cmd", platform: "windows", command: "tasklist", timeout: 30 },
      ],
    })
    assert(updatedExec.executors.length === 2, "2 executors")
    assert(updatedExec.executors[0].name === "psh", "first executor is psh")

    // Test 7: Update non-existent ability
    console.log("\n7. updateCustomAbility (non-existent)")
    const notFound = updateCustomAbility("nonexistent123", { name: "Nope" })
    assert(notFound === null, "returns null")

    // Test 8: Update with no fields
    console.log("\n8. updateCustomAbility (no fields)")
    const noChange = updateCustomAbility(created2.ability_id, {})
    assert(noChange !== null, "returns existing ability")
    assert(noChange.name === "Test Mimikatz", "name unchanged")

    // Test 9: Delete ability
    console.log("\n9. deleteCustomAbility")
    const deleted = deleteCustomAbility(created.ability_id)
    assert(deleted.success === true, "delete success")
    const afterDelete = getCustomAbilities()
    assert(afterDelete.length === 1, "has 1 ability after delete")
    assert(afterDelete[0].ability_id === created2.ability_id, "remaining ability is correct")

    // Test 10: Delete non-existent ability
    console.log("\n10. deleteCustomAbility (non-existent)")
    const deleteNotFound = deleteCustomAbility("nonexistent123")
    assert(deleteNotFound.success === false, "delete returns false")

    // Test 11: Delete remaining ability
    console.log("\n11. deleteCustomAbility (last)")
    deleteCustomAbility(created2.ability_id)
    assert(getCustomAbilities().length === 0, "empty after deleting all")

    console.log("\nAll tests passed!")
  } finally {
    restoreDb()
  }
}

runTests()
