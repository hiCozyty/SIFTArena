import { initializeOpencodeSessionFromDocker, verifyWorkflowMcpTool } from "../ludus/workflows.js"

async function main() {
  const workflowName = "workflow1"
  console.log(`[1/2] Initializing opencode session for "${workflowName}"...`)
  const initResult = await initializeOpencodeSessionFromDocker(null, null, { data: { workflowName } })
  console.log(`  -> ${initResult.message}`)

  console.log(`[2/2] Verifying MCP tool via bun run ./customMCP/index.ts ...`)
  const verifyResult = await verifyWorkflowMcpTool(null, null, { data: { workflowName } })
  console.log(`  -> tool=${verifyResult.tool}`)
  console.log(`  -> result="${verifyResult.result}"`)

  if (verifyResult.result === "You passed: test-mcp") {
    console.log("\n✓ VERDICT: ./customMCP/index.ts path resolves correctly inside the container")
    process.exit(0)
  } else {
    console.log(`\n✗ VERDICT: Unexpected result — possible path issue`)
    process.exit(1)
  }
}

main().catch(err => {
  console.error(`\n✗ VERDICT: ${err.message}`)
  process.exit(1)
})
