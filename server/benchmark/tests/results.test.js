import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { getEvidenceFileInfo, listWorkflowResults, getResultFile } from "../../workflows/workflows.js"

const ROOT = join(import.meta.dir, "..", "..", "..")

const mockRounds = {
  rounds: [
    {
      round: 1,
      thinking: "I need to analyze the MFT...",
      text: "Looking at file system artifacts...",
      toolCalls: [
        { callID: "c1", tool: "bash", status: "completed", input: { command: "cat mft_timeline.json" }, output: "..." }
      ]
    }
  ],
  tokens: { input: 1500, output: 800, reasoning: 2000 },
  cost: 0.0423
}

const mockReconstruction = [
  {
    technique: "LSASS dump via procdump",
    mitre: "T1003.001",
    timestampUtc: "2026-06-15T12:00:00.000Z",
    evidence: ["sysmon.json", "prefetch.json"],
    description: "Procdump executed from temp directory targeting lsass.exe"
  }
]

let passed = 0
let failed = 0

function assert(condition, label) {
  if (condition) {
    console.log(`  PASS: ${label}`)
    passed++
  } else {
    console.error(`  FAIL: ${label}`)
    failed++
  }
}

async function setupResultsDir() {
  const dir = join(ROOT, "results", "test-playbook", "opencode-go", "deepseek-v4-flash", "1718400000000")
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, "rounds.json"), JSON.stringify(mockRounds))
  await writeFile(join(dir, "reconstruction.json"), JSON.stringify(mockReconstruction))

  const dir2 = join(ROOT, "results", "test-playbook", "opencode-go", "deepseek-v4-flash", "1718500000000")
  await mkdir(dir2, { recursive: true })
  await writeFile(join(dir2, "rounds.json"), JSON.stringify(mockRounds))
}

async function teardownResultsDir() {
  await rm(join(ROOT, "results", "test-playbook"), { recursive: true, force: true })
}

async function testListWorkflowResults() {
  console.log("\n--- Test: listWorkflowResults ---")
  const result = await listWorkflowResults()

  assert(Array.isArray(result), "result should be an array")
  assert(result.length > 0, "result should have entries")

  const pb = result.find(r => r.playbookName === "test-playbook")
  assert(pb != null, "should find test-playbook")
  assert(pb.models.length === 1, "should have 1 model entry")
  assert(pb.models[0].providerID === "opencode-go", "provider should be opencode-go")
  assert(pb.models[0].modelName === "deepseek-v4-flash", "model name should be deepseek-v4-flash")
  assert(pb.models[0].timestamps.length === 2, "should have 2 timestamps")

  const ts1 = pb.models[0].timestamps.find(t => t.timestamp === "1718400000000")
  assert(ts1 != null, "should find timestamp 1718400000000")
  assert(ts1.files.includes("rounds.json"), "should include rounds.json")
  assert(ts1.files.includes("reconstruction.json"), "should include reconstruction.json")

  console.log(JSON.stringify(pb, null, 2))
}

async function testGetResultFile() {
  console.log("\n--- Test: getResultFile ---")

  const path = "test-playbook/opencode-go/deepseek-v4-flash/1718400000000/rounds.json"
  const result = await getResultFile(null, null, { data: { path } })

  assert(typeof result.content === "string" && result.content.length > 0, "content should be returned")
  assert(typeof result.size === "number" && result.size > 0, "size should be returned")

  const parsed = JSON.parse(result.content)
  assert(parsed.rounds.length === 1, "parsed rounds count should be 1")
  assert(parsed.tokens.input === 1500, "parsed tokens.input should match")
}

async function testGetResultFileMissing() {
  console.log("\n--- Test: getResultFile (missing) ---")

  const result = await getResultFile(null, null, { data: { path: "test-playbook/nonexistent.json" } })
  assert(result.content === null, "content should be null for missing file")
  assert(result.size === null, "size should be null for missing file")
}

async function testGetResultFileEmptyDir() {
  console.log("\n--- Test: listWorkflowResults (empty results dir) ---")
  // already have test data; just verify it includes non-JSON exclusion
  // create a non-JSON file and verify it's excluded
  const dir = join(ROOT, "results", "test-playbook", "opencode-go", "deepseek-v4-flash", "1718400000000")
  await writeFile(join(dir, "notes.txt"), "hello")

  const result = await listWorkflowResults()
  const pb = result.find(r => r.playbookName === "test-playbook")
  const ts = pb.models[0].timestamps.find(t => t.timestamp === "1718400000000")
  assert(!ts.files.includes("notes.txt"), "non-JSON files should be excluded from file list")
}

async function main() {
  console.log("=== Results API Tests ===\n")

  try {
    await setupResultsDir()

    await testListWorkflowResults()
    await testGetResultFile()
    await testGetResultFileMissing()
    await testGetResultFileEmptyDir()
  } finally {
    await teardownResultsDir()
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
  if (failed > 0) process.exit(1)
}

if (import.meta.main) main()
