import { createOpencodeClient } from "@opencode-ai/sdk/client"
import { useCallback, useEffect, useRef, useState } from "react"
import type { Message } from "@/components/ui/chat-message"

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

  const clientRef = useRef<ReturnType<typeof createOpencodeClient> | null>(null)
  const assistantMessageIdRef = useRef<string | null>(null)
  const partsRef = useRef<Map<string, PartInfo>>(new Map())
  const streamAbortRef = useRef<AbortController | null>(null)
  const activeSessionIdRef = useRef<string | null>(null)

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

              if (event.type === "message.part.updated" && props.part?.id) {
                if (!partsRef.current.has(props.part.id)) {
                  partsRef.current.set(props.part.id, {
                    type: props.part.type,
                    content: "",
                  })
                }

                if (props.part.type === "step-finish") {
                  finalizeMessage()
                  continue
                }
              }

              if (event.type === "message.part.delta" && props.partID) {
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

  function finalizeMessage() {
    const parts = Array.from(partsRef.current.values())
    const textContent = parts.filter((p) => p.type !== "reasoning").map((p) => p.content).join("")
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
          { type: "text" as const, text: textContent },
        ],
      }
      return updated
    })
    setIsGenerating(false)
    assistantMessageIdRef.current = null
    partsRef.current.clear()
  }

  function updateStreamingMessage() {
    const parts = Array.from(partsRef.current.values())
    const textContent = parts.filter((p) => p.type !== "reasoning").map((p) => p.content).join("")
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
          { type: "text" as const, text: textContent },
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
      assistantMessageIdRef.current = assistantId

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

      try {
        await clientRef.current.session.prompt({
          path: { id: currentSessionId },
          body: {
            model: { providerID: "opencode-go", modelID: "deepseek-v4-flash" },
            parts: [{ type: "text", text: content }],
          },
        })
      } catch (err) {
        console.error("[opencode-chat] Prompt error:", err)
        setError(err instanceof Error ? err.message : "Prompt failed")
        setIsGenerating(false)
        assistantMessageIdRef.current = null
      }
    },
    [],
  )

  return { messages, isGenerating, error, sessionId, sendMessage }
}
