import { useRef, useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Lock, Info, Loader2, CheckCircle2, XCircle, Circle, FolderOpen } from "lucide-react"
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
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
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
import {
  TreeProvider,
  TreeView,
  TreeNode,
  TreeNodeTrigger,
  TreeLabel,
} from "@/components/kibo-ui/tree"
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

const STAGING_LABELS: Record<string, string> = {
  inodes: "Locating Artifacts",
  evtx: "Parsing EVTX Logs",
  usn: "Parsing USN Journal",
  mft: "Building MFT Timeline",
  prefetch: "Parsing Prefetch Files",
  volatility: "Running Volatility Plugins",
  complete: "Complete",
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
  const [showConfirmAbortDialog, setShowConfirmAbortDialog] = useState(false)
  const [showConfirmRunWorkflowDialog, setShowConfirmRunWorkflowDialog] = useState(false)
  const [isRunningPlaybook, setIsRunningPlaybook] = useState(false)
  const [playbookRunSteps, setPlaybookRunSteps] = useState<PlaybookRunStep[]>([])
  const [selectedAbilityStep, setSelectedAbilityStep] = useState<PlaybookRunStep | null>(null)
  const [evidenceCollectionSteps, setEvidenceCollectionSteps] = useState<PlaybookRunStep[]>([])
  const [evidenceReady, setEvidenceReady] = useState(false)
  const [models, setModels] = useState<{ id: string, name: string }[]>([])
  const [selectedModel, setSelectedModel] = useState("")
  const [isStaging, setIsStaging] = useState(false)
  const [stagingError, setStagingError] = useState<string | null>(null)
  const [showConfirmStagingDialog, setShowConfirmStagingDialog] = useState(false)
  const [stagedExists, setStagedExists] = useState(false)
  const [hasStagedEvidence, setHasStagedEvidence] = useState(false)
  const [leftTab, setLeftTab] = useState("tool-call")
  const [deleteEvidenceDialogOpen, setDeleteEvidenceDialogOpen] = useState(false)
  const [pendingDeleteEvidenceName, setPendingDeleteEvidenceName] = useState<string | null>(null)
  const [isWorkflowRunning, setIsWorkflowRunning] = useState(false)

  type ToolCallEntry = { callID: string, tool: string, status: string, input?: Record<string, unknown>, output?: string, error?: string }
  type RoundEntry = {
    key: string
    label: string
    thinking: string
    text: string
    toolCalls: ToolCallEntry[]
  }
  const [rounds, setRounds] = useState<RoundEntry[]>([])
  const [selectedRoundKey, setSelectedRoundKey] = useState<string | null>(null)
  const [userSelectedRound, setUserSelectedRound] = useState(false)
  const roundsBottomRef = useRef<HTMLDivElement>(null)
  const toolCallsPreRef = useRef<HTMLPreElement>(null)
  const thinkingResponsePreRef = useRef<HTMLPreElement>(null)
  const [workflowTokens, setWorkflowTokens] = useState<{ input: number, output: number, reasoning: number, cost: number } | null>(null)
  const [stagedEvidenceFolders, setStagedEvidenceFolders] = useState<string[]>([])
  const [selectedEvidenceFolder, setSelectedEvidenceFolder] = useState<string>("")

  type ResultModelEntry = { providerID: string, modelName: string, timestamps: { timestamp: string, files: string[] }[] }
  type ResultTreeEntry = { playbookName: string, models: ResultModelEntry[] }
  const [resultTree, setResultTree] = useState<ResultTreeEntry[] | null>(null)
  const [selectedResultFilePath, setSelectedResultFilePath] = useState<string | null>(null)
  const [resultFileContent, setResultFileContent] = useState<{ content: string | null, size: number | null } | null>(null)
  const [resultFileLoading, setResultFileLoading] = useState(false)

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
    if (leftTab !== "results") return
    executeWsOperation<ResultTreeEntry[]>({
      messageType: "listWorkflowResults",
      sendFn: () => backendWs.send({ type: "listWorkflowResults" }),
    }).then(setResultTree).catch(() => setResultTree([]))
  }, [leftTab])

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
      if (data.type === "preAgentStagingStatus") {
        const { step, message } = data as { step: string, status: "running" | "success" | "error", message: string }
        const label = STAGING_LABELS[step] ?? step
        setMountStreamOutput((prev) => prev + (message ? `${label}: ${message}\n` : `${label}\n`))
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    const unsub = backendWs.subscribe((data) => {
      if (data.type === "runOpencodeWorkflow:start") {
        setIsWorkflowRunning(true)
        setRounds([])
        setSelectedRoundKey(null)
        setUserSelectedRound(false)
        setWorkflowTokens(null)
        setWorkflowDone(false)
      }
      if (data.type === "runOpencodeWorkflow:thinking") {
        const { text, round } = data as { text: string, round: number }
        setRounds((prev) => {
          const key = String(round)
          const existing = prev.find((r) => r.key === key)
          if (existing) {
            return prev.map((r) => r.key === key ? { ...r, thinking: r.thinking + text } : r)
          }
          return [...prev, { key, label: `Round ${round}`, thinking: text, text: "", toolCalls: [] }]
        })
      }
      if (data.type === "runOpencodeWorkflow:text") {
        const { text, round } = data as { text: string, round: number }
        const key = String(round || 1)
        setRounds((prev) =>
          prev.map((r) => r.key === key ? { ...r, text: r.text + text } : r)
        )
      }
      if (data.type === "runOpencodeWorkflow:tool") {
        const tc = data as ToolCallEntry & { round: number }
        const key = String(tc.round || 1)
        setRounds((prev) =>
          prev.map((r) => {
            if (r.key !== key) return r
            const existing = r.toolCalls.find((t) => t.callID === tc.callID)
            if (existing) {
              return { ...r, toolCalls: r.toolCalls.map((t) => t.callID === tc.callID ? { ...t, ...tc } : t) }
            }
            return { ...r, toolCalls: [...r.toolCalls, { callID: tc.callID, tool: tc.tool, status: tc.status, input: tc.input, output: tc.output, error: tc.error }] }
          })
        )
      }
      if (data.type === "runOpencodeWorkflow:roundComplete") {
        const { round, thinking, text, toolCalls } = data as { round: number, thinking: string, text: string, toolCalls: ToolCallEntry[] }
        const key = String(round)
        setRounds((prev) =>
          prev.map((r) => r.key === key ? { ...r, thinking, text, toolCalls } : r)
        )
      }
      if (data.type === "runOpencodeWorkflow:final") {
        const { thinking, text } = data as { thinking: string, text: string }
        setRounds((prev) =>
          prev.some((r) => r.key === "final")
            ? prev.map((r) => r.key === "final" ? { ...r, thinking, text } : r)
            : [...prev, { key: "final", label: "Final", thinking, text, toolCalls: [] }]
        )
        setIsWorkflowRunning(false)
        setWorkflowDone(true)
      }
      if (data.type === "runOpencodeWorkflow:done") {
        const d = data as { tokens?: { input: number, output: number, reasoning: number } | null, cost: number | null }
        if (d.tokens) {
          setWorkflowTokens({ input: d.tokens.input, output: d.tokens.output, reasoning: d.tokens.reasoning, cost: d.cost ?? 0 })
        }
        setIsWorkflowRunning(false)
        setWorkflowDone(true)
      }
      if (data.type === "runOpencodeWorkflow:tokens") {
        const d = data as { tokens: { input: number, output: number, reasoning: number, cost: number } }
        if (d.tokens) {
          setWorkflowTokens(d.tokens)
        }
      }
      if (data.type === "runOpencodeWorkflow:error") {
        setIsWorkflowRunning(false)
        setWorkflowDone(true)
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    if (rounds.length === 0) return
    if (!userSelectedRound) {
      const last = rounds[rounds.length - 1]
      setSelectedRoundKey(last.key)
    }
  }, [rounds, userSelectedRound])

  // Auto-scroll rounds tree to bottom when new rounds are added and user hasn't manually selected
  useEffect(() => {
    if (!userSelectedRound) {
      roundsBottomRef.current?.scrollIntoView({ behavior: "instant" })
    }
  }, [rounds.length, userSelectedRound])

  // Auto-scroll tool calls to bottom
  useEffect(() => {
    const sel = rounds.find((r) => r.key === selectedRoundKey)
    if (sel && toolCallsPreRef.current) {
      toolCallsPreRef.current.scrollTop = toolCallsPreRef.current.scrollHeight
    }
  }, [rounds, selectedRoundKey])

  // Auto-scroll thinking/response to bottom
  useEffect(() => {
    const sel = rounds.find((r) => r.key === selectedRoundKey)
    if (sel && thinkingResponsePreRef.current) {
      thinkingResponsePreRef.current.scrollTop = thinkingResponsePreRef.current.scrollHeight
    }
  }, [rounds, selectedRoundKey])

  useEffect(() => {
    executeWsOperation<string | null>({
      messageType: "getMountedEvidence",
      sendFn: () => backendWs.send({ type: "getMountedEvidence" }),
    }).then((playbookName) => {
      if (playbookName) setMountedPlaybookName(playbookName as string)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    executeWsOperation<{ hasStagedEvidence: boolean }>({
      messageType: "checkAnyStagedEvidence",
      sendFn: () => backendWs.send({ type: "checkAnyStagedEvidence" }),
    }).then((result) => {
      setHasStagedEvidence(!!result?.hasStagedEvidence)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!hasStagedEvidence) return
    executeWsOperation<string[]>({
      messageType: "listStagedEvidenceFolders",
      sendFn: () => backendWs.send({ type: "listStagedEvidenceFolders" }),
    }).then((folders) => {
      setStagedEvidenceFolders(folders)
      if (folders.length > 0 && !selectedEvidenceFolder) {
        setSelectedEvidenceFolder(folders[0])
      }
    }).catch(() => {})
  }, [hasStagedEvidence])

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

  const handleDeleteEvidence = useCallback(async () => {
    if (!pendingDeleteEvidenceName) return
    setDeleteEvidenceDialogOpen(false)
    try {
      await executeWsOperation({
        messageType: "deleteEvidence",
        sendFn: () => backendWs.send({ type: "deleteEvidence", data: { name: pendingDeleteEvidenceName } }),
      })
      if (mountedPlaybookName === pendingDeleteEvidenceName) {
        setMountedPlaybookName(null)
      }
    } catch (err) {
      console.error("[deleteEvidence] Error:", err)
    } finally {
      setPendingDeleteEvidenceName(null)
      executeWsOperation<Workflow[]>({
        messageType: "listEvidence",
        sendFn: () => backendWs.send({ type: "listEvidence" }),
      }).then(setEvidence).catch(() => setEvidence([]))
    }
  }, [pendingDeleteEvidenceName, mountedPlaybookName])

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

  const handleExtractArtifacts = useCallback(async () => {
    if (!mountedPlaybookName) return
    try {
      const result = await executeWsOperation<{ exists: boolean }>({
        messageType: "checkStagedOutputExists",
        sendFn: () => backendWs.send({ type: "checkStagedOutputExists", data: { playbookName: mountedPlaybookName } }),
      })
      setStagedExists(!!result?.exists)
    } catch {
      setStagedExists(false)
    }
    setShowConfirmStagingDialog(true)
  }, [mountedPlaybookName])

  const handleConfirmStaging = useCallback(() => {
    setShowConfirmStagingDialog(false)
    setIsStaging(true)
    setStagingError(null)
    executeWsOperation({
      messageType: "preAgentStagingPipeline",
      sendFn: () => backendWs.send({ type: "preAgentStagingPipeline", data: { playbookName: mountedPlaybookName } }),
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err)
      setStagingError(msg)
      setMountStreamOutput((prev) => prev + "[ERROR] " + msg + "\n")
    }).finally(() => {
      setIsStaging(false)
      executeWsOperation<Workflow[]>({
        messageType: "listEvidence",
        sendFn: () => backendWs.send({ type: "listEvidence" }),
      }).then(setEvidence).catch(() => setEvidence([]))
      executeWsOperation<{ hasStagedEvidence: boolean }>({
        messageType: "checkAnyStagedEvidence",
        sendFn: () => backendWs.send({ type: "checkAnyStagedEvidence" }),
      }).then((result) => setHasStagedEvidence(!!result?.hasStagedEvidence)).catch(() => {})
    })
  }, [mountedPlaybookName])

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
                <Lock className="mb-4 size-12 text-primary" />
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
                  onDeleteFolder={(name) => {
                    setPendingDeleteEvidenceName(name)
                    setDeleteEvidenceDialogOpen(true)
                  }}
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
                      disabled={unmountingEvidence || !mountedPlaybookName || isStaging}
                      onClick={handleUnmountEvidence}
                    >
                      {unmountingEvidence ? "Unmounting..." : "Unmount"}
                    </Button>
                    <Button
                      size="sm"
                      disabled={mountingEvidence || !isE01File || isStaging}
                      onClick={handleMountEvidence}
                    >
                      {mountingEvidence ? "Mounting..." : "Mount"}
                    </Button>
                    <Button
                      size="sm"
                      disabled={isStaging || !mountedPlaybookName}
                      onClick={handleExtractArtifacts}
                    >
                      {isStaging ? "Extracting..." : "Extract Artifacts"}
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
                       {(isE01File || isStaging) && (mountStreamOutput || mountResult) && (
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
            {siftAgentConfigured && !hasStagedEvidence && (
              <span className="ml-1 text-muted-foreground/80 font-normal">(Extract Artifacts)</span>
            )}
            {!siftAgentConfigured && hasStagedEvidence && (
              <span className="ml-1 text-muted-foreground/80 font-normal">(Configure SIFT Agent First)</span>
            )}
          </AccordionTrigger>
          <AccordionContent>
            <div className="h-[calc(80vh-17rem)] flex flex-col rounded-md pt-0 pr-4 pb-4 pl-4">
              <div className="shrink-0 px-3 py-2 grid grid-cols-[1fr_auto_1fr] items-center">
                {leftTab === "results" ? (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <FolderOpen className="size-3.5" />
                    <span className="font-mono">results/</span>
                  </div>
                ) : (
                  <div />
                )}
                <Tabs value={leftTab} onValueChange={setLeftTab}>
                  <TabsList>
                    <TabsTrigger value="tool-call" className="text-xs">Run AI Agent</TabsTrigger>
                    <TabsTrigger value="results" className="text-xs">Results</TabsTrigger>
                  </TabsList>
                </Tabs>
                {leftTab === "results" && (
                  <div className="justify-self-end">
                    <Button size="sm" className="w-fit">Benchmark with LLM</Button>
                  </div>
                )}
                {leftTab === "tool-call" && <div />}
              </div>
              {leftTab === "tool-call" && (!siftAgentConfigured || !hasStagedEvidence) ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <Lock className="mb-4 size-12 text-primary" />
                  <h3 className="mb-2 text-lg font-semibold">Run AI Agent locked</h3>
                  <p className="mb-6 text-sm text-muted-foreground text-center px-4">
                    {!siftAgentConfigured && !hasStagedEvidence
                      ? <>Configure <strong>SIFT Agent</strong> and <strong>Mount and Extract artifacts</strong> from at least ONE playbook evidence folder to run the AI agent.</>
                      : !siftAgentConfigured
                      ? <>Configure <strong>SIFT Agent</strong> to run the AI agent.</>
                      : <><strong>Mount and Extract artifacts</strong> from at least ONE playbook evidence folder to run the AI agent.</>
                    }
                  </p>
                  {!siftAgentConfigured && (
                    <Button onClick={() => navigate("/sift-agent", { replace: true })}>
                      Go to SIFT Agent
                    </Button>
                  )}
                </div>
              ) : (
              <>
              {leftTab === "tool-call" && (
              <div className="shrink-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-medium">Current Workflow Selected:</span>
                  <span className="text-muted-foreground text-sm">{selectedWorkflowName ?? "None"}</span>
                  <span className="text-sm font-medium ml-4">Current Evidence Folder Selected:</span>
                  {stagedEvidenceFolders.length === 0 ? (
                    <span className="text-muted-foreground text-sm">No staged evidence available</span>
                  ) : (
                    <Select value={selectedEvidenceFolder} onValueChange={setSelectedEvidenceFolder}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Select folder" />
                      </SelectTrigger>
                      <SelectContent>
                        {stagedEvidenceFolders.map((name) => (
                          <SelectItem key={name} value={name}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                 <div className="flex items-center justify-between gap-3 mt-3">
                   <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">Select Model:</span>
                    {models.length === 0 ? (
                      <span className="text-muted-foreground text-sm">Loading models...</span>
                    ) : (
                      <Select value={selectedModel} onValueChange={setSelectedModel}>
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Select a model" />
                        </SelectTrigger>
                        <SelectContent>
                          {models.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {workflowTokens && (
                      <div className="text-xs text-muted-foreground flex items-center gap-3">
                        <span>Tokens: {workflowTokens.input + workflowTokens.output + workflowTokens.reasoning}</span>
                        <span>Cost: ${workflowTokens.cost.toFixed(6)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => setShowConfirmAbortDialog(true)} disabled={!isWorkflowRunning}>Abort</Button>
                    <Button size="sm" onClick={() => setShowConfirmRunWorkflowDialog(true)} disabled={!selectedEvidenceFolder || !selectedWorkflowName || !selectedModel || isWorkflowRunning}>Run Workflow</Button>
                  </div>
                </div>
              </div>
              )}
              <div className="flex gap-3 mt-2 flex-1 min-h-0">
                <div className={`${leftTab === "tool-call" ? "w-1/6" : "w-1/3"} min-h-0 flex flex-col`}>
                  <div className={`flex-1 min-h-0 ${leftTab === "tool-call" ? "pr-3" : "px-3"} pb-3`}>
                    <div className="h-full overflow-auto">
                    {leftTab === "tool-call" ? (
                      <div className="h-full flex flex-col">
                        <TreeProvider
                          selectedIds={selectedRoundKey ? [selectedRoundKey] : []}
                          onSelectionChange={(ids) => {
                            setSelectedRoundKey(ids[0] ?? null)
                            setUserSelectedRound(true)
                          }}
                          showLines={false}
                          showIcons={false}
                          selectable={true}
                          collapseDisabled={true}
                          className="flex-1 min-h-0"
                        >
                          <TreeView className="p-0 overflow-auto flex-1">
                            {rounds.length === 0 && !isWorkflowRunning ? (
                              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                                No tool calls yet. Run a workflow to see output here.
                              </div>
                            ) : (
                              rounds.map((r) => (
                                <TreeNode key={r.key} nodeId={r.key}>
                                  <TreeNodeTrigger>
                                    <TreeLabel>{r.label}</TreeLabel>
                                  </TreeNodeTrigger>
                                </TreeNode>
                              ))
                            )}
                            <div ref={roundsBottomRef} />
                          </TreeView>
                        </TreeProvider>
                      </div>
                    ) : (
                      <div className="h-full overflow-auto">
                        {!resultTree ? (
                          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">Loading...</div>
                        ) : resultTree.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No results yet.</div>
                        ) : (
                          <TreeProvider
                            selectedIds={selectedResultFilePath ? [selectedResultFilePath] : []}
                            onSelectionChange={(ids) => {
                              const id = ids[0]
                              if (id && id.startsWith("resultFile:")) {
                                setSelectedResultFilePath(id)
                                const filePath = id.slice("resultFile:".length)
                                setResultFileLoading(true)
                                setResultFileContent(null)
                                executeWsOperation<{ content: string | null, size: number | null }>({
                                  messageType: "getResultFile",
                                  sendFn: () => backendWs.send({ type: "getResultFile", data: { path: filePath } }),
                                }).then((res) => {
                                  setResultFileContent(res)
                                }).catch(() => setResultFileContent(null)).finally(() => setResultFileLoading(false))
                              } else {
                                setSelectedResultFilePath(null)
                                setResultFileContent(null)
                              }
                            }}
                            showLines={true}
                            showIcons={true}
                            selectable={true}
                            collapseDisabled={true}
                            className="flex-1 min-h-0"
                          >
                            <TreeView className="p-0 overflow-auto h-full">
                              {resultTree.map((pb) => (
                                <TreeNode key={`pb:${pb.playbookName}`} nodeId={`pb:${pb.playbookName}`}>
                                  <TreeNodeTrigger>
                                    <TreeLabel>{pb.playbookName}</TreeLabel>
                                  </TreeNodeTrigger>
                                  {pb.models.map((m) => (
                                    <TreeNode key={`model:${pb.playbookName}/${m.providerID}/${m.modelName}`} nodeId={`model:${pb.playbookName}/${m.providerID}/${m.modelName}`} level={1}>
                                      <TreeNodeTrigger>
                                        <TreeLabel>{m.modelName}</TreeLabel>
                                      </TreeNodeTrigger>
                                      {m.timestamps.map((ts) => (
                                        <TreeNode key={`ts:${pb.playbookName}/${m.providerID}/${m.modelName}/${ts.timestamp}`} nodeId={`ts:${pb.playbookName}/${m.providerID}/${m.modelName}/${ts.timestamp}`} level={2}>
                                          <TreeNodeTrigger>
                                            <TreeLabel>{new Date(parseInt(ts.timestamp)).toLocaleString()}</TreeLabel>
                                          </TreeNodeTrigger>
                                          {ts.files.map((file) => {
                                            const filePath = `${pb.playbookName}/${m.providerID}/${m.modelName}/${ts.timestamp}/${file}`
                                            return (
                                              <TreeNode key={`resultFile:${filePath}`} nodeId={`resultFile:${filePath}`} level={3}>
                                                <TreeNodeTrigger>
                                                  <TreeLabel>{file}</TreeLabel>
                                                </TreeNodeTrigger>
                                              </TreeNode>
                                            )
                                          })}
                                        </TreeNode>
                                      ))}
                                    </TreeNode>
                                  ))}
                                </TreeNode>
                              ))}
                            </TreeView>
                          </TreeProvider>
                        )}
                      </div>
                    )}
              </div>
            </div>
            </div>
                <div className={`${leftTab === "tool-call" ? "w-5/6" : "w-2/3"} flex flex-col gap-2 min-h-0`}>
                   {(() => {
                     if (leftTab === "results" && selectedResultFilePath) {
                       if (resultFileLoading) {
                         return (
                           <pre className="h-full overflow-auto rounded-4xl border bg-muted/50 p-3 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                             Loading...
                           </pre>
                         )
                       }
                       if (!resultFileContent || resultFileContent.content === null) {
                         return (
                           <pre className="h-full overflow-auto rounded-4xl border bg-muted/50 p-3 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                             Could not load file content.
                           </pre>
                         )
                       }
                       const fileName = selectedResultFilePath.split("/").pop()
                       try {
                          const parsed = JSON.parse(resultFileContent.content)
                          if (fileName === "rounds.json") {
                            const data = Array.isArray(parsed) ? { rounds: parsed } : parsed
                            return (
                             <div className="flex-1 flex flex-col gap-2 min-h-0">
                               <div className="shrink-0 text-xs text-muted-foreground space-x-2">
                                  {data.tokens && (
                                    <>
                                      <span>Tokens: {data.tokens.input} in / {data.tokens.output} out / {data.tokens.reasoning} reasoning</span>
                                       {data.cost != null && <span>Cost: ${Number(data.cost).toFixed(6)}</span>}
                                     </>
                                    )}
                </div>
                                {Array.isArray(data.rounds) && data.rounds.length > 0 ? (
                                  <div className="flex-1 flex flex-col gap-2 min-h-0 overflow-auto">
                                    {data.rounds.map((r: any, idx: number) => (
                                     <div key={idx} className="flex flex-col gap-1 shrink-0">
                                       <div className="text-xs font-medium text-muted-foreground">Round {r.round ?? idx + 1}</div>
                                       {r.text && (
                                          <details className="text-xs">
                                            <summary className="text-muted-foreground cursor-pointer">Thinking/Response ({r.text.length} chars)</summary>
                                            <pre className="mt-1 overflow-auto max-h-32 rounded-4xl border bg-muted/50 p-2 text-xs text-muted-foreground whitespace-pre-wrap break-words">{r.text}</pre>
                                          </details>
                                        )}
                                       {Array.isArray(r.toolCalls) && r.toolCalls.length > 0 && (
                                         <details className="text-xs">
                                           <summary className="text-muted-foreground cursor-pointer">Tool Calls ({r.toolCalls.length})</summary>
                                           <pre className="mt-1 overflow-auto max-h-32 rounded-4xl border bg-muted/50 p-2 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                                              {r.toolCalls.map((tc: any) => typeof tc === "string" ? tc : `${tc.tool}: ${tc.status}`).join("\n")}
                                           </pre>
                                         </details>
                                       )}
                                     </div>
                                   ))}
                                 </div>
                               ) : (
                                 <div className="text-xs text-muted-foreground">No rounds data.</div>
                               )}
                             </div>
                           )
                         }
                         if (fileName === "reconstruction.json") {
                           return (
                             <div className="flex-1 flex flex-col min-h-0">
                               <div className="flex-1 overflow-auto">
                                 {Array.isArray(parsed) && parsed.length > 0 ? (
                                   parsed.map((finding: any, idx: number) => (
                                     <div key={idx} className="mb-3 p-2 rounded-md border bg-muted/30 text-xs">
                                       <div className="font-medium">{finding.technique || `Finding ${idx + 1}`}</div>
                                       <div className="text-muted-foreground space-x-2">
                                         {finding.mitre && <span>MITRE: {finding.mitre}</span>}
                                         {finding.timestampUtc && <span>{finding.timestampUtc}</span>}
                                       </div>
                                       {finding.description && <div className="mt-1 text-muted-foreground">{finding.description}</div>}
                                       {Array.isArray(finding.evidence) && finding.evidence.length > 0 && (
                                         <div className="mt-1 text-muted-foreground">Sources: {finding.evidence.join(", ")}</div>
                                       )}
                                     </div>
                                   ))
                        ) : (
                                   <div className="text-xs text-muted-foreground">Empty reconstruction data.</div>
                                 )}
                               </div>
                             </div>
                           )
                         }
                       } catch {}
                       return (
                         <pre className="h-full overflow-auto rounded-4xl border bg-muted/50 p-3 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                           {resultFileContent.content}
                         </pre>
                       )
                     }

                     if (leftTab === "results" && !selectedResultFilePath) {
                       return (
                         <pre className="h-full overflow-auto rounded-4xl border bg-muted/50 p-3 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                           Select a result file to view its contents.
                         </pre>
                       )
                     }

                     const selected = rounds.find(r => r.key === selectedRoundKey)
                     if (!selected) {
                       return (
                         <pre className="h-full overflow-auto rounded-4xl border bg-muted/50 p-3 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                           Select a round to view details.
                         </pre>
                       )
                     }
                      return (
                        <>
                          <div className="flex-1 flex flex-col min-h-0">
                            <div className="shrink-0 text-xs font-medium text-muted-foreground mb-1">Tool Calls</div>
                            <pre ref={toolCallsPreRef} className="flex-1 overflow-auto rounded-4xl border bg-muted/50 p-3 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                              {selected.toolCalls.length > 0
                                ? selected.toolCalls.map((tc) => JSON.stringify({
                                    tool: tc.tool,
                                    status: tc.status,
                                    input: tc.input,
                                    output: tc.output,
                                    error: tc.error,
                                  }, null, 2)).join("\n\n")
                                : "No tool calls in this round."}
                            </pre>
                          </div>
                          <div className="flex-1 flex flex-col min-h-0">
                            <div className="shrink-0 text-xs font-medium text-muted-foreground mb-1">Thinking / Response</div>
                            <pre ref={thinkingResponsePreRef} className="flex-1 overflow-auto rounded-4xl border bg-muted/50 p-3 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                              {selected.text || "No response in this round."}
                            </pre>
                          </div>
                        </>
                      )
                    })()}
                  </div>
              </div>
               </>
            )}
              </div>
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
      <AlertDialog open={showConfirmStagingDialog} onOpenChange={setShowConfirmStagingDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Extract Artifacts</AlertDialogTitle>
            <AlertDialogDescription>
              {stagedExists
                ? "Existing extracted artifact data found. Overwrite?"
                : "Perform pre-agent staging and extract artifacts?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmStaging}>
              {stagedExists ? "Overwrite" : "OK"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={deleteEvidenceDialogOpen} onOpenChange={setDeleteEvidenceDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Evidence</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &ldquo;{pendingDeleteEvidenceName}&rdquo; and all its evidence files?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteEvidence}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={showConfirmAbortDialog} onOpenChange={setShowConfirmAbortDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abort Workflow</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to abort the running workflow? This will cancel all in-progress operations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              executeWsOperation({ messageType: "abortOpencodeWorkflow", sendFn: () => backendWs.send({ type: "abortOpencodeWorkflow" }) }).catch(() => {})
              setShowConfirmAbortDialog(false)
            }}>
              Abort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={showConfirmRunWorkflowDialog} onOpenChange={setShowConfirmRunWorkflowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run Workflow</AlertDialogTitle>
            <AlertDialogDescription>
              Run the workflow <strong>{selectedWorkflowName ?? "None"}</strong> against evidence folder <strong>{selectedEvidenceFolder || "None"}</strong> with model <strong>{selectedModel || "None"}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              backendWs.send({ type: "runOpencodeWorkflow", data: { playbookName: selectedEvidenceFolder, workflowName: selectedWorkflowName, model: selectedModel } })
              setShowConfirmRunWorkflowDialog(false)
            }}>
              Run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TabContentCard>
  )
}