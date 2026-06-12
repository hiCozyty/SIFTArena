import { useRef, useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Lock } from "lucide-react"
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
import { Progress } from "@/components/ui/progress"
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
import { SiftAgentTree, type Workflow } from "@/components/sift-agent/sift-agent-tree"
import * as backendWs from "@/lib/backend-ws"
import { executeWsOperation } from "@/lib/ws-ops"

const LOGS = [
  "Initializing environment...",
  "Loading LSASS dump module...",
  "Executing attack chain...",
  "Collecting evidence artifacts...",
  "Processing memory snapshot...",
  "Analyzing network captures...",
  "Generating timeline...",
]

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  const gb = mb / 1024
  return `${gb.toFixed(1)} GB`
}

export function BenchmarkContent({
  playbookCompleted,
  siftAgentConfigured,
}: {
  playbookCompleted: boolean
  siftAgentConfigured: boolean
}) {
  const logRef = useRef<HTMLDivElement>(null)
  const streamRef = useRef<HTMLPreElement>(null)
  const navigate = useNavigate()
  const [playbookFinished, setPlaybookFinished] = useState(false)

  const [evidence, setEvidence] = useState<Workflow[]>([])
  const [selectedEvidenceNodeId, setSelectedEvidenceNodeId] = useState<string | null>(null)
  const [evidenceFileInfo, setEvidenceFileInfo] = useState<{ name: string | null, path: string, size: number | null, hash: string | null, created: string | null } | null>(null)
  const [evidenceFileInfoLoading, setEvidenceFileInfoLoading] = useState(false)
  const [mountingEvidence, setMountingEvidence] = useState(false)
  const [mountResult, setMountResult] = useState<string | null>(null)
  const [mountError, setMountError] = useState<string | null>(null)
  const [unmountingEvidence, setUnmountingEvidence] = useState(false)
  const [mountedPlaybookName, setMountedPlaybookName] = useState<string | null>(null)
  const [mountStreamOutput, setMountStreamOutput] = useState("")
  const [collectingEvidence, setCollectingEvidence] = useState(false)
  const [evidenceCollectionError, setEvidenceCollectionError] = useState<string | null>(null)
  const [showCollectDialog, setShowCollectDialog] = useState(false)
  const [collectDialogOverwrite, setCollectDialogOverwrite] = useState(false)

  useEffect(() => {
    if (!playbookFinished) return
    executeWsOperation<Workflow[]>({
      messageType: "listEvidence",
      sendFn: () => backendWs.send({ type: "listEvidence" }),
    }).then(setEvidence).catch(() => setEvidence([]))
  }, [playbookFinished])

  useEffect(() => {
    if (playbookCompleted) setPlaybookFinished(true)
  }, [playbookCompleted])

  useEffect(() => {
    if (playbookFinished) return
    executeWsOperation<Workflow[]>({
      messageType: "listEvidence",
      sendFn: () => backendWs.send({ type: "listEvidence" }),
    }).then((results) => {
      setEvidence(results)
      if (results?.length > 0) setPlaybookFinished(true)
    }).catch(() => setEvidence([]))
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
    executeWsOperation<{ name: string | null, path: string, size: number | null, hash: string | null }>({
      messageType: "getEvidenceFileInfo",
      sendFn: () => backendWs.send({ type: "getEvidenceFileInfo", data: { path } }),
    }).then(setEvidenceFileInfo).catch(() => setEvidenceFileInfo(null)).finally(() => setEvidenceFileInfoLoading(false))
  }, [selectedEvidenceNodeId])

  const handleMountEvidence = useCallback(async () => {
    if (!evidenceFileInfo?.path) return
    const playbookDir = evidenceFileInfo.path.split("/")[0]
    console.log("[handleMountEvidence] Sending mount request for:", playbookDir)
    setMountStreamOutput("")
    setMountingEvidence(true)
    setMountResult(null)
    setMountError(null)
    try {
      const result = await executeWsOperation<{ success: boolean, output: string, mountPoint: string }>({
        messageType: "mountEvidenceToSift",
        sendFn: () => backendWs.send({ type: "mountEvidenceToSift", data: { path: playbookDir } }),
      })
      console.log("[handleMountEvidence] Mount response:", result)
      setMountResult(result.output)
      setMountedPlaybookName(playbookDir)
    } catch (err) {
      console.error("[handleMountEvidence] Mount error:", err)
      setMountError(err instanceof Error ? err.message : String(err))
    } finally {
      console.log("[handleMountEvidence] Done, setting mountingEvidence=false")
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

  const handleCollectEvidence = useCallback(async () => {
    setCollectingEvidence(true)
    setEvidenceCollectionError(null)
    try {
      const { exists } = await executeWsOperation<{ exists: boolean }>({
        messageType: "checkEvidenceExists",
        sendFn: () => backendWs.send({ type: "checkEvidenceExists", data: { playbookName: "test-playbook" } }),
      })
      setCollectDialogOverwrite(exists)
      setShowCollectDialog(true)
    } catch (err) {
      setEvidenceCollectionError(err instanceof Error ? err.message : String(err))
    } finally {
      setCollectingEvidence(false)
    }
  }, [])

  const handleConfirmCollect = useCallback(async () => {
    setShowCollectDialog(false)
    setCollectingEvidence(true)
    setEvidenceCollectionError(null)
    try {
      await executeWsOperation({
        messageType: "collectEvidence",
        sendFn: () => backendWs.send({ type: "collectEvidence", data: { playbookName: "test-playbook", vmid: 107, overwrite: true } }),
      })
      setPlaybookFinished(true)
    } catch (err) {
      setEvidenceCollectionError(err instanceof Error ? err.message : String(err))
    } finally {
      setCollectingEvidence(false)
    }
  }, [])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [])

  return (
    <TabContentCard className="p-6">
      <div className="mb-6 flex items-center gap-3">
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
            {!playbookCompleted || !siftAgentConfigured ? (
              <div className="py-8 flex flex-col items-center justify-center">
                <Lock className="mb-4 size-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-semibold">Playbook Settings locked</h3>
                <p className="mb-6 text-sm text-muted-foreground">
                  {!playbookCompleted && !siftAgentConfigured
                    ? <>Complete <strong>Playbook</strong> and <strong>SIFT Agent</strong> setup first to unlock this section.</>
                    : !playbookCompleted
                    ? <>Complete <strong>Playbook</strong> setup first to unlock this section.</>
                    : <>Complete <strong>SIFT Agent</strong> setup first to unlock this section.</>
                  }
                </p>
                <div className="flex items-center gap-2">
                  {!playbookCompleted && (
                    <Button onClick={() => navigate("/playbook", { replace: true })}>
                      Go to Playbook
                    </Button>
                  )}
                  {!siftAgentConfigured && (
                    <Button onClick={() => navigate("/sift-agent", { replace: true })}>
                      Go to SIFT Agent
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">Select Model:</span>
                  <Select defaultValue="gpt-4">
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gpt-4">GPT-4</SelectItem>
                      <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                      <SelectItem value="claude-3.5">Claude 3.5 Sonnet</SelectItem>
                      <SelectItem value="claude-3-opus">Claude 3 Opus</SelectItem>
                      <SelectItem value="gemini-1.5">Gemini 1.5 Pro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">Current Playbook Selected:</span>
                  <span className="text-muted-foreground text-sm">T1003.001 LSASS Dump</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">Current Workflow Selected:</span>
                  <span className="text-muted-foreground text-sm">Full Attack Chain</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button>Run playbook</Button>
                  <Button
                    disabled={collectingEvidence}
                    onClick={handleCollectEvidence}
                  >
                    {collectingEvidence ? "Collecting..." : "Collect evidence"}
                  </Button>
                </div>
                {evidenceCollectionError && (
                  <p className="text-xs text-destructive">{evidenceCollectionError}</p>
                )}
                <div className="flex items-center gap-2">
                  <Progress value={45} className="w-48" />
                  <span className="text-muted-foreground text-xs">45%</span>
                </div>
                <div
                  ref={logRef}
                  className="max-h-16 overflow-y-auto rounded-2xl bg-muted/50 p-2 font-mono text-xs text-muted-foreground"
                >
                  {LOGS.map((log, i) => (
                    <p key={i}>{log}</p>
                  ))}
                </div>
                <Button
                  variant="secondary"
                  onClick={() => setPlaybookFinished(true)}
                >
                  Finish playbook
                </Button>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="evidence-collection" disabled={!playbookFinished}>
          <AccordionTrigger>
            Evidence Collection
            {!playbookFinished && (
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
                      <pre className="font-mono text-xs text-zinc-700 flex-1 overflow-auto p-3 dark:text-zinc-300">
                        <code>{[
                          `name:    ${evidenceFileInfo.name}`,
                          `path:    ${evidenceFileInfo.path}`,
                          `size:    ${evidenceFileInfo.size !== null ? formatSize(evidenceFileInfo.size) : "unknown"}`,
                          evidenceFileInfo.created && `created: ${new Date(evidenceFileInfo.created).toLocaleString()}`,
                          evidenceFileInfo.hash && `hash:    ${evidenceFileInfo.hash}`,
                        ].filter(Boolean).join("\n")}</code>
                      </pre>
                       {(mountStreamOutput || mountResult) && (
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
        <AccordionItem value="timeline-analysis" disabled={!mountedPlaybookName}>
          <AccordionTrigger>
            Timeline and Analysis
            {!mountedPlaybookName && (
              <span className="ml-1 text-muted-foreground/80 font-normal">(Select and Mount Evidence to SIFT)</span>
            )}
          </AccordionTrigger>
          <AccordionContent>
            <div className="h-[calc(80vh-17rem)] overflow-auto rounded-xl border bg-muted/30 p-4">
              <p className="text-muted-foreground text-sm">
                Content for <strong>Timeline and Analysis</strong> goes here.
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <AlertDialog open={showCollectDialog} onOpenChange={setShowCollectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {collectDialogOverwrite ? "Overwrite Evidence?" : "Collect Evidence?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {collectDialogOverwrite
                ? "Evidence already exists for test-playbook. Overwrite?"
                : "Collect evidence for test-playbook? Files will be saved to evidence/test-playbook/."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCollect}>
              {collectDialogOverwrite ? "Overwrite" : "Collect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TabContentCard>
  )
}