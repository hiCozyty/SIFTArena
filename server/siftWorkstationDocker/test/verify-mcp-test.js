import { initializeOpencodeSessionFromDocker } from "../../workflows/workflows.js"

async function main() {
  const workflowName = "five_phase_workflow_with_mcp"
  console.log(`Initializing opencode session for "${workflowName}"...`)
  const initResult = await initializeOpencodeSessionFromDocker(null, null, { data: { workflowName } })
  console.log(`  -> ${initResult.message}`)
  console.log("\n✓ Session initialized successfully")
  process.exit(0)
}

main().catch(err => {
  console.error(`\n✗ Error: ${err.message}`)
  process.exit(1)
})
