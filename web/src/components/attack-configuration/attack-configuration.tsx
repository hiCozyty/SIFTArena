import { CalderaIcon } from "@/components/icons/caldera-icon"
import { Button } from "@/components/ui/button"
import { TabContentCard } from "@/components/shared-ui-primitives/tab-content-card"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { FileText, MessageCircle, ListChecks, Trash2, ListPlus, Terminal, Loader2, CheckCircle2, XCircle, Circle } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { TechniqueTree, type SelectedItem } from "@/components/attack-configuration/technique-tree"
import { AbilityInfoTab } from "@/components/attack-configuration/ability-info-tab"
import { AiChatTab } from "@/components/attack-configuration/ai-chat-tab"
import { useOpencodeChat } from "@/hooks/use-opencode-chat"
import { useFocusedData } from "@/hooks/use-focused-data"
import { Item, ItemContent, ItemMedia, ItemTitle, ItemDescription, ItemActions, ItemGroup } from "@/components/ui/item"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import * as backendWs from "@/lib/backend-ws"

type ScenarioItem = {
  id: string
  name: string
  description: string
}

function AttackerConfigurationUi() {
  const [selected, setSelected] = useState<SelectedItem>({ type: "none" })
  const [activeTab, setActiveTab] = useState("ability")
  const [writeForm, setWriteForm] = useState({ name: "", description: "", command: "", kaliPrereq: "", winPrereq: "" })

  useEffect(() => {
    if (selected.type === "create-ability") {
      setActiveTab("ability")
    }
  }, [selected])
  const [scenarioItems, setScenarioItems] = useState<ScenarioItem[]>([])
  const chat = useOpencodeChat()
  const { status, fetch: fetchTree } = useFocusedData()
  const [testDialogOpen, setTestDialogOpen] = useState(false)
  const [testSteps, setTestSteps] = useState<Array<{ label: string; status: "pending" | "running" | "success" | "error"; message: string }>>([])
  const [testComplete, setTestComplete] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [testSteps])

  useEffect(() => {
    fetchTree()
  }, [fetchTree])

  const handleClearChat = useCallback(async () => {
    await chat.resetSession()
  }, [chat])

  const handleAddToScenario = useCallback(() => {
    if (selected.type !== "ability" && selected.type !== "negative-control") return
    setScenarioItems((prev) => [
      ...prev,
      { id: `${selected.type === "ability" ? selected.abilityId : "negative-control"}-${Date.now()}`, name: selected.type === "ability" ? selected.name : "Negative Control", description: selected.type === "ability" ? (selected.description ?? "(no description)") : "An empty ability that does nothing." },
    ])
  }, [selected])

  const handleWriteFormChange = useCallback((field: string, value: string) => {
    setWriteForm((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleDeleteAbility = useCallback((abilityId: string) => {
    const payload = {
      type: "deleteCustomAbility" as const,
      data: { abilityId },
    }
    const unsub = backendWs.subscribe((data) => {
      if (data.type !== "deleteCustomAbility") return
      unsub()
      if (data.error) {
        console.error("[attack-configuration] deleteCustomAbility failed:", data.error)
        return
      }
      fetchTree()
    })

    backendWs.send(payload)
  }, [fetchTree])

  const handleCreateAbility = useCallback(() => {
    if (!writeForm.name || !writeForm.description || !writeForm.command) return
    const payload = {
      type: "createCustomAbility" as const,
      data: {
        name: writeForm.name,
        description: writeForm.description,
        command: writeForm.command,
        kaliPrereq: writeForm.kaliPrereq,
        winPrereq: writeForm.winPrereq,
      },
    }
    const unsub = backendWs.subscribe((data) => {
      if (data.type !== "createCustomAbility") return
      unsub()
      if (data.error) {
        console.error("[attack-configuration] createCustomAbility failed:", data.error)
        return
      }
      fetchTree()
    })

    backendWs.send(payload)
  }, [writeForm, fetchTree])

  const handleTestAbility = useCallback(() => {
    setTestSteps([
      { label: "VM Power", status: "pending", message: "" },
      { label: "CLI Access", status: "pending", message: "" },
    ])
    setTestComplete(false)
    setTestDialogOpen(true)

    const abilityData = selected.type === "create-ability"
      ? { mode: "create", name: writeForm.name, description: writeForm.description, command: writeForm.command, kaliPrereq: writeForm.kaliPrereq, winPrereq: writeForm.winPrereq }
      : selected.type === "ability"
        ? { mode: "existing", abilityId: selected.abilityId, name: selected.name, description: selected.description, command: selected.command, kaliPrereq: selected.kaliPrereq, winPrereq: selected.winPrereq }
        : {}

    backendWs.subscribe((data: Record<string, unknown>) => {
      if (data.type !== "testAbilityStatus") return
      const { step, status, message } = data as { step: string; status: string; message: string }
      const stepLabelMap: Record<string, string> = {
        powerCheck: "VM Power",
        cliCheck: "CLI Access",
        prereqInstall: "Prerequisites",
        agentDeploy: "Agent Deploy",
        agentWait: "Agent Check-in",
        adversaryCreate: "Adversary Create",
        operationCreate: "Operation Create",
        operationPoll: "Operation Run",
        reportFetch: "Report",
        cleanup: "Cleanup",
      }
      setTestSteps((prev) => {
        const next = [...prev]
        const label = stepLabelMap[step] || step
        const existingIdx = next.findIndex(s => s.label === label)
        if (step === "complete") {
          setTestComplete(true)
        } else if (existingIdx >= 0) {
          next[existingIdx] = { label, status: status as never, message }
        } else {
          next.push({ label, status: status as never, message })
        }
        return next
      })
    })

    backendWs.send({ type: "testAbility", data: abilityData })
  }, [selected, writeForm])

  const displayContent = (() => {
    if (selected.type === "none") {
      return null
    }
    if (selected.type === "negative-control") {
      return { name: "Negative Control", abilityId: "", description: "An empty ability that does nothing.", command: "(none)", kaliPrereq: "", winPrereq: "" }
    }
    if (selected.type === "technique" || selected.type === "create-ability") {
      return null
    }
    return { name: selected.name, abilityId: selected.abilityId, description: selected.description ?? "(no description)", command: selected.command, kaliPrereq: selected.kaliPrereq, winPrereq: selected.winPrereq }
  })()

  const variantMessage = (() => {
    if (selected.type === "ability") {
      return `create an existing ability variant for "${selected.name}"\nDescription: ${selected.description ?? "(no description)"}\nCommand: ${selected.command}\nKali prerequisites: ${selected.kaliPrereq || "(none)"}\nWindows prerequisites: ${selected.winPrereq || "(none)"}`
    }
    if (selected.type === "create-ability") {
      return "Create a new ability"
    }
    return ""
  })()

  return (
    <div className="h-full rounded-lg flex outline outline-2 outline-yellow-400">
      <div className="w-[280px] shrink-0 overflow-hidden h-full">
        <TechniqueTree onSelect={setSelected} onDelete={handleDeleteAbility} status={status} />
      </div>
      <div className="flex-1 min-w-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="ability" className="flex h-full flex-col">
          <div className="flex shrink-0 items-center justify-between px-4 py-2">
            <TabsList>
              <TabsTrigger value="ability">
                <FileText className="size-4" />
              </TabsTrigger>
              <TabsTrigger value="chat">
                <MessageCircle className="size-4" />
              </TabsTrigger>
              <TabsTrigger value="scenario">
                <ListChecks className="size-4" />
              </TabsTrigger>
            </TabsList>
            {activeTab === "chat" ? (
              <Button onClick={handleClearChat}>Clear Chat Session</Button>
            ) : activeTab === "scenario" ? (
              <div className="flex items-center gap-2">
                <Button onClick={() => setScenarioItems([])}>Clear Scenario</Button>
                <Button disabled={selected.type === "technique" || selected.type === "none" || selected.type === "create-ability"} onClick={handleAddToScenario}>Add to Scenario</Button>
              </div>
            ) :             selected.type === "create-ability" ? (
              <div className="flex items-center gap-2">
                <Button disabled={!writeForm.name || !writeForm.description || !writeForm.command} onClick={handleCreateAbility}>Create Ability</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button disabled={selected.type !== "ability"} onClick={handleTestAbility}>Test Ability</Button>
                <Button disabled={selected.type === "technique" || selected.type === "none"} onClick={handleAddToScenario}>Add to Scenario</Button>
              </div>
            )}
          </div>
          <TabsContent value="ability" className="flex-1 min-h-0 rounded-4xl bg-muted shadow-sm">
            <AbilityInfoTab content={displayContent} mode={selected.type === "create-ability" ? "write" : "read"} writeForm={writeForm} onWriteFormChange={handleWriteFormChange} />
          </TabsContent>
          <TabsContent value="chat" className="flex-1 min-h-0 rounded-4xl bg-muted shadow-sm">
            <AiChatTab variantMessage={variantMessage} variantLabel={selected.type === "ability" ? selected.name : undefined} {...chat} />
          </TabsContent>
          <TabsContent value="scenario" className="flex-1 min-h-0 flex flex-col rounded-4xl bg-muted shadow-sm p-4">
            {scenarioItems.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <ListPlus className="size-12 opacity-50" />
                <p className="text-sm">Please select an ability on the left and add to scenario</p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <ItemGroup>
                  {scenarioItems.map((item) => (
                    <Item key={item.id}>
                      <ItemMedia>
                        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Terminal className="size-5 text-primary" />
                        </div>
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>{item.name}</ItemTitle>
                        <ItemDescription>{item.description}</ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <Button variant="ghost" size="icon" onClick={() => setScenarioItems((prev) => prev.filter((i) => i.id !== item.id))}>
                          <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </ItemActions>
                    </Item>
                  ))}
                </ItemGroup>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
      <AlertDialog open={testDialogOpen} onOpenChange={(open) => { if (!open) setTestDialogOpen(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Test Ability</AlertDialogTitle>
            <AlertDialogDescription>
              {selected.type === "create-ability"
                ? `Testing: ${writeForm.name || "(unnamed)"}`
                : selected.type === "ability"
                  ? `Testing: ${selected.name}`
                  : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div ref={scrollRef} className="space-y-3 py-2 max-h-[132px] overflow-y-auto [scrollbar-width:thin]">
            {testSteps.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                {step.status === "running"
                  ? <Loader2 className="size-4 animate-spin text-primary mt-0.5 shrink-0" />
                  : step.status === "success"
                    ? <CheckCircle2 className="size-4 text-primary mt-0.5 shrink-0" />
                    : step.status === "error"
                      ? <XCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
                      : <Circle className="size-4 text-muted-foreground/40 mt-0.5 shrink-0" />}
                <div>
                  <p className="text-sm font-medium">{step.label}</p>
                  {step.message && <p className="text-xs text-muted-foreground">{step.message}</p>}
                </div>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <Button onClick={() => setTestDialogOpen(false)} disabled={!testComplete}>Close</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function AttackConfiguration({
  completed,
  onComplete,
}: {
  completed: boolean
  onComplete: () => void
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

      <div className="mt-4 flex-1 min-h-0">
        <AttackerConfigurationUi />
      </div>
      <div className="mt-4 shrink-0">
        {completed ? (
          <p className="text-sm text-green-600">✓ Attack Configuration completed</p>
        ) : (
          <Button onClick={onComplete}>Complete Attack Configuration</Button>
        )}
      </div>
    </TabContentCard>
  )
}
