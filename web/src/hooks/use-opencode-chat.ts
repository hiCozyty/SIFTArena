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

        const events = await client.event.subscribe()

        const abortController = new AbortController()
        streamAbortRef.current = abortController

        ;(async () => {
          try {
            for await (const event of events.stream) {
              if (abortController.signal.aborted || !mounted) {
                break
              }
              const props = (event.properties || {}) as EventProps
              if (props.sessionID && props.sessionID !== activeSessionIdRef.current) continue
              if (!activeGenerationIdRef.current || !activeAssistantMessageIdRef.current) continue

              if ((event.type as string) === "message.part.updated" && props.part?.id) {
                const partId = props.part.id
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
                    }
                  } else {
                    invocation = { state: "call", toolName, input }
                  }
                  toolInvocationsRef.current.set(callID, invocation)
                  updateStreamingMessage()
                }
              }

              if ((event.type as string) === "message.part.delta" && props.partID) {
                const partId = props.partID
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
              console.error("[opencode-chat] Stream error:", err)
              setError(err instanceof Error ? err.message : "Stream error")
              setIsGenerating(false)
              setIsToolExecuting(false)
              activeGenerationIdRef.current = null
              activeAssistantMessageIdRef.current = null
            }
          }
        })()
      } catch (err) {
        if (!mounted) return
        console.error("[opencode-chat] Init error:", err)
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
        console.error("[opencode-chat] Not connected:", { clientRef: !!clientRef.current, sessionId: currentSessionId })
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
      lastUserMessageRef.current = content

      try {
        promptAbortRef.current = new AbortController()
        await clientRef.current.session.prompt({
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
        console.error("[opencode-chat] Prompt error:", err)
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
        await clientRef.current.session.abort({ sessionID: currentSessionId })
      } catch (err) {
        console.error("[opencode-chat] Abort error:", err)
      }
    }
    promptAbortRef.current?.abort()
    promptAbortRef.current = null
    finalizeMessage()
  }, [])

  return { messages, isGenerating, isToolExecuting, error, sessionId, sendMessage, stopGenerating }
}
