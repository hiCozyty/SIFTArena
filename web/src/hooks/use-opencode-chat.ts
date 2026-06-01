import { createOpencodeClient } from "@opencode-ai/sdk/client"
import { useCallback, useEffect, useRef, useState } from "react"
import type { Message, ToolInvocation } from "@/components/ui/chat-message"

interface PartInfo {
  type: string
  content: string
}

interface EventProps {
  sessionID?: string
  partID?: string
  part?: {
    id: string
    type: string
    usage?: unknown
    text?: string
    reason?: string
    tool?: string
    callID?: string
    input?: Record<string, unknown>
    state?: {
      status?: "pending" | "running" | "completed" | "error"
      input?: Record<string, unknown>
      output?: string
      error?: string
      title?: string
      metadata?: Record<string, unknown>
      time?: { start: number; end?: number }
    }
  }
  field?: string
  delta?: string
}

interface UseOpencodeChatOptions {
  baseUrl?: string
}

export function useOpencodeChat({ baseUrl }: UseOpencodeChatOptions = {}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isToolExecuting, setIsToolExecuting] = useState(false)

  const clientRef = useRef<ReturnType<typeof createOpencodeClient> | null>(null)
  const assistantMessageIdRef = useRef<string | null>(null)
  const partsRef = useRef<Map<string, PartInfo>>(new Map())
  const toolInvocationsRef = useRef<Map<string, ToolInvocation>>(new Map())
  const streamAbortRef = useRef<AbortController | null>(null)
  const promptAbortRef = useRef<AbortController | null>(null)
  const activeSessionIdRef = useRef<string | null>(null)
  const lastUserMessageRef = useRef<string>("")
  const activeAssistantMessageIdRef = useRef<string | null>(null)
  const activeGenerationIdRef = useRef<string | null>(null)
  const partGenerationMapRef = useRef<Map<string, string>>(new Map())

  const eventLoopRunningRef = useRef(false)
  const subscribeReadyRef = useRef<Promise<void> | null>(null)
  const eventLoopExitedRef = useRef<Promise<void> | null>(null)
  let resolveEventLoopExited: (() => void) | null = null

  async function startEventLoop() {
    const client = clientRef.current
    const sessionId = activeSessionIdRef.current
    if (!client || !sessionId) return
    if (eventLoopRunningRef.current) {
      return
    }
    eventLoopRunningRef.current = true

    let resolveSubscribeReady!: () => void
    subscribeReadyRef.current = new Promise<void>(resolve => {
      resolveSubscribeReady = resolve
    })

    resolveEventLoopExited = null
    eventLoopExitedRef.current = new Promise<void>(resolve => {
      resolveEventLoopExited = resolve
    })

    try {
      const abortController = new AbortController()
      streamAbortRef.current = abortController
      const events = await client.event.subscribe({ signal: abortController.signal })

      resolveSubscribeReady()

      try {
        for await (const event of events.stream) {
          if (abortController.signal.aborted) break
          const props = (event.properties || {}) as EventProps
          if (props.sessionID && props.sessionID !== activeSessionIdRef.current) {
            continue
          }

          if ((event.type as string) === "message.part.updated" && props.part?.id) {
            const partId = props.part.id
            const genCheck = !!(activeGenerationIdRef.current && activeAssistantMessageIdRef.current)
            if (!genCheck) continue
            const recordedGen = partGenerationMapRef.current.get(partId)
            if (recordedGen === undefined) {
              partGenerationMapRef.current.set(partId, activeGenerationIdRef.current)
            } else if (recordedGen !== activeGenerationIdRef.current) {
              continue
            }
            if (!partsRef.current.has(props.part.id)) {
              partsRef.current.set(props.part.id, {
                type: props.part.type,
                content: "",
              })
            }
            if (props.part.type === "step-finish") {
              if (props.part.reason === "stop") {
                finalizeMessage()
              }
              continue
            }
            const existing = partsRef.current.get(props.part.id)
            if (existing && props.part.text !== undefined) {
              existing.content = props.part.text
              if (props.part.type === "text" || props.part.type === "reasoning") {
                updateStreamingMessage()
              }
            }
            if (props.part.type === "tool" && props.part.tool) {
              const toolName = props.part.tool
              const state = props.part.state
              const callID = props.part.callID || props.part.id
              const input = state?.input || props.part.input
              let invocation: ToolInvocation
              if (state?.status === "completed" || state?.status === "error") {
                const existing = toolInvocationsRef.current.get(callID)
                const existingInput = existing && "input" in existing ? existing.input : undefined
                const resultObj = state.status === "error"
                  ? { __error: state.error }
                  : { output: state.output }
                invocation = {
                  state: "result",
                  toolName,
                  input: existingInput || input,
                  result: resultObj,
                  callID,
                }
              } else {
                invocation = { state: "call", toolName, input, callID }
              }
              toolInvocationsRef.current.set(callID, invocation)
              updateStreamingMessage()
            }
          }

          if ((event.type as string) === "message.part.delta" && props.partID) {
            const partId = props.partID
            const genCheck = !!(activeGenerationIdRef.current && activeAssistantMessageIdRef.current)
            if (!genCheck) continue
            const recordedGen = partGenerationMapRef.current.get(partId)
            if (recordedGen === undefined) {
              partGenerationMapRef.current.set(partId, activeGenerationIdRef.current)
            } else if (recordedGen !== activeGenerationIdRef.current) {
              continue
            }
            let existing = partsRef.current.get(props.partID)
            if (!existing) {
              existing = { type: "text", content: "" }
              partsRef.current.set(props.partID, existing)
            }
            if (props.field === "text") {
              existing.content += props.delta || ""
              updateStreamingMessage()
            }
          }
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          setError(err instanceof Error ? err.message : "Stream error")
          setIsGenerating(false)
          setIsToolExecuting(false)
          activeGenerationIdRef.current = null
          activeAssistantMessageIdRef.current = null
        }
      }
    } catch (err) {
      resolveSubscribeReady()
    } finally {
      eventLoopRunningRef.current = false
      resolveEventLoopExited?.()
      resolveEventLoopExited = null
    }
  }

  async function reconnectEventStream() {
    const oldLoopExited = eventLoopExitedRef.current
    streamAbortRef.current?.abort()
    streamAbortRef.current = null
    subscribeReadyRef.current = null

    if (oldLoopExited) {
      await oldLoopExited
    }

    startEventLoop()
  }

  useEffect(() => {
    let mounted = true
    const wsUrl = import.meta.env.VITE_BACKEND_WS_URL || "ws://localhost:8011"
    const httpUrl = baseUrl || wsUrl.replace("ws://", "http://").replace("wss://", "https://")
    const finalUrl = httpUrl.endsWith(":8011") ? httpUrl.replace(":8011", ":3111") : httpUrl

    const client = createOpencodeClient({ baseUrl: finalUrl })
    clientRef.current = client

    async function init() {
      try {
        const session = await client.session.create()
        const id = session.data?.id
        if (!id) throw new Error("No session ID returned")

        if (!mounted) return

        activeSessionIdRef.current = id
        setSessionId(id)

        startEventLoop()
      } catch (err) {
        if (!mounted) return
        setError(err instanceof Error ? err.message : "Failed to initialize session")
      }
    }

    init()

    return () => {
      mounted = false
      streamAbortRef.current?.abort()
      clientRef.current = null
      activeSessionIdRef.current = null
    }
  }, [baseUrl])

  function stripEchoedInput(text: string): string {
    const echoed = lastUserMessageRef.current.trim()
    if (!echoed) return text
    const normalized = text.trim()
    if (normalized.toLowerCase().startsWith(echoed.toLowerCase())) {
      return text.slice(echoed.length)
    }
    const patterns = [
      new RegExp(`^${echoed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"),
      new RegExp(`^.*?(?:look up|search for|find|check)\\s+.*?${echoed.split(" ").slice(0, 3).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*?")}\\s*`, "i"),
    ]
    for (const pattern of patterns) {
      const match = normalized.match(pattern)
      if (match && match[0].length < text.length * 0.5) {
        return text.slice(match[0].length)
      }
    }
    return text
  }

  function finalizeMessage() {
    activeGenerationIdRef.current = null
    const parts = Array.from(partsRef.current.values())
    const toolInvocations = Array.from(toolInvocationsRef.current.values())
    const rawTextContent = parts.filter((p) => p.type === "text").map((p) => p.content).join("")
    const textContent = stripEchoedInput(rawTextContent)
    const reasoningContent = parts.filter((p) => p.type === "reasoning").map((p) => p.content).join("")

    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === assistantMessageIdRef.current)
      if (idx === -1) return prev
      const updated = [...prev]
      updated[idx] = {
        ...updated[idx],
        content: textContent,
        parts: [
          ...(reasoningContent ? [{ type: "reasoning" as const, reasoning: reasoningContent }] : []),
          ...toolInvocations.map((inv) => ({ type: "tool-invocation" as const, toolInvocation: inv })),
          ...(textContent ? [{ type: "text" as const, text: textContent }] : []),
        ],
      }
      return updated
    })
    setIsGenerating(false)
    setIsToolExecuting(false)
    assistantMessageIdRef.current = null
    activeAssistantMessageIdRef.current = null
    partsRef.current.clear()
    toolInvocationsRef.current.clear()
    lastUserMessageRef.current = ""
  }

  function updateStreamingMessage() {
    const parts = Array.from(partsRef.current.values())
    const toolInvocations = Array.from(toolInvocationsRef.current.values())
    const rawTextContent = parts.filter((p) => p.type !== "reasoning").map((p) => p.content).join("")
    const textContent = stripEchoedInput(rawTextContent)
    const reasoningContent = parts.filter((p) => p.type === "reasoning").map((p) => p.content).join("")

    const hasActiveTool = toolInvocations.some((inv) => inv.state === "call" || inv.state === "partial-call")
    setIsToolExecuting(hasActiveTool)

    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === assistantMessageIdRef.current)
      if (idx === -1) return prev
      const updated = [...prev]
      updated[idx] = {
        ...updated[idx],
        content: textContent,
        parts: [
          ...(reasoningContent ? [{ type: "reasoning" as const, reasoning: reasoningContent }] : []),
          ...toolInvocations.map((inv) => ({ type: "tool-invocation" as const, toolInvocation: inv })),
          ...(textContent ? [{ type: "text" as const, text: textContent }] : []),
        ],
      }
      return updated
    })
  }

  const sendMessage = useCallback(
    async (content: string) => {
      const currentSessionId = activeSessionIdRef.current
      if (!clientRef.current || !currentSessionId) {
        setError("Not connected")
        return
      }

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        createdAt: new Date(),
      }
      const assistantId = crypto.randomUUID()
      const newGenId = crypto.randomUUID()
      activeGenerationIdRef.current = newGenId
      assistantMessageIdRef.current = assistantId
      activeAssistantMessageIdRef.current = assistantId

      const assistantMessage: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: new Date(),
      }

      setMessages((prev) => [...prev, userMessage, assistantMessage])
      setIsGenerating(true)
      setError(null)
      partsRef.current.clear()
      toolInvocationsRef.current.clear()
      partGenerationMapRef.current.clear()
      lastUserMessageRef.current = content

      if (subscribeReadyRef.current) {
        await subscribeReadyRef.current
      }

      try {
        promptAbortRef.current = new AbortController()
        await clientRef.current.session.promptAsync({
          path: { id: currentSessionId },
          body: {
            model: { providerID: "opencode-go", modelID: "deepseek-v4-flash" },
            parts: [{ type: "text", text: content }],
          },
          signal: promptAbortRef.current.signal,
        })
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          finalizeMessage()
          return
        }
        setError(err instanceof Error ? err.message : "Prompt failed")
        setIsGenerating(false)
        setIsToolExecuting(false)
        activeGenerationIdRef.current = null
        assistantMessageIdRef.current = null
        activeAssistantMessageIdRef.current = null
      }
    },
    [],
  )

  const stopGenerating = useCallback(async () => {
    for (const [callID, inv] of toolInvocationsRef.current.entries()) {
      if (inv.state === "call" || inv.state === "partial-call") {
        toolInvocationsRef.current.set(callID, {
          state: "result",
          toolName: inv.toolName,
          input: inv.input,
          result: { __cancelled: true },
        })
      }
    }
    updateStreamingMessage()
    activeGenerationIdRef.current = null
    activeAssistantMessageIdRef.current = null
    const currentSessionId = activeSessionIdRef.current
    if (clientRef.current && currentSessionId) {
      try {
        await clientRef.current.session.abort({ path: { id: currentSessionId } })
      } catch (err) {
        console.error("[opencode-chat] Abort error:", err)
      }
    }
    promptAbortRef.current?.abort()
    promptAbortRef.current = null
    finalizeMessage()
    await reconnectEventStream()
  }, [])

  const submitQuestionAnswer = useCallback(
    async (assistantMessageId: string, answers: Record<number, string>) => {
      const currentSessionId = activeSessionIdRef.current
      if (!clientRef.current || !currentSessionId) {
        console.error("[opencode-chat] submitQuestionAnswer: not connected")
        setError("Not connected")
        return
      }

      await clientRef.current.session.abort({ path: { id: currentSessionId } }).catch(() => {})
      await reconnectEventStream()

      activeGenerationIdRef.current = null
      activeAssistantMessageIdRef.current = null
      partsRef.current.clear()
      toolInvocationsRef.current.clear()
      partGenerationMapRef.current.clear()

      const questionMsg = messages.find(m => m.id === assistantMessageId)
      const questionInvocations = questionMsg?.parts?.filter(p => p.type === "tool-invocation" && p.toolInvocation.toolName === "question") || []
      const questionContext = questionInvocations.map((p, i) => {
        const input = p.toolInvocation.input as { questions?: Array<{ question?: string; header?: string; options?: Array<{ label?: string }> }> }
        const questions = input?.questions || []
        return questions.map((q, qi) => {
          const answer = answers[qi] || "No answer"
          const optionLabel = q.options?.[parseInt(answer)]?.label || answer
          return `Q${qi + 1}: ${q.question || "Unknown"}\nA${qi + 1}: ${optionLabel}`
        }).join("\n\n")
      }).filter(Boolean).join("\n\n") || Object.entries(answers).map(([qi, a]) => `Q${parseInt(qi) + 1}: ${a}`).join("\n\n")

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: questionContext,
        createdAt: new Date(),
      }
      const assistantId = crypto.randomUUID()
      const newGenId = crypto.randomUUID()
      activeGenerationIdRef.current = newGenId
      assistantMessageIdRef.current = assistantId
      activeAssistantMessageIdRef.current = assistantId

      const assistantMessage: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt: new Date(),
      }

      setMessages((prev) => [...prev, userMessage, assistantMessage])
      setIsGenerating(true)
      setError(null)
      partsRef.current.clear()
      toolInvocationsRef.current.clear()
      partGenerationMapRef.current.clear()
      lastUserMessageRef.current = questionContext

      if (subscribeReadyRef.current) {
        await subscribeReadyRef.current
        } else {
        }

      try {
        promptAbortRef.current = new AbortController()
        await clientRef.current.session.promptAsync({
          path: { id: currentSessionId },
          body: {
            model: { providerID: "opencode-go", modelID: "deepseek-v4-flash" },
            parts: [{ type: "text", text: questionContext }],
          },
          signal: promptAbortRef.current.signal,
        })
        } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          finalizeMessage()
          return
        }
        console.error("[opencode-chat] submitQuestionAnswer: prompt error:", err)
        setError(err instanceof Error ? err.message : "Prompt failed")
        setIsGenerating(false)
        setIsToolExecuting(false)
        activeGenerationIdRef.current = null
        assistantMessageIdRef.current = null
        activeAssistantMessageIdRef.current = null
      }
    },
    [messages],
  )

  const resetSession = useCallback(async () => {
    promptAbortRef.current?.abort()
    promptAbortRef.current = null

    activeGenerationIdRef.current = null
    activeAssistantMessageIdRef.current = null
    assistantMessageIdRef.current = null
    partsRef.current.clear()
    toolInvocationsRef.current.clear()
    partGenerationMapRef.current.clear()
    lastUserMessageRef.current = ""

    setMessages([])
    setIsGenerating(false)
    setIsToolExecuting(false)
    setError(null)

    if (!clientRef.current) return
    try {
      const session = await clientRef.current.session.create()
      const id = session.data?.id
      if (!id) throw new Error("No session ID returned")
      activeSessionIdRef.current = id
      setSessionId(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create new session")
    }
  }, [])

  return { messages, isGenerating, isToolExecuting, error, sessionId, sendMessage, stopGenerating, submitQuestionAnswer, resetSession }
}
