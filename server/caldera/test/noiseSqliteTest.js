import { initDatabase, getNoises, createNoise, updateNoise, deleteNoise } from "../noises.js"
import { existsSync, copyFileSync, unlinkSync } from "fs"
import { join } from "path"

const DB_PATH = join(import.meta.dir, "..", "..", "data", "noises.db")
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
    console.log("\n1. getNoises (empty)")
    const empty = getNoises()
    assert(Array.isArray(empty), "returns array")
    assert(empty.length === 0, "empty array")

    // Test 2: Create noise
    console.log("\n2. createNoise")
    const created = createNoise({
      name: "Background HTTP",
      command: "curl -s http://example.com/api/beacon",
    })
    assert(created.name === "Background HTTP", "name matches")
    assert(created.command === "curl -s http://example.com/api/beacon", "command matches")

    // Test 3: Get after create
    console.log("\n3. getNoises (after create)")
    const afterCreate = getNoises()
    assert(afterCreate.length === 1, "has 1 noise")
    assert(afterCreate[0].name === "Background HTTP", "name matches")

    // Test 4: Create second noise
    console.log("\n4. createNoise (second)")
    const created2 = createNoise({
      name: "DNS Beacon",
      command: "nslookup beacon.example.com",
    })
    assert(created2.name === "DNS Beacon", "name matches")
    assert(created2.command === "nslookup beacon.example.com", "command matches")
    const afterCreate2 = getNoises()
    assert(afterCreate2.length === 2, "has 2 noises")

    // Test 5: Create with duplicate name
    console.log("\n5. createNoise (duplicate name)")
    try {
      createNoise({ name: "Background HTTP", command: "something else" })
      assert(false, "should have thrown")
    } catch {
      assert(true, "throws on duplicate name")
    }

    // Test 6: Update noise
    console.log("\n6. updateNoise")
    const updated = updateNoise("Background HTTP", {
      command: "curl -s http://new-c2.example.com/api/beacon",
    })
    assert(updated.name === "Background HTTP", "name unchanged")
    assert(updated.command === "curl -s http://new-c2.example.com/api/beacon", "command updated")

    // Test 7: Update non-existent noise
    console.log("\n7. updateNoise (non-existent)")
    const notFound = updateNoise("Nope", { command: "x" })
    assert(notFound === null, "returns null")

    // Test 8: Update with no fields
    console.log("\n8. updateNoise (no fields)")
    const noChange = updateNoise("DNS Beacon", {})
    assert(noChange !== null, "returns existing noise")
    assert(noChange.name === "DNS Beacon", "name unchanged")
    assert(noChange.command === "nslookup beacon.example.com", "command unchanged")

    // Test 9: Delete noise
    console.log("\n9. deleteNoise")
    const deleted = deleteNoise("Background HTTP")
    assert(deleted.success === true, "delete success")
    const afterDelete = getNoises()
    assert(afterDelete.length === 1, "has 1 noise after delete")
    assert(afterDelete[0].name === "DNS Beacon", "remaining noise is correct")

    // Test 10: Delete non-existent noise
    console.log("\n10. deleteNoise (non-existent)")
    const deleteNotFound = deleteNoise("Nope")
    assert(deleteNotFound.success === false, "delete returns false")

    // Test 11: Delete last noise
    console.log("\n11. deleteNoise (last)")
    deleteNoise("DNS Beacon")
    assert(getNoises().length === 0, "empty after deleting all")

    console.log("\nAll tests passed!")
  } finally {
    restoreDb()
  }
}

runTests()
