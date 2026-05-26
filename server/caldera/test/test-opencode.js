import { createOpencodeClient } from "@opencode-ai/sdk"

const SANDBOX_URL = process.env.OPENCODE_SANDBOX_URL || "http://127.0.0.1:3111"

const client = createOpencodeClient({
  baseUrl: SANDBOX_URL,
})

function log(label, data) {
  console.log(`  ${label}:`, typeof data === "string" ? data : JSON.stringify(data, null, 2))
}

async function testCreateSession() {
  console.log("\n=== Test 1: Create Session ===")
  const session = await client.session.create()
  const sessionId = session.data?.id
  if (!sessionId) throw new Error("no session id returned")
  log("sessionId", sessionId)
  console.log("  PASS")
  return sessionId
}

async function testRun(sessionId) {
  console.log("\n=== Test 2: Run Prompt (streaming) ===")

  const events = await client.event.subscribe()
  let thinking = ""
  let text = ""
  let usage = null
  let done = false
  const seenToolPartIds = new Set() // deduplicate tool parts across multiple updates

  const eventPromise = (async () => {
    for await (const event of events.stream) {
      const props = event.properties || {}
      if (props.sessionID && props.sessionID !== sessionId) continue

      if (event.type === "message.part.updated" && props.part?.id) {
        const part = props.part

        // Read content directly from the part object, not from deltas
        if (part.type === "text" && part.text !== undefined) {
          text = part.text
        }

        if (part.type === "reasoning" && part.text !== undefined) {
          thinking = part.text
        }

        if (part.type === "tool" && !seenToolPartIds.has(part.id)) {
          seenToolPartIds.add(part.id)
          log("tool", `${part.tool} (${part.state?.status})`)
        }

        // Only finalize on a terminal stop, not on tool-call handoffs
        if (part.type === "step-finish" && part.reason === "stop") {
          if (part.tokens) {
            usage = part.tokens
            log("usage", JSON.stringify(usage))
          }
          done = true
          break
        }
      }
    }
  })()

  await Promise.all([
    client.session.prompt({
      path: { id: sessionId },
      body: {
        parts: [{ type: "text", text: "Say hello in exactly 3 words." }],
      },
    }),
    eventPromise,
  ])

  if (!done) throw new Error("no done event received")
  if (text.trim().length === 0) throw new Error("response text is empty")

  console.log(`  thinking: "${thinking.trim()}"`)
  console.log(`  response: "${text.trim()}"`)
  console.log(`  tools used: ${seenToolPartIds.size}`)
  if (usage) {
    console.log(`  input tokens: ${usage.inputTokens ?? "?"}`)
    console.log(`  output tokens: ${usage.outputTokens ?? "?"}`)
    console.log(`  total tokens: ${usage.totalTokens ?? "?"}`)
  }
  console.log("  PASS")
}

async function testRunWithModel(sessionId) {
  console.log("\n=== Test 3: Run Prompt with Model Selection ===")

  const events = await client.event.subscribe()
  let text = ""
  let done = false

  const eventPromise = (async () => {
    for await (const event of events.stream) {
      const props = event.properties || {}
      if (props.sessionID && props.sessionID !== sessionId) continue

      if (event.type === "message.part.updated" && props.part?.id) {
        const part = props.part

        if (part.type === "text" && part.text !== undefined) {
          text = part.text
        }

        if (part.type === "step-finish" && part.reason === "stop") {
          done = true
          break
        }
      }
    }
  })()

  await Promise.all([
    client.session.prompt({
      path: { id: sessionId },
      body: {
        model: { providerID: "opencode-go", modelID: "deepseek-v4-flash" },
        parts: [{ type: "text", text: "What is 2+2? Answer with just the number." }],
      },
    }),
    eventPromise,
  ])

  if (!done) throw new Error("no done event received")
  if (text.trim().length === 0) throw new Error("response text is empty")

  console.log(`  response: "${text.trim()}"`)
  console.log("  PASS")
}

async function testCloseSession(sessionId) {
  console.log("\n=== Test 4: Close Session ===")
  await client.session.delete({ path: { id: sessionId } })
  console.log("  PASS")
}

async function main() {
  console.log(`Connecting to ${SANDBOX_URL}...`)

  let sessionId
  try {
    sessionId = await testCreateSession()
    await testRun(sessionId)
    await testRunWithModel(sessionId)
    await testCloseSession(sessionId)
    console.log("\n=== All tests passed ===")
  } catch (err) {
    console.error(`\nFAILED: ${err.message}`)
    process.exitCode = 1
  }
}

main().catch(err => {
  console.error("error:", err.message)
  process.exit(1)
})