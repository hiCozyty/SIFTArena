import {
  TreeIcon,
  TreeLabel,
  TreeNode,
  TreeNodeContent,
  TreeNodeTrigger,
  TreeProvider,
  TreeView,
} from "@/components/kibo-ui/tree"
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Trash2, Download, Upload } from "lucide-react"
import { useState, useCallback } from "react"
import { NoiseTree, type NoiseSelected } from "@/components/playbook/noise-tree"
import type { PlaybookData } from "@/components/playbook/playbook-content"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export type PlaybookEntry = {
  id: string
  name: string
  abilities: { id: string; name: string }[]
}

export function PlaybookTree({
  onSelectNoise,
  noises,
  onDeleteNoise,
  leftTab,
  onLeftTabChange,
  playbooks,
  onSelectedNoiseChange,
  hideAddNoiseButton,
  onSelectedPlaybookChange,
  onDeletePlaybook,
  onImportPlaybook,
}: {
  onSelectNoise: (selected: NoiseSelected) => void
  noises: Array<{ name: string; command: string; description: string }>
  onDeleteNoise: (name: string) => void
  leftTab: string
  onLeftTabChange: (tab: string) => void
  playbooks: PlaybookData[]
  onSelectedNoiseChange?: (name: string | null) => void
  hideAddNoiseButton?: boolean
  onSelectedPlaybookChange?: (name: string | null) => void
  onDeletePlaybook?: (name: string) => void
  onImportPlaybook?: (data: Record<string, unknown>) => void
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [dialog, setDialog] = useState<{ type: "delete" | "export" | "import"; name?: string; data?: PlaybookData } | null>(null)
  const [importText, setImportText] = useState("")

  const handlePlaybookSelectionChange = (ids: string[]) => {
    setSelectedIds(ids)
    const playbookId = ids.find(id => id.startsWith("playbook-"))
    onSelectedPlaybookChange?.(playbookId ? playbookId.replace("playbook-", "") : null)
  }

  const encodedPayload = dialog?.type === "export" && dialog.data
    ? (() => {
        const json = JSON.stringify(dialog.data)
        const bytes = new TextEncoder().encode(json)
        let binary = ""
        bytes.forEach(b => binary += String.fromCharCode(b))
        return btoa(binary)
      })()
    : null

  const handleCopy = useCallback(async () => {
    if (encodedPayload) {
      await navigator.clipboard.writeText(encodedPayload)
    }
  }, [encodedPayload])

  const [copied, setCopied] = useState(false)

  const handleCopyClick = useCallback(async () => {
    await handleCopy()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [handleCopy])

  const handleImportSubmit = useCallback(() => {
    if (!importText.trim()) return
    const raw = importText.trim()
    try {
      const binary = atob(raw)
      const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
      const data = JSON.parse(new TextDecoder().decode(bytes))
      if (typeof data.name === "string") {
        data.name = `${data.name}-${raw.slice(0, 6)}`
      }
      onImportPlaybook?.(data)
    } catch (err) {
      console.error("[playbook] import decode failed:", err)
      return
    }
    setDialog(null)
  }, [importText, onImportPlaybook])

  return (
    <>
    <TreeProvider selectedIds={selectedIds} onSelectionChange={handlePlaybookSelectionChange} defaultExpandedIds={["playbooks"]} collapseDisabled className="h-full">
      <div className="flex h-full flex-col">
        <div className="shrink-0 p-2 pb-0">
          <Tabs value={leftTab} onValueChange={onLeftTabChange} defaultValue="playbook" className="flex flex-col items-center">
            <TabsList>
              <TabsTrigger value="playbook">
                Playbooks
              </TabsTrigger>
              <TabsTrigger value="noise">
                Noise
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {leftTab === "playbook" ? (
          <div className="min-h-0 min-w-0 flex-1 max-w-full flex flex-col">
            <TreeView className="pl-0 rounded-lg m-2 -ml-[5px] flex-1 overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <TreeNode nodeId="playbooks" isLast={true}>
                <div className="group relative mx-1 flex items-center rounded-4xl px-3 py-2">
                  <TreeIcon hasChildren />
                  <TreeLabel className="whitespace-normal break-words">Playbooks</TreeLabel>
                  <button
                    className="ml-auto flex items-center gap-1 hover:text-primary text-xs"
                    onClick={(e) => {
                      e.stopPropagation()
                      setImportText("")
                      setDialog({ type: "import" })
                    }}
                    aria-label="Import playbook"
                    title="Import playbook"
                  >
                    import
                    <Download className="size-3" />
                  </button>
                </div>
                <TreeNodeContent hasChildren>
                  {playbooks.map((p, i) => (
                    <TreeNode key={p.name} nodeId={`playbook-${p.name}`} level={1} isLast={i === playbooks.length - 1}>
                      <TreeNodeTrigger>
                        <TreeIcon hasChildren={false} />
                        <TreeLabel className="whitespace-normal break-words">{p.name}</TreeLabel>
                        <button
                          className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity hover:text-primary"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDialog({ type: "export", name: p.name, data: p })
                          }}
                          aria-label={`Export ${p.name}`}
                          title={`Export ${p.name}`}
                        >
                          <Upload className="size-3" />
                        </button>
                        <button
                          className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDialog({ type: "delete", name: p.name })
                          }}
                          aria-label={`Delete ${p.name}`}
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </TreeNodeTrigger>
                    </TreeNode>
                  ))}
                </TreeNodeContent>
              </TreeNode>
            </TreeView>
          </div>
        ) : (
          <div className="min-h-0 min-w-0 flex-1 max-w-full">
            <NoiseTree onSelect={onSelectNoise} noises={noises} onDeleteNoise={onDeleteNoise} onSelectedNoiseChange={onSelectedNoiseChange} hideAddButton={hideAddNoiseButton} />
          </div>
        )}
      </div>
    </TreeProvider>
    {dialog && dialog.type === "delete" && (
      <AlertDialog open onOpenChange={() => setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Playbook</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete &ldquo;{dialog.name}&rdquo;?
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDeletePlaybook?.(dialog.name)
                setDialog(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )}
    {dialog && dialog.type === "export" && encodedPayload && (
      <AlertDialog open onOpenChange={() => setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Export &ldquo;{dialog.name}&rdquo;</AlertDialogTitle>
          </AlertDialogHeader>
          <pre className="max-h-60 overflow-auto rounded border border-input bg-muted p-3 text-xs font-mono whitespace-pre-wrap break-all">
            {encodedPayload}
          </pre>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                handleCopyClick()
                setDialog(null)
              }}
            >
              {copied ? "Copied" : "Copy"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )}
    {dialog && dialog.type === "import" && (
      <AlertDialog open onOpenChange={() => setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Import Playbook</AlertDialogTitle>
          </AlertDialogHeader>
          <textarea
            className="min-h-[120px] w-full rounded border border-input bg-muted p-3 text-xs font-mono resize-y"
            placeholder="Paste base64-encoded playbook here..."
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={!importText.trim()} onClick={handleImportSubmit}>
              Import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    )}
    </>
  )
}
