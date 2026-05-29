---
component_id: 6
component_name: Attack Configuration Workspace
---

# Attack Configuration Workspace

## Component Description

Delivers the interactive attack planning environment — browse MITRE ATT&CK technique trees, inspect ability details, and plan attacks via an AI chat assistant powered by the opencode SDK.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/web/src/components/attack-configuration/attack-configuration.tsx (lines 91-167)
```
export function AttackConfiguration({
  completed,
  onComplete,
  selectedAttackName,
}: {
  completed: boolean
  onComplete: () => void
  selectedAttackName?: string
}) {
  return (
    <TabContentCard className="p-6 flex flex-col min-h-0">
      <div className="mb-4 flex items-center gap-3 shrink-0">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
          <CalderaIcon className="size-6 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Attack Configuration</h3>
          <p className="text-muted-foreground text-sm">Select preconfigured attack or create your custom configuration</p>
        </div>
      </div>
      <p className="text-muted-foreground text-sm shrink-0">
        {selectedAttackName
          ? <>Currently selected Attack: <strong>{selectedAttackName}</strong></>
          : "Please select an attack.."
        }
        {!selectedAttackName && (
          <Dialog>
            <DialogTrigger asChild>
              <button className="ml-1 underline cursor-pointer">click here for help</button>
            </DialogTrigger>
            <DialogContent className="bg-transparent border-0 shadow-none">
              <Carousel className="w-full max-w-sm mx-auto">
                <CarouselContent>
                  <CarouselItem>
                    <div className="rounded-4xl bg-muted p-4 text-center shadow-sm">
                      <h4 className="mb-1 font-semibold">Select an Attack</h4>
                      <p className="text-sm text-muted-foreground">
                        Choose a preconfigured attack from the tree on the left, or
                        build your own using the tabs on the right.
                      </p>
                    </div>
                  </CarouselItem>
                  <CarouselItem>
                    <div className="rounded-4xl bg-muted p-4 text-center shadow-sm">
                      <h4 className="mb-1 font-semibold">Database Attacks</h4>
                      <p className="text-sm text-muted-foreground">
                        Target user tables, roles, and credentials. Configure SQL
                        injection, privilege escalation, and more.
                      </p>
                    </div>
                  </CarouselItem>
                  <CarouselItem>
                    <div className="rounded-4xl bg-muted p-4 text-center shadow-sm">
                      <h4 className="mb-1 font-semibold">API Attacks</h4>
                      <p className="text-sm text-muted-foreground">
                        Target authentication endpoints, user management APIs, and
                        other RESTful services.
                      </p>
                    </div>
                  </CarouselItem>
                </CarouselContent>
                <CarouselPrevious className="hidden sm:inline-flex" />
                <CarouselNext className="hidden sm:inline-flex" />
              </Carousel>
            </DialogContent>
          </Dialog>
        )}
      </p>
      <div className="mt-4 flex-1 min-h-0">
        <AttackerConfigurationUi />
      </div>
      <div className="mt-4 shrink-0">
        {completed ? (
          <p className="text-sm text-green-600">✓ Attack Configuration completed</p>
        ) : (
          <Button onClick={onComplete}>Complete Attack Configuration</Button>
        )}
```

### /home/cozyty/Projects/shadowProtocol/web/src/hooks/use-opencode-chat.ts (lines 40-545)
```
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

  async function startEventLoop() {
    const client = clientRef.current
    const sessionId = activeSessionIdRef.current
    if (!client || !sessionId) return
    if (eventLoopRunningRef.current) return
    eventLoopRunningRef.current = true

    let resolveSubscribeReady!: () => void
    subscribeReadyRef.current = new Promise<void>(resolve => {
      resolveSubscribeReady = resolve
    })

    try {
      const events = await client.event.subscribe()
      const abortController = new AbortController()
      streamAbortRef.current = abortController
      console.log("[opencode-chat] event stream subscribed")

      resolveSubscribeReady()

      try {
        for await (const event of events.stream) {
          if (abortController.signal.aborted) break
          const props = (event.properties || {}) as EventProps
          if (props.sessionID && props.sessionID !== activeSessionIdRef.current) continue

          if ((event.type as string) === "message.part.updated" && props.part?.id) {
            const partId = props.part.id
            const eventType = `part.updated:${props.part.type}`
            const genCheck = !!(activeGenerationIdRef.current && activeAssistantMessageIdRef.current)
            console.log("[opencode-chat] event:", { type: eventType, partId, genCheck, genId: activeGenerationIdRef.current, assistantId: activeAssistantMessageIdRef.current })
            if (!genCheck) continue
            const recordedGen = partGenerationMapRef.current.get(partId)
            if (recordedGen === undefined) {
              partGenerationMapRef.current.set(partId, activeGenerationIdRef.current)
            } else if (recordedGen !== activeGenerationIdRef.current) {
              console.log("[opencode-chat] event skipped: gen mismatch", { recordedGen, activeGen: activeGenerationIdRef.current })
              continue
            }
            if (!partsRef.current.has(props.part.id)) {
              partsRef.current.set(props.part.id, {
                type: props.part.type,
                content: "",
              })
            }
            if (props.part.type === "step-finish") {
              console.log("[opencode-chat] step-finish:", props.part.reason)
              if (props.part.reason === "stop") {
                console.log("[opencode-chat] finalizeMessage called")
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
            console.log("[opencode-chat] event:", { type: "part.delta", partId, field: props.field, genCheck })
            if (!genCheck) continue
            const recordedGen = partGenerationMapRef.current.get(partId)
            if (recordedGen === undefined) {
              partGenerationMapRef.current.set(partId, activeGenerationIdRef.current)
            } else if (recordedGen !== activeGenerationIdRef.current) {
              console.log("[opencode-chat] delta skipped: gen mismatch", { recordedGen, activeGen: activeGenerationIdRef.current })
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
          console.error("[opencode-chat] stream error:", err)
          setError(err instanceof Error ? err.message : "Stream error")
          setIsGenerating(false)
          setIsToolExecuting(false)
          activeGenerationIdRef.current = null
          activeAssistantMessageIdRef.current = null
        }
      }
    } catch (err) {
      resolveSubscribeReady()
      console.error("[opencode-chat] subscribe error:", err)
    } finally {
      eventLoopRunningRef.current = false
      console.log("[opencode-chat] event loop ended")
    }
  }

  function reconnectEventStream() {
    console.log("[opencode-chat] reconnecting event stream...")
    streamAbortRef.current?.abort()
    streamAbortRef.current = null
    eventLoopRunningRef.current = false
    subscribeReadyRef.current = null
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
    console.log("[opencode-chat] finalizeMessage called")
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
      partGenerationMapRef.current.clear()
      lastUserMessageRef.current = content

      console.log("[opencode-chat] sendMessage:", { content, sessionId: currentSessionId, usingPromptAsync: true })

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
        console.log("[opencode-chat] promptAsync resolved successfully")
      } catch (err) {
        console.log("[opencode-chat] promptAsync error:", err)
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
        await clientRef.current.session.abort({ path: { id: currentSessionId } })
      } catch (err) {
        console.error("[opencode-chat] Abort error:", err)
      }
    }
    promptAbortRef.current?.abort()
    promptAbortRef.current = null
    finalizeMessage()
    reconnectEventStream()
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
      reconnectEventStream()

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

      console.log("[opencode-chat] submitQuestionAnswer start:", { answers, questionContext })
      console.log("[opencode-chat] submitQuestionAnswer refs before prompt:", { sessionId: currentSessionId, eventLoopRunning: eventLoopRunningRef.current, streamAbort: !!streamAbortRef.current })

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

      console.log("[opencode-chat] submitQuestionAnswer refs after set:", { genId: newGenId, assistantId })
      console.log("[opencode-chat] submitQuestionAnswer: waiting for SSE subscription...")

      if (subscribeReadyRef.current) {
        await subscribeReadyRef.current
      }

      console.log("[opencode-chat] submitQuestionAnswer: sending promptAsync")

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
        console.log("[opencode-chat] submitQuestionAnswer: promptAsync resolved")
      } catch (err) {
        console.log("[opencode-chat] submitQuestionAnswer: promptAsync error:", err)
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
```

### /home/cozyty/Projects/shadowProtocol/web/src/components/attack-configuration/technique-tree.tsx (lines 58-111)
```
function TechniqueTreeContent({ onSelect, allTechniques }: { onSelect: (item: SelectedItem) => void; allTechniques: { tid: string; tech: Technique }[] }) {
  const { selectedIds } = useTree()

  useEffect(() => {
    if (selectedIds.length === 0) {
      onSelect({ type: "none" })
    }
  }, [selectedIds, onSelect])

  const allIds: string[] = []
  for (const { tid, tech } of allTechniques) {
    allIds.push(tid)
    for (const ability of tech.abilities) {
      allIds.push(`${tid}-${ability.ability_id}`)
    }
  }

  return (
    <div className="min-h-0 min-w-0 flex-1 max-w-full">
      <TreeView className="pl-0 rounded-lg m-2 -ml-[5px] h-[415px] overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <TreeNode key="negative-control" isLast={allTechniques.length === 0} nodeId="negative-control">
          <TreeNodeTrigger onClick={() => onSelect({ type: "negative-control" })}>
            <TreeIcon icon={<FileText className="h-4 w-4" />} />
            <TreeLabel className="whitespace-normal break-words">Negative Control</TreeLabel>
          </TreeNodeTrigger>
        </TreeNode>
        {allTechniques.map(({ tid, tech }, techIdx) => {
          const isLastTech = techIdx === allTechniques.length - 1

          return (
            <TreeNode key={tid} isLast={isLastTech} nodeId={tid}>
              <TreeNodeTrigger onClick={() => onSelect({ type: "technique", tid, name: tech.technique_name })}>
                <TreeExpander hasChildren />
                <TreeIcon hasChildren />
                <TreeLabel className="whitespace-normal break-words">{tid} - {tech.technique_name}</TreeLabel>
              </TreeNodeTrigger>
              <TreeNodeContent hasChildren>
                {tech.abilities.map((ability: AtomicAbility, abIdx: number) => {
                  const isLastAb = abIdx === tech.abilities.length - 1
                  const abilityId = `${tid}-${ability.ability_id}`

                  return (
                    <TreeNode key={abilityId} isLast={isLastAb} level={1} nodeId={abilityId}>
                      <TreeNodeTrigger onClick={() => onSelect({ type: "ability", tid, abilityId: ability.ability_id, name: ability.name, description: ability.description, command: ability.executors[0]?.command ?? "(no command)", downloadInstructions: ability.download_instructions ?? "" })}>
                        <TreeIcon icon={<FileText className="h-4 w-4" />} />
                        <TreeLabel className="whitespace-normal break-words">{ability.name}</TreeLabel>
                      </TreeNodeTrigger>
                    </TreeNode>
                  )
                })}
              </TreeNodeContent>
            </TreeNode>
          )
        })}
```

### /home/cozyty/Projects/shadowProtocol/web/src/components/attack-configuration/ability-info-tab.tsx (lines 41-89)
```
export function AbilityInfoTab({ content }: AbilityInfoTabProps) {
  if (content === null) {
    return (
      <div className="flex h-full items-center justify-center p-4 font-mono text-sm text-muted-foreground">
        Please select an ability.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col p-4 font-mono text-sm overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="mb-4">
        <span className="font-bold">Name:</span> {content.name}
      </div>
      {content.abilityId && (
        <div className="mb-4">
          <span className="font-bold">Ability ID:</span> {content.abilityId}
        </div>
      )}
      <div className="mb-4">
        <span className="font-bold">Description:</span> {content.description}
      </div>
      <div className="mb-4">
        <span className="font-bold">Command:</span> {content.command}
      </div>
      {content.downloadInstructions && (
        <div className="mt-6 border-t pt-4">
          {(() => {
            const lines = content.downloadInstructions.split("\n")
            const titleIndex = lines.findIndex(l => l.includes("Prerequisites (Manual Step Required)"))
            const payloadIndex = lines.findIndex(l => l.startsWith("Payload:"))

            const warningLines = lines.slice(titleIndex + 1, payloadIndex >= 0 ? payloadIndex : undefined).join("\n").trim()
            const payloadLine = payloadIndex >= 0 ? lines[payloadIndex] : ""
            const commands = payloadIndex >= 0 ? lines.slice(payloadIndex + 1).join("\n").trim() : ""

            return (
              <>
                <div className="mb-2 font-bold">Prerequisites (Manual Step Required)</div>
                <p className="mb-3 text-muted-foreground whitespace-pre-wrap">{warningLines}</p>
                {payloadLine && <p className="mb-2 font-medium">{payloadLine}</p>}
                {commands && (
                  <div className="relative mt-3">
                    <CopyCommandBlock commands={commands} />
                  </div>
                )}
              </>
            )
          })()}
```


## Source Files:

- `web/src/components/attack-configuration/ability-info-tab.tsx`
- `web/src/components/attack-configuration/ai-chat-tab.tsx`
- `web/src/components/attack-configuration/technique-tree.tsx`
- `web/src/components/kibo-ui/tree/index.tsx`
- `web/src/components/ui/chat.tsx`
- `web/src/hooks/use-opencode-chat.ts`

