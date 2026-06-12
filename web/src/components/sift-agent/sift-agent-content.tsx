import { SiftAgentIcon } from "@/components/icons/sift-agent-icon"
import { Button } from "@/components/ui/button"
import { TabContentCard } from "@/components/shared-ui-primitives/tab-content-card"
import { SiftAgentTree } from "@/components/sift-agent/sift-agent-tree"
import { SiftTerminal } from "@/sift-docker/sift-terminal"
import { SiftVnc } from "@/sift-docker/sift-vnc"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { NotebookPen, Monitor, Terminal } from "lucide-react"
import { useState, useCallback, useEffect, useMemo } from "react"
import { codeToHtml } from "shiki"
import { useTheme } from "@/components/shared-ui-primitives/theme-provider"
import * as backendWs from "@/lib/backend-ws"
import { executeWsOperation } from "@/lib/ws-ops"

const langMap: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  mdc: "markdown",
  css: "css",
  html: "html",
  py: "python",
  rs: "rust",
  go: "go",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  toml: "toml",
  lock: "json",
  xml: "xml",
  sql: "sql",
  graphql: "graphql",
  dockerfile: "dockerfile",
}

function getLang(path: string | null): string {
  if (!path) return "text"
  const ext = path.split(".").pop()?.toLowerCase() ?? ""
  return langMap[ext] ?? "text"
}

type Workflow = {
  name: string
  config: Record<string, unknown> | null
  agentsContent: string | null
  files: { name: string, type: "file" | "directory", children?: unknown[] }[]
}

export function SiftAgentContent({
  configured,
  onConfigured,
}: {
  configured: boolean
  onConfigured: (configured: boolean) => void
}) {
  const { theme } = useTheme()
  const shikiTheme = useMemo(() => {
    const isDark = theme === "system"
      ? document.documentElement.classList.contains("dark")
      : theme === "dark"
    return isDark ? "github-dark" : "github-light"
  }, [theme])

  const [activeTab, setActiveTab] = useState("notes")
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null)
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const [selectedWorkflowName, setSelectedWorkflowName] = useState<string | null>(null)
  const [pendingWorkflowName, setPendingWorkflowName] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null)
  const [isStartingSession, setIsStartingSession] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)

  useEffect(() => {
    if (fileContent === null) {
      setHighlightedHtml(null)
      return
    }
    const lang = getLang(selectedFilePath)
    codeToHtml(fileContent, { lang, theme: shikiTheme }).then(setHighlightedHtml)
  }, [fileContent, selectedFilePath, shikiTheme])

  useEffect(() => {
    executeWsOperation<Workflow[]>({
      messageType: "listWorkflows",
      sendFn: () => backendWs.send({ type: "listWorkflows" }),
    }).then(setWorkflows).catch(() => setWorkflows([]))
  }, [])

  useEffect(() => {
    onConfigured(selectedWorkflowName !== null)
  }, [selectedWorkflowName, onConfigured])

  const handleSelectFile = useCallback((nodeId: string) => {
    setActiveTab("notes")
    if (nodeId === selectedNodeId) {
      setSelectedNodeId(null)
      setSelectedFilePath(null)
      setPendingWorkflowName(null)
      setFileContent(null)
      setHighlightedHtml(null)
      return
    }
    const path = nodeId.startsWith("workflows/") ? nodeId.slice("workflows/".length) : nodeId
    setSelectedNodeId(nodeId)
    setSelectedFilePath(path)
    setPendingWorkflowName(path.split("/")[0])
    executeWsOperation<{ content: string | null }>({
      messageType: "readWorkflowFile",
      sendFn: () => backendWs.send({ type: "readWorkflowFile", data: { path } }),
    }).then((r) => setFileContent(r.content)).catch(() => setFileContent(null))
  }, [selectedNodeId])

  const handleResetSelection = useCallback((nodeId: string | null) => {
    if (nodeId === null) {
      setSelectedNodeId(null)
      setSelectedFilePath(null)
      setPendingWorkflowName(null)
      setFileContent(null)
      setHighlightedHtml(null)
      return
    }
    if (nodeId === selectedNodeId) {
      setSelectedNodeId(null)
      setSelectedFilePath(null)
      setPendingWorkflowName(null)
      setFileContent(null)
      setHighlightedHtml(null)
      return
    }
    const path = nodeId.startsWith("workflows/") ? nodeId.slice("workflows/".length) : nodeId
    setSelectedNodeId(nodeId)
    setSelectedFilePath(null)
    setPendingWorkflowName(path.split("/")[0])
    setFileContent(null)
    setHighlightedHtml(null)
  }, [selectedNodeId])

  const handleSelectWorkflow = useCallback(async () => {
    if (!pendingWorkflowName) return
    setIsStartingSession(true)
    setSessionError(null)
    try {
      await executeWsOperation({
        messageType: "initializeOpencodeSession",
        sendFn: () => backendWs.send({ type: "initializeOpencodeSession", data: { workflowName: pendingWorkflowName } }),
      })
      setSelectedWorkflowName(pendingWorkflowName)
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsStartingSession(false)
    }
  }, [pendingWorkflowName])

  return (
    <TabContentCard className="p-6 flex flex-col min-h-0">
      <div className="mb-4 flex items-center gap-3 shrink-0">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
          <SiftAgentIcon className="size-[1.375rem] text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">SIFT Agent</h3>
          <p className="text-muted-foreground text-sm">Current selected AI agent workflow: {selectedWorkflowName ? <strong>{selectedWorkflowName}</strong> : "none"}</p>
        </div>
      </div>
      <div className="mt-4 flex-1 min-h-0 rounded-lg flex gap-4">
        <div className="w-[200px] shrink-0 overflow-hidden h-full">
          <SiftAgentTree
            workflows={workflows}
            selectedNodeId={selectedNodeId}
            onSelectFile={handleSelectFile}
            onResetSelection={handleResetSelection}
          />
        </div>
        <div className="flex-1 min-w-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="notes" className="flex h-full flex-col">
            <div className="flex shrink-0 items-center justify-between px-4 py-2">
              <TabsList>
                <TabsTrigger value="notes">
                  <NotebookPen className="size-4" />
                </TabsTrigger>
                <TabsTrigger value="vnc">
                  <Monitor className="size-4" />
                </TabsTrigger>
                <TabsTrigger value="cli">
                  <Terminal className="size-4" />
                </TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-2">
                {sessionError && (
                  <span className="text-xs text-destructive">{sessionError}</span>
                )}
                <Button
                  disabled={!pendingWorkflowName || isStartingSession}
                  onClick={handleSelectWorkflow}
                >
                  {isStartingSession ? "Starting..." : "Select Workflow"}
                </Button>
              </div>
            </div>
            <TabsContent value="notes" className="flex-1 min-h-0 rounded-4xl bg-muted shadow-sm">
              {fileContent !== null ? (
                <div className="flex h-full flex-col">
                  <div className="shrink-0 px-4 py-2 border-b border-border text-xs text-muted-foreground font-mono">
                    {selectedFilePath}
                  </div>
                  {highlightedHtml !== null ? (
                    <div
                      className="flex-1 overflow-auto p-4 text-xs [scrollbar-width:thin] [&::-webkit-scrollbar-button]:hidden [&_pre]:!bg-transparent [&_pre]:!p-0"
                      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                    />
                  ) : (
                    <pre className="flex-1 overflow-auto p-4 text-xs font-mono whitespace-pre-wrap break-all [scrollbar-width:thin] [&::-webkit-scrollbar-button]:hidden m-0">
                      {fileContent}
                    </pre>
                  )}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  Select a file from a workflow from the left panel
                </div>
              )}
            </TabsContent>
            <TabsContent value="vnc" className="flex-1 min-h-0 rounded-4xl bg-muted shadow-sm">
              <SiftVnc containerId="sift" className="h-full" />
            </TabsContent>
            <TabsContent value="cli" className="flex-1 min-h-0 rounded-4xl bg-muted shadow-sm">
              <SiftTerminal containerId="sift" className="h-full" />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </TabContentCard>
  )
}
