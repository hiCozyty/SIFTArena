import { createOpencodeClient } from "@opencode-ai/sdk/client"
import { join } from "node:path"
import { initializeOpencodeSessionFromDocker } from "./workflows.js"

const ROOT_DIR = join(import.meta.dir, "..", "..")

let currentRunAbort = null

export async function runOpencodeWorkflow(_, __, data, ws) {
  const { playbookName, workflowName, model } = data.data || {}

  if (!playbookName || !workflowName || !model) {
    throw new Error("playbookName, workflowName, and model are required")
  }

  await initializeOpencodeSessionFromDocker(_, __, { data: { workflowName } })

  const gtPath = join(ROOT_DIR, "evidence", playbookName, "groundTruth.json")
  const gtRaw = await Bun.file(gtPath).text()
  const gt = JSON.parse(gtRaw)
  const startMs = gt.attackStart ?? gt.WINDOW_START_MS
  const endMs = gt.attackEnd ?? gt.WINDOW_END_MS

  if (!startMs || !endMs) {
    throw new Error("Attack window not found in ground truth")
  }

  const prompt = `Playbook: ${playbookName}
Evidence: /home/sift/evidence/${playbookName}
Results: /home/sift/results/${playbookName}
Model: ${model}
Attack window: ${startMs} - ${endMs}`

  const slash = model.indexOf("/")
  if (slash === -1) throw new Error(`Invalid model format: ${model}`)
  const providerID = model.slice(0, slash)
  const modelID = model.slice(slash + 1)

  const client = createOpencodeClient({ baseUrl: "http://localhost:3113" })
  const { data: { id: sessionId } } = await client.session.create()

  const abortController = new AbortController()
  currentRunAbort = abortController

  ws.send(JSON.stringify({ type: "runOpencodeWorkflow:start", sessionId }))

  const events = await client.event.subscribe({ signal: abortController.signal })

  client.session.promptAsync({
    path: { id: sessionId },
    body: {
      model: { providerID, modelID },
      parts: [{ type: "text", text: prompt }],
    },
    signal: abortController.signal,
  }).catch(err => {
    if (!abortController.signal.aborted) {
      ws.send(JSON.stringify({ type: "runOpencodeWorkflow:error", error: err.message }))
    }
  })

  try {
    for await (const event of events.stream) {
      if (abortController.signal.aborted) break

      const et = event.type

      if (et === "message.part.updated") {
        const props = event.properties || {}
        const part = props.part
        const delta = props.delta

        if (part?.type === "reasoning") {
          ws.send(JSON.stringify({ type: "runOpencodeWorkflow:thinking", text: part.text }))
        }

        if ((part?.type === "text" || delta) && (part?.text || delta)) {
          ws.send(JSON.stringify({ type: "runOpencodeWorkflow:text", text: part?.text || delta }))
        }

        if (part?.type === "tool") {
          const state = part.state || {}
          ws.send(JSON.stringify({
            type: "runOpencodeWorkflow:tool",
            callID: part.callID,
            tool: part.tool,
            status: state.status,
            input: state.input,
            output: state.status === "completed" ? state.output : undefined,
            error: state.status === "error" ? state.error : undefined,
          }))
        }

        if (part?.type === "step-finish") {
          ws.send(JSON.stringify({
            type: "runOpencodeWorkflow:usage",
            tokens: part.tokens,
            cost: part.cost,
            reason: part.reason,
          }))
        }
      }

      if (et === "message.part.delta") {
        const delta = event.properties?.delta
        if (delta) {
          ws.send(JSON.stringify({ type: "runOpencodeWorkflow:text", text: delta }))
        }
      }
    }
  } finally {
    currentRunAbort = null
  }

  ws.send(JSON.stringify({ type: "runOpencodeWorkflow:done" }))
}

export async function abortOpencodeWorkflow() {
  if (currentRunAbort) {
    currentRunAbort.abort()
    currentRunAbort = null
  }
  return { success: true }
}
