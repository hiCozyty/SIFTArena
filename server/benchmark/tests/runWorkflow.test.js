import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

const PLAYBOOK = "five_abilities_no_noise"
const WORKFLOW = "five_phase_workflow_with_mcp"
const MODEL = "opencode-go/deepseek-v4-flash"

// opencode/deepseek-v4-flash-free	DeepSeek V4 Flash Free
// opencode/big-pickle	Big Pickle
// opencode/mimo-v2.5-free	MiMo V2.5 Free
// opencode/north-mini-code-free	North Mini Code Free
// opencode/nemotron-3-ultra-free	Nemotron 3 Ultra Free

// const MODEL = "opencode/deepseek-v4-flash-free"


const PROVIDER = MODEL.split("/")[0]
const MODEL_NAME = MODEL.split("/")[1]
const RUN_TS = Date.now()
const API_KEY = process.env.OPENCODE_API_KEY

async function sshExec(cmd, timeoutMs = 120_000) {
  const proc = Bun.spawn([
    "sshpass", "-p", "forensics", "ssh",
    "-p", "2222",
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "LogLevel=ERROR",
    "-n",
    "sift@localhost",
    cmd,
  ], { stdin: "ignore", timeout: timeoutMs })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  await proc.exited
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: proc.exitCode }
}

async function writeRounds(rounds) {
  const dir = join("results", PLAYBOOK, PROVIDER, MODEL_NAME, String(RUN_TS))
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, "rounds.json"), JSON.stringify(rounds, null, 2))
}

async function initOpencode() {
  const remoteCmd = `kill $(lsof -t -i:3113) 2>/dev/null; cd /home/sift/workflows/${WORKFLOW} && ( setsid opencode serve --port 3113 --hostname 0.0.0.0 < /dev/null > /tmp/opencode-serve.log 2>&1 & ); ok=false; for i in $(seq 1 30); do curl -s --head --max-time 3 http://localhost:3113/provider >/dev/null 2>&1 && { ok=true; break; }; sleep 0.2; done; $ok && echo OK || echo FAIL`

  const proc = Bun.spawn([
    "sshpass", "-p", "forensics", "ssh",
    "-p", "2222",
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "ConnectTimeout=10",
    "-n",
    "sift@localhost",
    remoteCmd,
  ], { stdin: "ignore", timeout: 30_000 })

  const stdout = await new Response(proc.stdout).text()
  const trimmed = stdout.trim()
  if (!trimmed.endsWith("OK")) {
    const stderr = await new Response(proc.stderr).text()
    throw new Error(`Opencode init failed: ${stderr || trimmed}`)
  }
  proc.kill()
}

async function main() {
  console.log(`=== Run Workflow Test ===`)
  console.log(`Workflow: ${WORKFLOW}`)
  console.log(`Playbook: ${PLAYBOOK}`)
  console.log(`Model: ${MODEL}\n`)

  console.log("[init] Starting opencode on SIFT...")
  await initOpencode()
  console.log("[init] Opencode ready\n")

  const startMs = 1781464734067
  const endMs = 1781464784168
  console.log(`[attackWindow] ${startMs} - ${endMs}`)

  const client = createOpencodeClient({ baseUrl: "http://localhost:3113" })

  console.log("[cleanup] Aborting past sessions...")
  const { data: sessions } = await client.session.list()
  for (const s of sessions) {
    try {
      await client.session.abort({ sessionID: s.id })
      console.log(`  aborted ${s.id} (${s.title || "untitled"})`)
    } catch (e) {
      // ignore already-aborted sessions
    }
  }
  console.log(`[cleanup] Aborted ${sessions.length} session(s)\n`)

  const prompt = `Playbook: ${PLAYBOOK}
Evidence: /home/sift/evidence/${PLAYBOOK}
Results: /home/sift/results/${PLAYBOOK}/${PROVIDER}/${MODEL_NAME}/${RUN_TS}
Model: ${MODEL}
Attack window: ${startMs} - ${endMs}`

  const { data: { id: sessionId } } = await client.session.create()
  console.log(`[session] Created: ${sessionId}\n`)

  const abort = new AbortController()
  let pollTimer = null

  process.on("SIGINT", async () => {
    console.log("\n[abort] Ctrl+C received, aborting session...")
    clearInterval(pollTimer)
    abort.abort()
    try {
      await client.session.abort({ sessionID: sessionId })
      console.log("[abort] Session aborted")
    } catch (e) {
      console.log("[abort] Abort error:", e.message)
    }
    process.exit(0)
  })

  console.log(`[auth] Setting opencode-go API key...`)
  await client.auth.set({
    providerID: "opencode-go",
    auth: { type: "api", key: API_KEY },
  })
  console.log(`[auth] opencode-go authenticated`)
  console.log(`[auth] Setting opencode (Zen) API key...`)
  await client.auth.set({
    providerID: "opencode",
    auth: { type: "api", key: API_KEY },
  })
  console.log(`[auth] opencode (Zen) authenticated\n`)

  pollTimer = setInterval(async () => {
    try {
      const { data: session } = await client.session.get({ sessionID: sessionId })
      if (session?.tokens) {
        const t = session.tokens
        const total = t.input + t.output + t.reasoning
        console.log(`[tokens] input=${t.input} output=${t.output} reasoning=${t.reasoning} total=${total} cost=${session.cost ?? "N/A"}`)
      }
      if (lastEventTime && session && Date.now() - lastEventTime > 15_000) {
        const silence = Math.round((Date.now() - lastEventTime) / 1000)
        if (toolRunningSince) {
          const toolDur = Math.round((Date.now() - toolRunningSince.since) / 1000)
          console.log(`[diag:stall] ${silence}s no events — tool "${toolRunningSince.tool}" running for ${toolDur}s`)
        } else {
          console.log(`[diag:stall] ${silence}s no events — last event: ${lastEventType || "?"} — status=${session.status ?? "?"}`)
        }
      }
      if (rounds.length > 0) { await writeRounds(rounds) }
    } catch (_) {
      // session.get may fail transiently; ignore
    }
  }, 1000)

  console.log("[events] Calling client.event.subscribe...")
  const events = await client.event.subscribe()
  console.log("[events] Subscribed successfully, sending prompt...\n")

  const [providerID, modelID] = MODEL.split("/")
  console.log(`[prompt] Calling promptAsync with model=${providerID}/${modelID}...`)
  client.session.promptAsync({
    sessionID: sessionId,
    model: { providerID, modelID },
    parts: [{ type: "text", text: prompt }],
  }).then(async () => {
    console.log("[prompt] promptAsync resolved successfully")
    try {
      const { data: s } = await client.session.get({ sessionID: sessionId })
      console.log(`[diag:session] status=${s.status ?? "?"} model=${JSON.stringify(s.model)}`)
    } catch (_) {}
  }).catch(err => {
    if (!abort.signal.aborted) {
      console.error("[prompt] Error:", err.message)
    } else {
      console.log("[prompt] Aborted")
    }
  })

  let textBuffer = ""
  let eventCount = 0
  let round = 0
  let inReasoning = false
  let accumulatedThinking = ""
  let lastEventTime = Date.now()
  let lastEventType = ""
  let toolRunningSince = null

  let rounds = []
  let currentThinking = ""
  let currentText = ""
  let currentToolCalls = []

  console.log("[stream] Waiting for response...\n")

  try {
    for await (const event of events.stream) {
      if (abort.signal.aborted) break

      eventCount++

      if (eventCount <= 8) {
        const ev = { type: event.type }
        if (event.properties) {
          const p = event.properties
          if (p.part) ev.partType = p.part.type
          if (p.delta) ev.delta = p.delta.slice(0, 80)
          if (p.permission) ev.permission = p.permission
        }
        console.log(`[diag:event #${eventCount}]`, JSON.stringify(ev))
      }

      lastEventTime = Date.now()
      lastEventType = event.type

      const et = event.type

      if (et === "permission.asked") {
        const { id: requestID, permission, patterns } = event.properties
        console.log(`[permission] Auto-approving ${permission}: ${patterns?.join(", ")}`)
        await client.permission.reply({ requestID, reply: "once" })
        continue
      }

      if (et === "message.part.updated") {
        const part = event.properties?.part

        if (part?.type === "step-finish") {
          if (part.reason === "stop" || part.reason === "error") {
            if (currentThinking || currentText || currentToolCalls.length > 0) {
              rounds.push({ thinking: currentThinking, text: currentText, toolCalls: [...currentToolCalls] })
            }
            rounds.push({ thinking: accumulatedThinking, final: textBuffer })
            break
          }
          continue
        }

        if (part?.type === "reasoning" && part.text) {
          if (!inReasoning) {
            if (round > 0 && (currentThinking || currentText || currentToolCalls.length > 0)) {
              rounds.push({ thinking: currentThinking, text: currentText, toolCalls: [...currentToolCalls] })
            }
            round++
            process.stdout.write(`\n[round ${round}]\n`)
            inReasoning = true
            currentThinking = ""
            currentText = ""
            currentToolCalls = []
          }
          accumulatedThinking += part.text
          currentThinking += part.text
        }

        if (part?.type === "text" && part.text) {
          inReasoning = false
          textBuffer += part.text
          currentText += part.text
          process.stdout.write(part.text)
        }

        if (part?.type === "tool") {
          inReasoning = false
          const state = part.state || {}
          if (state.status === "running") {
            const cmd = state.input?.command || state.input?.cmd || state.input?.query
            if (round === 0) { round++; currentThinking = ""; currentText = ""; currentToolCalls = []; process.stdout.write(`\n[round ${round}]\n`) }
            const desc = cmd ? `${part.tool}: ${cmd}` : part.tool
            console.log(`[tool] ${desc}`)
            currentToolCalls.push(desc)
            toolRunningSince = { tool: part.tool, since: Date.now() }
          }
          if (state.status === "completed") {
            const dur = toolRunningSince ? Math.round((Date.now() - toolRunningSince.since) / 1000) : "?"
            console.log(`[tool:done] ${part.tool} (${dur}s)`)
            toolRunningSince = null
          }
          if (state.status === "error") {
            console.log(`[tool:error] ${part.tool}: ${state.error}`)
            toolRunningSince = null
          }
        }
      }

      if (et === "message.part.delta") {
        const delta = event.properties?.delta
        if (delta) {
          textBuffer += delta
          currentText += delta
          process.stdout.write(delta)
        }
      }
    }
  } catch (err) {
    if (!abort.signal.aborted) {
      console.error(`\n[stream] ERROR:`, err.message)
    } else {
      console.log(`\n[stream] Aborted`)
    }
  }

  clearInterval(pollTimer)

  if (rounds.length > 0) {
    try { await writeRounds(rounds) } catch (_) {}
  }

  try {
    const { data: session } = await client.session.get({ sessionID: sessionId })
    if (session?.tokens) {
      const t = session.tokens
      const total = t.input + t.output + t.reasoning
      console.log(`[tokens:final] input=${t.input} output=${t.output} reasoning=${t.reasoning} total=${total} cost=${session.cost ?? "N/A"}`)
    }
  } catch (_) {}

  console.log(`\n\n[output]\n${textBuffer}`)
  console.log("\n\n\x1b[32m[done] Workflow complete\x1b[0m")
  console.log(`\x1b[32m[summary] Text output: ${textBuffer.length} chars, ${eventCount} events\x1b[0m`)
}

if (import.meta.main) main()
