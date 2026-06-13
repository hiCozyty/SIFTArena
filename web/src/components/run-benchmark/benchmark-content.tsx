import { useRef, useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Lock, Info, Loader2, CheckCircle2, XCircle, Circle } from "lucide-react"
import { BrandSpeedtestIcon } from "@/components/icons/tabler-brand-speedtest"
import { TabContentCard } from "@/components/shared-ui-primitives/tab-content-card"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
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
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { SiftAgentTree, type Workflow } from "@/components/sift-agent/sift-agent-tree"
import { HorizontalTimeline } from "@/components/ui/horizontal-timeline"
import * as backendWs from "@/lib/backend-ws"
import { executeWsOperation } from "@/lib/ws-ops"

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  const gb = mb / 1024
  return `${gb.toFixed(1)} GB`
}

type PlaybookRunStep = {
  id: string
  label: string
  status: "running" | "success" | "error"
  message: string
  description?: string
  command?: string
}

const INFRA_LABELS: Record<string, string> = {
  init: "Init",
  revert: "Revert",
  powerCheck: "Power Check",
  cliCheck: "CLI Check",
  cleanup: "Cleanup",
}

const EVIDENCE_STEP_LABELS: Record<string, string> = {
  ewfTools: "EWF Tools",
  memoryDump: "Memory Dump",
  diskImage: "Disk Image",
  rsync: "Transfer",
  hashes: "Hashes",
  groundTruth: "Ground Truth",
  cleanup: "Cleanup",
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatTime(epochMs: number): string {
  const d = new Date(epochMs)
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })
    .toLowerCase()
    .replace(/\s/g, "")
}

export function BenchmarkContent({
  playbookCompleted,
  siftAgentConfigured,
  selectedPlaybookName,
  selectedWorkflowName,
}: {
  playbookCompleted: boolean
  siftAgentConfigured: boolean
  selectedPlaybookName: string | null
  selectedWorkflowName: string | null
}) {
  const streamRef = useRef<HTMLPreElement>(null)
  const evidenceScrollRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const [evidence, setEvidence] = useState<Workflow[]>([])
  const [selectedEvidenceNodeId, setSelectedEvidenceNodeId] = useState<string | null>(null)
  const [evidenceFileInfo, setEvidenceFileInfo] = useState<{ name: string | null, path: string, size: number | null, hash: string | null, created: string | null, content: string | null } | null>(null)
  const [evidenceFileInfoLoading, setEvidenceFileInfoLoading] = useState(false)
  const [mountingEvidence, setMountingEvidence] = useState(false)
  const [mountResult, setMountResult] = useState<string | null>(null)
  const [mountError, setMountError] = useState<string | null>(null)
  const [unmountingEvidence, setUnmountingEvidence] = useState(false)
  const [mountedPlaybookName, setMountedPlaybookName] = useState<string | null>(null)
  const [mountStreamOutput, setMountStreamOutput] = useState("")
  const [collectingEvidence, setCollectingEvidence] = useState(false)
  const [evidenceCollectionError, setEvidenceCollectionError] = useState<string | null>(null)
  const [evidenceCollectionDialogOpen, setEvidenceCollectionDialogOpen] = useState(false)
  const [evidenceCollectionComplete, setEvidenceCollectionComplete] = useState(false)
  const [showCollectDialog, setShowCollectDialog] = useState(false)
  const [showRunPlaybookDialog, setShowRunPlaybookDialog] = useState(false)
  const [isRunningPlaybook, setIsRunningPlaybook] = useState(false)
  const [playbookRunSteps, setPlaybookRunSteps] = useState<PlaybookRunStep[]>([])
  const [selectedAbilityStep, setSelectedAbilityStep] = useState<PlaybookRunStep | null>(null)
  const [evidenceCollectionSteps, setEvidenceCollectionSteps] = useState<PlaybookRunStep[]>([])
  const [evidenceReady, setEvidenceReady] = useState(false)
  const [models, setModels] = useState<{ id: string, name: string }[]>([])
  const [selectedModel, setSelectedModel] = useState("")

  useEffect(() => {
    if (!evidenceReady) return
    executeWsOperation<Workflow[]>({
      messageType: "listEvidence",
      sendFn: () => backendWs.send({ type: "listEvidence" }),
    }).then(setEvidence).catch(() => setEvidence([]))
  }, [evidenceReady])

  useEffect(() => {
    executeWsOperation<Workflow[]>({
      messageType: "listEvidence",
      sendFn: () => backendWs.send({ type: "listEvidence" }),
    }).then(setEvidence).catch(() => setEvidence([]))
  }, [])

  useEffect(() => {
    const unsub = backendWs.subscribe((data) => {
      if (data.type === "mountEvidenceToSift:stream" || data.type === "unmountEvidenceFromSift:stream") {
        setMountStreamOutput((prev) => prev + (data.text as string))
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = backendWs.subscribe((data) => {
      if (data.type === "runPlaybookStatus") {
        const { step, status, message } = data as { step: string, status: "running" | "success" | "error", message: string }
        if (step.startsWith("event-")) {
          if (status !== "success") return
          let entry: { type?: string, name?: string, durationMs?: number, startedAt?: number, finishedAt?: number, description?: string, command?: string }
          try { entry = JSON.parse(message) } catch { return }
          if (entry.type !== "ability") return
          const range = entry.startedAt != null && entry.finishedAt != null
            ? `${formatTime(entry.startedAt)} - ${formatTime(entry.finishedAt)}`
            : entry.durationMs != null ? formatDuration(entry.durationMs) : ""
          setPlaybookRunSteps((prev) => [...prev, {
            id: step,
            label: entry.name ?? step,
            status: "success",
            message: range,
            description: entry.description,
            command: entry.command,
          }])
          return
        }
        const label = INFRA_LABELS[step]
        if (!label) return
        setPlaybookRunSteps((prev) => {
          const existing = prev.find((s) => s.id === step)
          if (existing) {
            return prev.map((s) => s.id === step ? { ...s, status, message } : s)
          }
          const prevCompleted = status === "running"
            ? prev.map((s) => s.status === "running" ? { ...s, status: "success" as const } : s)
            : prev
          return [...prevCompleted, { id: step, label, status, message }]
        })
      }
      if (data.type === "runPlaybook") {
        setIsRunningPlaybook(false)
        if (data.error) {
          setPlaybookRunSteps((prev) => [...prev, {
            id: "error",
            label: "Error",
            status: "error",
            message: data.error as string,
          }])
        } else {
          setEvidenceReady(true)
        }
      }
      if (data.type === "evidenceCollectionStatus") {
        const { step, status, message } = data as { step: string, status: "running" | "success" | "error", message: string }
        console.log(`[evidence:client] status: step=${step} status=${status} message="${message}"`)
        const label = EVIDENCE_STEP_LABELS[step]
        if (!label) return
        setEvidenceCollectionSteps((prev) => {
          const existing = prev.find((s) => s.id === step)
          if (existing) {
            return prev.map((s) => s.id === step ? { ...s, status, message } : s)
          }
          const prevCompleted = status === "running"
            ? prev.map((s) => s.status === "running" ? { ...s, status: "success" as const } : s)
            : prev
          return [...prevCompleted, { id: step, label, status, message }]
        })
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    executeWsOperation<string | null>({
      messageType: "getMountedEvidence",
      sendFn: () => backendWs.send({ type: "getMountedEvidence" }),
    }).then((playbookName) => {
      if (playbookName) setMountedPlaybookName(playbookName as string)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight
    }
  }, [mountStreamOutput])

  useEffect(() => {
    if (evidenceScrollRef.current) {
      evidenceScrollRef.current.scrollTop = evidenceScrollRef.current.scrollHeight
    }
  }, [evidenceCollectionSteps])

  const handleSelectEvidenceFile = useCallback((nodeId: string) => {
    if (nodeId === selectedEvidenceNodeId) {
      setSelectedEvidenceNodeId(null)
      setEvidenceFileInfo(null)
      return
    }
    setSelectedEvidenceNodeId(nodeId)
    setEvidenceFileInfoLoading(true)
    setEvidenceFileInfo(null)
    const path = nodeId.startsWith("workflows/") ? nodeId.slice("workflows/".length) : nodeId
    executeWsOperation<{ name: string | null, path: string, size: number | null, hash: string | null, content: string | null }>({
      messageType: "getEvidenceFileInfo",
      sendFn: () => backendWs.send({ type: "getEvidenceFileInfo", data: { path } }),
    }).then(setEvidenceFileInfo).catch(() => setEvidenceFileInfo(null)).finally(() => setEvidenceFileInfoLoading(false))
  }, [selectedEvidenceNodeId])

  const handleMountEvidence = useCallback(async () => {
    if (!evidenceFileInfo?.path) return
    const playbookDir = evidenceFileInfo.path.split("/")[0]
    setMountStreamOutput("")
    setMountingEvidence(true)
    setMountResult(null)
    setMountError(null)
    try {
      const result = await executeWsOperation<{ success: boolean, output: string, mountPoint: string }>({
        messageType: "mountEvidenceToSift",
        sendFn: () => backendWs.send({ type: "mountEvidenceToSift", data: { path: playbookDir } }),
      })
      setMountResult(result.output)
      setMountedPlaybookName(playbookDir)
    } catch (err) {
      console.error("[handleMountEvidence] Mount error:", err)
      setMountError(err instanceof Error ? err.message : String(err))
    } finally {
      setMountingEvidence(false)
    }
  }, [evidenceFileInfo])

  const isE01File = evidenceFileInfo?.name?.toLowerCase().endsWith(".e01") ?? false

  const handleUnmountEvidence = useCallback(async () => {
    if (!evidenceFileInfo?.path) return
    const playbookDir = evidenceFileInfo.path.split("/")[0]
    setMountStreamOutput("")
    setUnmountingEvidence(true)
    try {
      await executeWsOperation({
        messageType: "unmountEvidenceFromSift",
        sendFn: () => backendWs.send({ type: "unmountEvidenceFromSift", data: { path: playbookDir } }),
      })
      setMountResult(null)
      setMountedPlaybookName(null)
    } catch (err) {
      setMountError(err instanceof Error ? err.message : String(err))
    } finally {
      setUnmountingEvidence(false)
    }
  }, [evidenceFileInfo])

  const beginCollection = useCallback((overwrite: boolean) => {
    setEvidenceCollectionSteps([])
    setEvidenceCollectionComplete(false)
    setCollectingEvidence(true)
    setEvidenceCollectionError(null)
    setEvidenceCollectionDialogOpen(true)
    executeWsOperation({
      messageType: "collectEvidence",
      sendFn: () => backendWs.send({ type: "collectEvidence", data: { playbookName: selectedPlaybookName, vmid: 107, overwrite } }),
    }).then(() => {
      executeWsOperation<Workflow[]>({
        messageType: "listEvidence",
        sendFn: () => backendWs.send({ type: "listEvidence" }),
      }).then(setEvidence).catch(() => {})
    }).catch((err) => {
      setEvidenceCollectionError(err instanceof Error ? err.message : String(err))
    }).finally(() => {
      setCollectingEvidence(false)
      setEvidenceCollectionComplete(true)
    })
  }, [selectedPlaybookName])

  const handleOpenCollectDialog = useCallback(async () => {
    try {
      const result = await executeWsOperation<{ exists: boolean }>({
        messageType: "checkEvidenceExists",
        sendFn: () => backendWs.send({ type: "checkEvidenceExists", data: { playbookName: selectedPlaybookName } }),
      })
      if (result?.exists) {
        setShowCollectDialog(true)
      } else {
        beginCollection(false)
      }
    } catch {
      beginCollection(false)
    }
  }, [selectedPlaybookName, beginCollection])

  const handleConfirmCollect = useCallback(() => {
    setShowCollectDialog(false)
    beginCollection(true)
  }, [beginCollection])

  const handleAbort = useCallback(() => {
    console.log("[evidence:client] user requested abort")
    backendWs.send({ type: "abortEvidenceCollection" })
    setEvidenceCollectionError("Collection aborted by user")
    setCollectingEvidence(false)
    setEvidenceCollectionComplete(true)
  }, [])

  const handleRunPlaybook = useCallback(() => {
    setShowRunPlaybookDialog(false)
    setPlaybookRunSteps([])
    setEvidenceReady(false)
    setIsRunningPlaybook(true)
    backendWs.send({ type: "runPlaybook", data: { playbookName: selectedPlaybookName } })
  }, [selectedPlaybookName])

  useEffect(() => {
    if (!siftAgentConfigured) return
    executeWsOperation<{ models: { id: string, name: string }[], default: string | null }>({
      messageType: "listOpencodeModels",
      sendFn: () => backendWs.send({ type: "listOpencodeModels" }),
    }).then((result) => {
      setModels(result.models)
      setSelectedModel(result.default ?? result.models[0]?.id ?? "")
    }).catch(() => {})
  }, [siftAgentConfigured])

  return (
    <TabContentCard className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
          <BrandSpeedtestIcon className="size-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Run Benchmark</h3>
          <p className="text-muted-foreground text-sm">Execute performance benchmarks</p>
        </div>
      </div>
      <Accordion type="single" collapsible defaultValue="playbook-settings">
        <AccordionItem value="playbook-settings">
          <AccordionTrigger>Playbook Settings</AccordionTrigger>
          <AccordionContent>
            {!playbookCompleted ? (
              <div className="py-8 flex flex-col items-center justify-center">
                <Lock className="mb-4 size-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-semibold">Playbook Settings locked</h3>
                <p className="mb-6 text-sm text-muted-foreground">
                  Complete <strong>Playbook</strong> setup first to unlock this section.
                </p>
                <div className="flex items-center gap-2">
                  <Button onClick={() => navigate("/playbook", { replace: true })}>
                    Go to Playbook
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">Current Playbook Selected:</span>
                  <span className="text-muted-foreground text-sm">{selectedPlaybookName ?? "None"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button disabled={isRunningPlaybook} onClick={() => setShowRunPlaybookDialog(true)}>
                    {isRunningPlaybook ? "Running..." : "Run playbook"}
                  </Button>
                  {evidenceReady && (
                    <Button
                      onClick={() => { setPlaybookRunSteps([]); setEvidenceReady(false) }}
                    >
                      Clear timeline
                    </Button>
                  )}
                </div>
                {playbookRunSteps.length > 0 && (
                  <HorizontalTimeline
                    items={playbookRunSteps}
                    renderNode={(step, _i, above) => (
                      <div className={`text-xs p-2 ${above ? "mb-1" : "mt-1"} max-w-28`}>
                        <p className="font-semibold flex items-center gap-1">
                          {step.label}
                          {step.id.startsWith("event-") && (
                            <button
                              type="button"
                              className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                              onClick={(e) => { e.stopPropagation(); setSelectedAbilityStep(step) }}
                            >
                              <Info className="size-3" />
                            </button>
                          )}
                        </p>
                        <p className="text-muted-foreground line-clamp-3">{step.message}</p>
                      </div>
                    )}
                    getItemStatus={(_step, index) => {
                      if (!isRunningPlaybook) return undefined
                      if (index === playbookRunSteps.length - 1) return "running"
                      return undefined
                    }}
                    maxWidth="100%"
                    className="overflow-x-auto"
                  />
                )}
                {evidenceReady && (
                  <Button
                    disabled={collectingEvidence}
                    onClick={handleOpenCollectDialog}
                  >
                    {collectingEvidence ? "Collecting..." : "Collect evidence"}
                  </Button>
                )}
                <Dialog open={selectedAbilityStep !== null} onOpenChange={(open) => { if (!open) setSelectedAbilityStep(null) }}>
                  <DialogPortal>
                    <DialogOverlay className="backdrop-blur-sm" />
                    <DialogPrimitive.Content
                      className="fixed top-[50%] left-[50%] z-50 grid w-full max-w-sm translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:rounded-4xl"
                    >
                      <DialogHeader>
                        <DialogTitle>{selectedAbilityStep?.label}</DialogTitle>
                        {selectedAbilityStep?.description && (
                          <DialogDescription>{selectedAbilityStep.description}</DialogDescription>
                        )}
                      </DialogHeader>
                      {selectedAbilityStep?.command && (
                        <p className="text-xs font-mono text-muted-foreground break-all bg-muted rounded-md p-2">
                          {selectedAbilityStep.command}
                        </p>
                      )}
                    </DialogPrimitive.Content>
                  </DialogPortal>
                </Dialog>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="evidence-collection" disabled={!evidenceReady && evidence.length === 0}>
          <AccordionTrigger>
            Evidence Collection
            {!evidenceReady && evidence.length === 0 && (
              <span className="ml-1 text-muted-foreground/80 font-normal">(Run Playbook First)</span>
            )}
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-4 rounded-xl p-1 h-[calc(80vh-17rem)]" style={{ gridTemplateColumns: "220px 1fr" }}>
              <div className="rounded-4xl border bg-muted/30 p-3 overflow-auto">
                <SiftAgentTree
                  workflows={evidence}
                  selectedNodeId={selectedEvidenceNodeId}
                  onSelectFile={handleSelectEvidenceFile}
                  onResetSelection={(nodeId) => {
                    if (nodeId === null) {
                      setSelectedEvidenceNodeId(null)
                      setEvidenceFileInfo(null)
                    }
                  }}
                  rootLabel="Evidence"
                />
              </div>
              <div className="flex flex-col min-h-0">
                <div className="shrink-0 px-4 py-2 flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">
                    Current mounted evidence: {mountedPlaybookName ? <strong>{mountedPlaybookName}</strong> : "None"}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={unmountingEvidence || !mountedPlaybookName}
                      onClick={handleUnmountEvidence}
                    >
                      {unmountingEvidence ? "Unmounting..." : "Unmount"}
                    </Button>
                    <Button
                      size="sm"
                      disabled={mountingEvidence || !isE01File}
                      onClick={handleMountEvidence}
                    >
                      {mountingEvidence ? "Mounting..." : "Mount Evidence to SIFT"}
                    </Button>
                  </div>
                </div>
                <div className="overflow-auto rounded-4xl border bg-muted flex flex-col flex-1 min-w-0">
                  {evidenceFileInfo ? (
                    <>
                      <div className="shrink-0 px-4 py-2 border-b border-border">
                        <span className="text-muted-foreground text-xs font-mono">{evidenceFileInfo.path}</span>
                      </div>
                      {evidenceFileInfo.content ? (
                        <pre className="font-mono text-xs text-zinc-700 flex-1 overflow-auto p-3 dark:text-zinc-300">
                          <code>{(() => {
                            try { return JSON.stringify(JSON.parse(evidenceFileInfo.content), null, 2) }
                            catch { return evidenceFileInfo.content }
                          })()}</code>
                        </pre>
                      ) : (
                        <pre className="font-mono text-xs text-zinc-700 flex-1 overflow-auto p-3 dark:text-zinc-300">
                          <code>{[
                            `name:    ${evidenceFileInfo.name}`,
                            `path:    ${evidenceFileInfo.path}`,
                            `size:    ${evidenceFileInfo.size !== null ? formatSize(evidenceFileInfo.size) : "unknown"}`,
                            evidenceFileInfo.created && `created: ${new Date(evidenceFileInfo.created).toLocaleString()}`,
                            evidenceFileInfo.hash && `hash:    ${evidenceFileInfo.hash}`,
                          ].filter(Boolean).join("\n")}</code>
                        </pre>
                      )}
                       {isE01File && (mountStreamOutput || mountResult) && (
                         <pre ref={streamRef} className="mx-3 mb-2 rounded-4xl bg-zinc-100 p-2 font-mono text-xs text-zinc-900 max-h-48 overflow-auto shrink-0 min-w-0 w-full whitespace-pre-wrap dark:bg-zinc-900 dark:text-green-400">{mountStreamOutput || mountResult}</pre>
                      )}
                      {mountError && (
                        <p className="mx-3 mb-2 text-xs text-red-600 dark:text-red-400 shrink-0">{mountError}</p>
                      )}
                    </>
                  ) : evidenceFileInfoLoading ? (
                    <div className="flex h-full items-center justify-center text-muted-foreground text-sm p-3">
                      Loading...
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground text-sm p-3">
                      {evidence.length === 0 ? "No evidence files found" : "Select an evidence file"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="timeline-analysis">
          <AccordionTrigger>
            Timeline and Analysis
            {siftAgentConfigured && !mountedPlaybookName && (
              <span className="ml-1 text-muted-foreground/80 font-normal">(Mount Evidence to SIFT)</span>
            )}
            {!siftAgentConfigured && mountedPlaybookName && (
              <span className="ml-1 text-muted-foreground/80 font-normal">(Configure SIFT Agent First)</span>
            )}
          </AccordionTrigger>
          <AccordionContent>
            {!siftAgentConfigured || !mountedPlaybookName ? (
              <div className="py-8 flex flex-col items-center justify-center">
                <Lock className="mb-4 size-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-semibold">Timeline and Analysis locked</h3>
                <p className="mb-6 text-sm text-muted-foreground">
                  {!siftAgentConfigured && !mountedPlaybookName
                    ? <>Configure <strong>SIFT Agent</strong> and <strong>mount evidence</strong> to unlock this section.</>
                    : !siftAgentConfigured
                    ? <>Configure <strong>SIFT Agent</strong> to unlock this section.</>
                    : <><strong>Mount evidence</strong> to SIFT to unlock this section.</>
                  }
                </p>
                {!siftAgentConfigured && (
                  <Button onClick={() => navigate("/sift-agent", { replace: true })}>
                    Go to SIFT Agent
                  </Button>
                )}
              </div>
            ) : (
            <div className="h-[calc(80vh-17rem)] overflow-auto rounded-xl border bg-muted/30 p-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">Current Workflow Selected:</span>
                <span className="text-muted-foreground text-sm">{selectedWorkflowName ?? "None"}</span>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <span className="text-sm font-medium">Select Model:</span>
                {models.length === 0 ? (
                  <span className="text-muted-foreground text-sm">Loading models...</span>
                ) : (
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger className="w-56">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <AlertDialog open={showRunPlaybookDialog} onOpenChange={setShowRunPlaybookDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run Playbook</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to run the current selected playbook: {selectedPlaybookName ?? "None"}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRunPlaybook}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={showCollectDialog} onOpenChange={setShowCollectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Evidence Already Exists</AlertDialogTitle>
            <AlertDialogDescription>
              Evidence already exists for this playbook. Overwrite and re-collect?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCollect}>
              Yes, overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={evidenceCollectionDialogOpen} onOpenChange={(open) => { if (!open) setEvidenceCollectionDialogOpen(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Collect Evidence</AlertDialogTitle>
            <AlertDialogDescription>
              {evidenceCollectionError
                ? evidenceCollectionError
                : collectingEvidence
                  ? "Collecting evidence..."
                  : "Evidence collection complete"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div ref={evidenceScrollRef} className="space-y-3 py-2 max-h-[132px] overflow-y-auto [scrollbar-width:thin]">
            {evidenceCollectionSteps.map((step, i) => (
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
            <Button variant="destructive" onClick={handleAbort} disabled={!collectingEvidence}>Abort</Button>
            <Button onClick={() => setEvidenceCollectionDialogOpen(false)} disabled={!evidenceCollectionComplete}>Close</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TabContentCard>
  )
}