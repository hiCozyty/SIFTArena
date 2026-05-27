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

async function testAbortAndRecover(sessionId) {
  console.log("\n=== Test 5: Abort Question Tool, Then Recover Session ===")

  // Phase 1: Subscribe to events, trigger question tool, then abort
  const events1 = await client.event.subscribe()
  let questionToolPart = null
  let abortCalled = false
  let phase1Done = false

  const eventPromise1 = (async () => {
    for await (const event of events1.stream) {
      const props = event.properties || {}
      if (props.sessionID && props.sessionID !== sessionId) continue

      console.log(`  [event] type=${event.type}`)
      if (props.part) {
        const p = props.part
        console.log(`    part: id=${p.id}, type=${p.type}, tool=${p.tool ?? "n/a"}, state=${JSON.stringify(p.state)}, reason=${p.reason ?? "n/a"}, text=${(p.text ?? "").substring(0, 60)}`)
      }

      if (event.type === "message.part.updated" && props.part?.id) {
        const part = props.part

        if (part.type === "tool" && part.tool === "question" && !abortCalled) {
          questionToolPart = part
          abortCalled = true
          console.log("  [event] question tool detected, calling abort...")

          try {
            await client.session.abort({ path: { id: sessionId } })
            console.log("  [event] abort call succeeded")
          } catch (err) {
            console.log(`  [event] abort call failed: ${err.message}`)
          }
        }

        if (part.type === "tool" && part.tool === "question" && part.state?.status === "error") {
          console.log("  [event] question tool in error state, phase 1 done")
          phase1Done = true
          break
        }

        if (part.type === "step-finish") {
          console.log(`  [event] step-finish reason=${part.reason}`)
          if (phase1Done || part.reason === "stop" || part.reason === "error") {
            break
          }
        }
      }
    }
  })()

  const timeout1 = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Phase 1 timed out after 30s")), 30000)
  )

  await Promise.race([
    Promise.all([
      client.session.prompt({
        path: { id: sessionId },
        body: {
          model: { providerID: "opencode-go", modelID: "deepseek-v4-flash" },
          parts: [{ type: "text", text: "Ask me a random question using the question tool." }],
        },
      }),
      eventPromise1,
    ]),
    timeout1,
  ])

  if (!questionToolPart) throw new Error("no question tool event received before abort")
  console.log(`  Phase 1 complete: abortCalled=${abortCalled}, phase1Done=${phase1Done}`)

  // Phase 2: Re-subscribe to events, send "say ok", check if session recovers
  console.log("\n  Phase 2: Re-subscribing and sending 'say ok'...")

  const events2 = await client.event.subscribe()
  let recoveredText = ""
  let recoveredDone = false

  const eventPromise2 = (async () => {
    for await (const event of events2.stream) {
      const props = event.properties || {}
      if (props.sessionID && props.sessionID !== sessionId) continue

      console.log(`  [event] type=${event.type}`)
      if (props.part) {
        const p = props.part
        console.log(`    part: id=${p.id}, type=${p.type}, tool=${p.tool ?? "n/a"}, state=${JSON.stringify(p.state)}, reason=${p.reason ?? "n/a"}, text=${(p.text ?? "").substring(0, 60)}`)
      }

      if (event.type === "message.part.updated" && props.part?.id) {
        const part = props.part

        if (part.type === "text" && part.text !== undefined) {
          recoveredText = part.text
        }

        if (part.type === "step-finish" && part.reason === "stop") {
          recoveredDone = true
          break
        }
      }
    }
  })()

  const timeout2 = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Phase 2 timed out after 30s")), 30000)
  )

  await Promise.race([
    Promise.all([
      client.session.prompt({
        path: { id: sessionId },
        body: {
          model: { providerID: "opencode-go", modelID: "deepseek-v4-flash" },
          parts: [{ type: "text", text: "say ok" }],
        },
      }),
      eventPromise2,
    ]),
    timeout2,
  ])

  if (!recoveredDone) throw new Error("no step-finish event received after 'say ok' prompt")
  if (recoveredText.trim().length === 0) throw new Error("response text is empty after recovery")

  console.log(`  Phase 2 complete: response="${recoveredText.trim()}"`)
  console.log("  PASS")
}

async function testCloseSession(sessionId) {
  console.log("\n=== Test 6: Close Session ===")
  await client.session.delete({ path: { id: sessionId } })
  console.log("  PASS")
}

async function main() {
  console.log(`Connecting to ${SANDBOX_URL}...`)

  let sessionId
  try {
    sessionId = await testCreateSession()
    // await testRun(sessionId)
    // await testRunWithModel(sessionId)
    await testAbortAndRecover(sessionId)
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