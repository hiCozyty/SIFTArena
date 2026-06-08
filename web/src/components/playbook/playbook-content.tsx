import { RiBookLine } from "@remixicon/react"
import { TabContentCard } from "@/components/shared-ui-primitives/tab-content-card"
import { PlaybookTree } from "@/components/playbook/playbook-tree"
import { PlaybookTimelineTab } from "@/components/playbook/playbook-timeline-tab"
import { PlaybookChatTab } from "@/components/playbook/playbook-chat-tab"
import { useOpencodeChat } from "@/hooks/use-opencode-chat"
import { PlaybookSettingsTab } from "@/components/playbook/playbook-settings-tab"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { ScenarioItem } from "@/components/attack-configuration/scenario-tab"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { GitBranch, MessageCircle, Settings, Plus, NotebookPen } from "lucide-react"
import { useState, useCallback, useEffect } from "react"
import type { NoiseSelected } from "@/components/playbook/noise-tree"
import { executeWsOperation } from "@/lib/ws-ops"
import * as backendWs from "@/lib/backend-ws"

export type PlaybookData = {
  name: string
  timelineEvents: Array<Record<string, unknown>>
  persistentBgCommands: Array<Record<string, unknown>>
  settings: Record<string, unknown>
}

export type PlaybookSettings = {
  waitTimeBetweenEvents: number
  jitterBetweenEvents: number
  persistentBgRandomize: boolean
  persistentBgInterval: number
  persistentBgJitter: number
  signalToNoiseRatio: number
}

const DEFAULT_SETTINGS: PlaybookSettings = {
  waitTimeBetweenEvents: 1000,
  jitterBetweenEvents: 0,
  persistentBgRandomize: false,
  persistentBgInterval: 2000,
  persistentBgJitter: 0,
  signalToNoiseRatio: 1,
}

export function PlaybookContent({
  scenarioItems,
  onHasPlaybooks,
  onComplete,
  onSelectNoise,
}: {
  scenarioItems: ScenarioItem[]
  onHasPlaybooks: (hasPlaybooks: boolean) => void
  onComplete: () => void
  onSelectNoise: () => void
}) {
  const [activeTab, setActiveTab] = useState("timeline")
  const [noiseSelected, setNoiseSelected] = useState<NoiseSelected>({ type: "none" })
  const [noiseForm, setNoiseForm] = useState({ name: "", command: "", description: "" })
  const [noises, setNoises] = useState<Array<{ name: string; command: string; description: string }>>([])
  const [leftTab, setLeftTab] = useState("playbook")
  const [showNameDialog, setShowNameDialog] = useState(false)
  const [playbookName, setPlaybookName] = useState("")
  const [playbooks, setPlaybooks] = useState<PlaybookData[]>([])
  const [showConfirmButton, setShowConfirmButton] = useState(false)
  const [selectedNoise, setSelectedNoise] = useState<string | null>(null)
  const [selectedPlaybook, setSelectedPlaybook] = useState<string | null>(null)
  const [pendingPlaybook, setPendingPlaybook] = useState<string | null>(null)
  const [assignedNoises, setAssignedNoises] = useState<Record<string, { name: string; command: string }>>({})
  const [pendingSlotKey, setPendingSlotKey] = useState<string | null>(null)
  const [settings, setSettings] = useState<PlaybookSettings>(DEFAULT_SETTINGS)

  const chat = useOpencodeChat({ baseUrl: "http://localhost:3112" })

  const currentPlaybookData = playbooks.find(p => p.name === pendingPlaybook) ?? null

  const selectedNoiseData = noises.find(n => n.name === selectedNoise) ?? null

  const fetchNoises = useCallback(async () => {
    console.log("[playbook] fetchNoises: sending getNoises")
    try {
      const result = await executeWsOperation<Array<{ name: string; command: string; description: string }>>({
        messageType: "getNoises",
        sendFn: () => backendWs.send({ type: "getNoises" }),
      })
      console.log("[playbook] fetchNoises: result", result)
      setNoises(result)
    } catch (err) {
      console.error("[playbook] getNoises failed:", err)
    }
  }, [])

  const fetchPlaybooks = useCallback(async () => {
    console.log("[playbook] fetchPlaybooks: sending getPlaybooks")
    try {
      const result = await executeWsOperation<PlaybookData[]>({
        messageType: "getPlaybooks",
        sendFn: () => backendWs.send({ type: "getPlaybooks" }),
      })
      console.log("[playbook] fetchPlaybooks: result", result)
      setPlaybooks(result)
      onHasPlaybooks(result.length > 0)
    } catch (err) {
      console.error("[playbook] getPlaybooks failed:", err)
    }
  }, [onHasPlaybooks])

  useEffect(() => {
    fetchNoises()
    fetchPlaybooks()
  }, [fetchNoises, fetchPlaybooks])

  useEffect(() => {
    if (currentPlaybookData?.settings && typeof currentPlaybookData.settings === "object") {
      const s = currentPlaybookData.settings as Record<string, unknown>
      setSettings({
        waitTimeBetweenEvents: typeof s.waitTimeBetweenEvents === "number" ? s.waitTimeBetweenEvents : DEFAULT_SETTINGS.waitTimeBetweenEvents,
        jitterBetweenEvents: typeof s.jitterBetweenEvents === "number" ? s.jitterBetweenEvents : DEFAULT_SETTINGS.jitterBetweenEvents,
        persistentBgRandomize: typeof s.persistentBgRandomize === "boolean" ? s.persistentBgRandomize : DEFAULT_SETTINGS.persistentBgRandomize,
        persistentBgInterval: typeof s.persistentBgInterval === "number" ? s.persistentBgInterval : DEFAULT_SETTINGS.persistentBgInterval,
        persistentBgJitter: typeof s.persistentBgJitter === "number" ? s.persistentBgJitter : DEFAULT_SETTINGS.persistentBgJitter,
        signalToNoiseRatio: typeof s.signalToNoiseRatio === "number" ? s.signalToNoiseRatio : DEFAULT_SETTINGS.signalToNoiseRatio,
      })
    } else {
      setSettings(DEFAULT_SETTINGS)
    }
  }, [pendingPlaybook, currentPlaybookData])

  const handleSavePlaybook = useCallback(() => {
    setPlaybookName("")
    setShowNameDialog(true)
  }, [])

  const handleConfirmSave = useCallback(async () => {
    console.log("[playbook] handleConfirmSave: called, name=", playbookName)
    if (!playbookName.trim()) return
    const timelineEvents = scenarioItems.flatMap((item, i) => {
      const noiseSlotKey = `timeline-${i}`
      const noiseData = assignedNoises[noiseSlotKey]
      return [
        noiseData ? { name: noiseData.name, command: noiseData.command } : {},
        { id: item.id, name: item.name, description: item.description, command: item.command, winPrereq: item.winPrereq },
      ]
    })
    const endSlotKey = `timeline-${scenarioItems.length}`
    const endNoiseData = assignedNoises[endSlotKey]
    timelineEvents.push(endNoiseData ? { name: endNoiseData.name, command: endNoiseData.command } : {})
    const pbgEntries = Object.keys(assignedNoises)
      .filter(k => k.startsWith("pbg-"))
      .sort((a, b) => parseInt(a.replace("pbg-", ""), 10) - parseInt(b.replace("pbg-", ""), 10))
      .map(k => ({ name: assignedNoises[k].name, command: assignedNoises[k].command }))
    console.log("[playbook] handleConfirmSave: timelineEvents", timelineEvents)
    try {
      const result = await executeWsOperation({
        messageType: "createPlaybook",
        sendFn: () => backendWs.send({
          type: "createPlaybook",
          data: {
            name: playbookName.trim(),
            timelineEvents,
            persistentBgCommands: pbgEntries.length > 0 ? pbgEntries : [{}],
            settings,
          },
        }),
      })
      console.log("[playbook] createPlaybook success:", result)
      await fetchPlaybooks()
      console.log("[playbook] fetchPlaybooks after save complete")
    } catch (err) {
      console.error("[playbook] createPlaybook failed:", err)
      return
    }
    setShowNameDialog(false)
  }, [playbookName, scenarioItems, fetchPlaybooks, assignedNoises, settings])

  const handleSelectNoise = useCallback((selected: NoiseSelected) => {
    setNoiseSelected(selected)
    if (selected.type === "create-noise") {
      setNoiseForm({ name: "", command: "" })
      setShowConfirmButton(true)
    } else if (selected.type === "select-noise") {
      setLeftTab("noise")
      setShowConfirmButton(true)
    } else {
      setShowConfirmButton(false)
    }
  }, [])

  const handleNoiseFormChange = useCallback((field: string, value: string) => {
    setNoiseForm((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleCreateNoise = useCallback(async () => {
    console.log("[playbook] handleCreateNoise: called, noiseForm=", noiseForm)
    if (!noiseForm.name || !noiseForm.command) return
    console.log("[playbook] handleCreateNoise: sending createNoise, ws state=", backendWs.getState())
    try {
      const result = await executeWsOperation({
        messageType: "createNoise",
        sendFn: () => backendWs.send({ type: "createNoise", data: { name: noiseForm.name, command: noiseForm.command, description: noiseForm.description } }),
      })
      console.log("[playbook] createNoise success:", result)
      await fetchNoises()
      console.log("[playbook] createNoise: fetchNoises done, resetting form")
    } catch (err) {
      console.error("[playbook] createNoise failed:", err)
      return
    }
    setNoiseSelected({ type: "none" })
    setShowConfirmButton(false)
  }, [noiseForm, fetchNoises])

  const handleDeleteNoise = useCallback(async (name: string) => {
    try {
      await executeWsOperation({
        messageType: "deleteNoise",
        sendFn: () => backendWs.send({ type: "deleteNoise", data: { name } }),
      })
      await fetchNoises()
      setSelectedNoise(null)
    } catch (err) {
      console.error("[playbook] deleteNoise failed:", err)
    }
  }, [fetchNoises])

  const handleDeletePlaybook = useCallback(async (name: string) => {
    try {
      await executeWsOperation({
        messageType: "deletePlaybook",
        sendFn: () => backendWs.send({ type: "deletePlaybook", data: { name } }),
      })
      await fetchPlaybooks()
      setPendingPlaybook(null)
    } catch (err) {
      console.error("[playbook] deletePlaybook failed:", err)
    }
  }, [fetchPlaybooks])

  const handleImportPlaybook = useCallback(async (data: Record<string, unknown>) => {
    const name = typeof data.name === "string" ? data.name.trim() : ""
    if (!name) {
      console.error("[playbook] importPlaybook: no name in imported data")
      return
    }
    try {
      await executeWsOperation({
        messageType: "createPlaybook",
        sendFn: () => backendWs.send({
          type: "createPlaybook",
          data: {
            name,
            timelineEvents: Array.isArray(data.timelineEvents) ? data.timelineEvents : [],
            persistentBgCommands: Array.isArray(data.persistentBgCommands) ? data.persistentBgCommands : [{}],
            settings: data.settings ?? DEFAULT_SETTINGS,
          },
        }),
      })
      await fetchPlaybooks()
    } catch (err) {
      console.error("[playbook] importPlaybook failed:", err)
    }
  }, [fetchPlaybooks])

  const handleConfirmNoiseSelection = useCallback(() => {
    if (pendingSlotKey && selectedNoiseData) {
      setAssignedNoises(prev => ({ ...prev, [pendingSlotKey]: { name: selectedNoiseData.name, command: selectedNoiseData.command } }))
    }
    setPendingSlotKey(null)
    setSelectedNoise(null)
    onSelectNoise()
    setShowConfirmButton(false)
    setLeftTab("playbook")
  }, [onSelectNoise, pendingSlotKey, selectedNoiseData])

  const handleRemoveNoise = useCallback((slotKey: string) => {
    setAssignedNoises(prev => {
      const next = { ...prev }
      delete next[slotKey]
      return next
    })
  }, [])

  const handleSelectPlaybook = useCallback(() => {
    console.log("[playbook] handleSelectPlaybook: selected playbook data payload:", JSON.stringify(currentPlaybookData, null, 2))
    setSelectedPlaybook(pendingPlaybook)
    onComplete()
  }, [pendingPlaybook, onComplete, currentPlaybookData])

  const handleCancelNoiseSelection = useCallback(() => {
    setShowConfirmButton(false)
    setLeftTab("playbook")
  }, [])

  const handleAddNoiseToTimeline = useCallback((slotKey: string) => {
    setPendingSlotKey(slotKey)
    setLeftTab("noise")
    setShowConfirmButton(true)
  }, [])

  const handleLeftTabChange = useCallback((tab: string) => {
    setLeftTab(tab)
    if (tab === "playbook") {
      setShowConfirmButton(false)
    }
  }, [])

  const isCreatingNoise = noiseSelected.type === "create-noise"

  return (
    <>
      <TabContentCard className="p-6 flex flex-col min-h-0">
      <div className="mb-4 flex items-center gap-3 shrink-0">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
          <RiBookLine className="size-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Playbook</h3>
          <p className="text-muted-foreground text-sm">current playbook selected: <span className="font-bold">{selectedPlaybook || 'please select a playbook configuration'}</span></p>
        </div>
      </div>
      <div className="mt-4 flex-1 min-h-0 rounded-lg flex gap-4">
        <div className="w-[200px] shrink-0 overflow-hidden h-full">
          <PlaybookTree onSelectNoise={handleSelectNoise} noises={noises} onDeleteNoise={handleDeleteNoise} leftTab={leftTab} onLeftTabChange={handleLeftTabChange} playbooks={playbooks} onSelectedNoiseChange={setSelectedNoise} hideAddNoiseButton={showConfirmButton} onSelectedPlaybookChange={setPendingPlaybook} onDeletePlaybook={handleDeletePlaybook} onImportPlaybook={handleImportPlaybook} />
        </div>
        <div className="flex-1 min-w-0">
          {isCreatingNoise ? (
            <div className="flex h-full flex-col rounded-4xl bg-muted shadow-sm">
              <div className="flex shrink-0 items-center justify-between px-4 py-2">
                <span className="font-semibold text-sm">Create Noise Template</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => { setNoiseSelected({ type: "none" }); setShowConfirmButton(false) }}>
                    Cancel
                  </Button>
                  <Button disabled={!noiseForm.name || !noiseForm.command || noises.some(n => n.name === noiseForm.name)} onClick={handleCreateNoise}>
                    Create Noise Template
                  </Button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex flex-col gap-4 p-4 text-sm min-h-full">
                  <div>
                    <label className="font-bold text-sm">Name</label>
                    <Input
                      className="mt-1 font-mono"
                      placeholder="Noise name"
                      value={noiseForm.name}
                      onChange={(e) => handleNoiseFormChange("name", e.target.value)}
                    />
                    {noiseForm.name && noises.some(n => n.name === noiseForm.name) && (
                      <p className="text-sm text-destructive mt-1">A noise template with this name already exists.</p>
                    )}
                  </div>
                  <div>
                    <label className="font-bold text-sm">Description</label>
                    <Input
                      className="mt-1 font-mono"
                      placeholder="Describe this noise"
                      value={noiseForm.description}
                      onChange={(e) => handleNoiseFormChange("description", e.target.value)}
                    />
                  </div>
                  <div className="flex-1 flex flex-col min-h-0">
                    <label className="font-bold text-sm">Command</label>
                    <textarea
                      className="mt-1 font-mono w-full flex-1 min-h-[200px] rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm resize-none"
                      placeholder="Command / script"
                      value={noiseForm.command}
                      onChange={(e) => handleNoiseFormChange("command", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="timeline" className="flex h-full flex-col">
              <div className="flex shrink-0 items-center justify-between px-4 py-2">
                <TabsList>
                  <TabsTrigger value="timeline">
                    {leftTab === "noise" ? <NotebookPen className="size-4" /> : <GitBranch className="size-4" />}
                  </TabsTrigger>
                  <TabsTrigger value="chat">
                    <MessageCircle className="size-4" />
                  </TabsTrigger>
                  <TabsTrigger value="settings">
                    <Settings className="size-4" />
                  </TabsTrigger>
                </TabsList>
                <div className="flex items-center gap-2">
                  {leftTab === "playbook" && (
                    <>
                      <Button onClick={handleSavePlaybook}>
                        <Plus className="size-4" />
                        Save Playbook
                      </Button>
                      <Button disabled={!pendingPlaybook} onClick={handleSelectPlaybook}>
                        Select playbook configuration
                      </Button>
                    </>
                  )}
                  {leftTab === "noise" && showConfirmButton && (
                    <>
                      <Button variant="outline" onClick={handleCancelNoiseSelection}>
                        Cancel
                      </Button>
                      <Button disabled={!selectedNoise} onClick={handleConfirmNoiseSelection}>
                        Select Noise
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <TabsContent value="timeline" className="flex-1 min-h-0 rounded-4xl bg-muted shadow-sm">
                {leftTab === "playbook" ? (
                  <PlaybookTimelineTab currentPlaybookData={currentPlaybookData} scenarioItems={scenarioItems} assignedNoises={assignedNoises} onAddNoise={handleAddNoiseToTimeline} onRemoveNoise={handleRemoveNoise} noises={noises} />
                ) : (
                  <div className="flex h-full flex-col p-4 overflow-auto">
                    {selectedNoiseData ? (
                      <>
                        <h4 className="font-semibold text-sm mb-2">Name</h4>
                        <p className="text-sm font-mono mb-4">{selectedNoiseData.name}</p>
                        <h4 className="font-semibold text-sm mb-2">Description</h4>
                        <p className="text-sm text-muted-foreground mb-4">{selectedNoiseData.description || "—"}</p>
                        <h4 className="font-semibold text-sm mb-2">Command</h4>
                        <pre className="flex-1 min-h-0 overflow-auto rounded-md border border-input bg-background p-3 text-sm font-mono whitespace-pre-wrap">
                          {selectedNoiseData.command}
                        </pre>
                      </>
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                        Select a noise template from the left panel
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="chat" className="flex-1 min-h-0 rounded-4xl bg-muted shadow-sm">
                <PlaybookChatTab {...chat} />
              </TabsContent>
              <TabsContent value="settings" className="flex-1 min-h-0 rounded-4xl bg-muted shadow-sm">
                <PlaybookSettingsTab settings={settings} onSettingsChange={setSettings} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
      </TabContentCard>
      <AlertDialog open={showNameDialog} onOpenChange={setShowNameDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save Playbook</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a name for this playbook configuration.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            autoFocus
            placeholder="Playbook name"
            value={playbookName}
            onChange={(e) => setPlaybookName(e.target.value)}
          />
          {playbookName.trim() && playbooks.some(p => p.name === playbookName.trim()) && (
            <p className="text-sm text-destructive">A playbook with this name already exists.</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={!playbookName.trim() || playbooks.some(p => p.name === playbookName.trim())} onClick={handleConfirmSave}>
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
