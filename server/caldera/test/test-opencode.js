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
  let toolCount = 0
  let usage = null
  let done = false
  const partTypes = {} // track part id -> type

  const eventPromise = (async () => {
    for await (const event of events.stream) {
      const props = event.properties || {}
      if (props.sessionID && props.sessionID !== sessionId) continue

      // Record part types as they are created/updated
      if (event.type === "message.part.updated" && props.part?.id) {
        partTypes[props.part.id] = props.part.type

        if (props.part.type === "reasoning") {
          log("event", "thinking started")
        }

        if (props.part.type === "tool") {
          toolCount++
          log("tool", `${props.part.tool} (${props.part.state?.status})`)
        }

        if (props.part.type === "step-finish") {
          if (props.part?.usage) {
            usage = props.part.usage
            log("usage", JSON.stringify(usage))
          }
          done = true
          break
        }
      }

      // Look up part type by id when processing deltas
      if (event.type === "message.part.delta" && props.field === "text") {
        const partType = partTypes[props.partID] 

        if (partType === "reasoning") {
          thinking += props.delta || ""
        } else {
          text += props.delta || ""
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
  console.log(`  tools used: ${toolCount}`)
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
      // console.log("RAW EVENT:", JSON.stringify(event, null, 2))
      if (event.type === "message.part.delta" && props.field === "text") {
        text += props.delta || ""
      }

      if (event.type === "message.part.updated" && props.part?.type === "step-finish") {
        done = true
        break
      }
    }
  })()

  // FIX: same here, correct method and param shape
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
  // FIX: session.destroy -> session.delete
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