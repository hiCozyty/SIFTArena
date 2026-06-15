import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { initializeOpencodeSessionFromDocker } from "./workflows.js"

const ROOT_DIR = join(import.meta.dir, "..", "..")

let currentRunAbort = null

export async function runOpencodeWorkflow(_, __, data, ws) {
  const { playbookName, workflowName, model } = data.data || {}

  if (!playbookName || !workflowName || !model) {
    console.error("[runWorkflow] missing required params")
    throw new Error("playbookName, workflowName, and model are required")
  }

  await initializeOpencodeSessionFromDocker(_, __, { data: { workflowName } })

  const gtPath = join(ROOT_DIR, "groundTruth", playbookName, "groundTruth.json")
  const gtRaw = await Bun.file(gtPath).text()
  const gt = JSON.parse(gtRaw)
  const startMs = gt.timeline[0].startedAt
  const endMs = gt.timeline[gt.timeline.length - 1].finishedAt
  if (!startMs || !endMs) {
    throw new Error("Attack window not found in ground truth")
  }

  const slash = model.indexOf("/")
  if (slash === -1) throw new Error(`Invalid model format: ${model}`)
  const providerID = model.slice(0, slash)
  const modelID = model.slice(slash + 1)
  const timestamp = Date.now()

  const prompt = `Playbook: ${playbookName}
Evidence: /home/sift/evidence/${playbookName}
Results: /home/sift/results/${playbookName}/${providerID}/${modelID}/${timestamp}
Model: ${model}
Attack window: ${startMs} - ${endMs}`

  const API_KEY = process.env.OPENCODE_API_KEY
  if (!API_KEY) {
    throw new Error("OPENCODE_API_KEY environment variable is required")
  }

  const client = createOpencodeClient({ baseUrl: "http://localhost:3113" })
  await client.auth.set({ providerID: "opencode-go", auth: { type: "api", key: API_KEY } })
  await client.auth.set({ providerID: "opencode", auth: { type: "api", key: API_KEY } })
  const { data: { id: sessionId } } = await client.session.create()
  const abortController = new AbortController()
  currentRunAbort = abortController

  ws.send(JSON.stringify({ type: "runOpencodeWorkflow:start", sessionId }))
  const events = await client.event.subscribe()
  const resultsDir = join(ROOT_DIR, "results", playbookName, providerID, modelID, String(timestamp))
  await mkdir(resultsDir, { recursive: true })
  const pollTimer = setInterval(async () => {
    if (abortController.signal.aborted) return
    try {
      const { data: session } = await client.session.get({ sessionID: sessionId })
      if (session?.tokens) {
        const t = session.tokens
        const c = session.cost ?? 0
        ws.send(JSON.stringify({
          type: "runOpencodeWorkflow:tokens",
          tokens: { input: t.input, output: t.output, reasoning: t.reasoning, cost: c },
        }))
      }
    } catch {}
    if (rounds.length > 0) {
      try {
        await writeFile(join(resultsDir, "rounds.json"), JSON.stringify({ rounds, tokens: null, cost: null }, null, 2))
      } catch {}
    }
  }, 1000)

  client.session.promptAsync({
    sessionID: sessionId,
    model: { providerID, modelID },
    parts: [{ type: "text", text: prompt }],
  }).then(() => {
    }).catch(err => {
    if (!abortController.signal.aborted) {
      console.error("[runWorkflow] promptAsync error:", err.message)
      ws.send(JSON.stringify({ type: "runOpencodeWorkflow:error", error: err.message }))
    }
  })

  let round = 0
  let inReasoning = false
  let currentThinking = ""
  let currentText = ""
  let currentToolCalls = []
  let accumulatedThinking = ""
  let textBuffer = ""
  const rounds = []
  let eventCount = 0

  const watchdogTimer = setInterval(() => {
    if (abortController.signal.aborted) return
    }, 10000)

  try {
    for await (const event of events.stream) {
      if (abortController.signal.aborted) break

      eventCount++
      const et = event.type

      if (eventCount <= 5 || eventCount % 50 === 0) {
        }

      if (et === "message.part.updated") {
        const props = event.properties || {}
        const part = props.part
        const delta = props.delta

        if (part?.type === "reasoning") {
          if (!inReasoning) {
            if (currentThinking || currentText || currentToolCalls.length > 0) {
              const roundData = {
                round,
                thinking: currentThinking,
                text: currentText,
                toolCalls: [...currentToolCalls],
              }
              rounds.push(roundData)
              ws.send(JSON.stringify({
                type: "runOpencodeWorkflow:roundComplete",
                ...roundData,
              }))
            }
            round++
            inReasoning = true
            currentThinking = ""
            currentText = ""
            currentToolCalls = []
          }
          accumulatedThinking += part.text
          currentThinking += part.text
          ws.send(JSON.stringify({ type: "runOpencodeWorkflow:thinking", text: part.text, round }))
        }

        if ((part?.type === "text" || delta) && (part?.text || delta)) {
          inReasoning = false
          const text = part?.text || delta
          textBuffer += text
          currentText += text
          ws.send(JSON.stringify({ type: "runOpencodeWorkflow:text", text, round: round || 1 }))
        }

        if (part?.type === "tool") {
          inReasoning = false
          if (round === 0) {
            round = 1
            currentThinking = ""
            currentText = ""
            currentToolCalls = []
          }
          const state = part.state || {}
          const tc = {
            callID: part.callID,
            tool: part.tool,
            status: state.status,
            input: state.input,
            output: state.status === "completed" ? state.output : undefined,
            error: state.status === "error" ? state.error : undefined,
          }
          if (state.status === "running") {
            currentToolCalls.push(tc)
          } else {
            const idx = currentToolCalls.findIndex(t => t.callID === tc.callID)
            if (idx >= 0) currentToolCalls[idx] = tc
            else currentToolCalls.push(tc)
          }
          ws.send(JSON.stringify({ type: "runOpencodeWorkflow:tool", round, ...tc }))
        }

        if (part?.type === "step-finish") {
          if (part.reason === "stop" || part.reason === "error") {
            if (currentThinking || currentText || currentToolCalls.length > 0) {
              const roundData = {
                round,
                thinking: currentThinking,
                text: currentText,
                toolCalls: [...currentToolCalls],
              }
              rounds.push(roundData)
              ws.send(JSON.stringify({
                type: "runOpencodeWorkflow:roundComplete",
                ...roundData,
              }))
            }
            ws.send(JSON.stringify({
              type: "runOpencodeWorkflow:final",
              thinking: accumulatedThinking,
              text: textBuffer,
            }))
            break
          }
        }
      }

      if (et === "message.part.delta") {
        const delta = event.properties?.delta
        if (delta) {
          textBuffer += delta
          currentText += delta
          ws.send(JSON.stringify({ type: "runOpencodeWorkflow:text", text: delta, round: round || 1 }))
        }
      }
    }
  } finally {
    clearInterval(watchdogTimer)
    clearInterval(pollTimer)
    currentRunAbort = null
  }

  let tokens = null
  let cost = null
  try {
    const { data: session } = await client.session.get({ sessionID: sessionId })
    if (session?.tokens) {
      tokens = { input: session.tokens.input, output: session.tokens.output, reasoning: session.tokens.reasoning }
    }
    cost = session?.cost ?? null
  } catch {}

  ws.send(JSON.stringify({ type: "runOpencodeWorkflow:done", tokens, cost }))

  try {
    try {
      await Bun.write(join(resultsDir, "groundTruth.json"), await Bun.file(gtPath).text())
      } catch (gtErr) {
      console.error("[runWorkflow] failed to write groundTruth.json:", gtErr.message)
    }
    await Bun.write(join(resultsDir, "rounds.json"), JSON.stringify({ rounds, tokens, cost }, null, 2))
    } catch (writeErr) {
    console.error("[runWorkflow] failed to write rounds.json:", writeErr.message)
  }
}

export async function abortOpencodeWorkflow() {
  if (currentRunAbort) {
    currentRunAbort.abort()
    currentRunAbort = null
  }
  return { success: true }
}
