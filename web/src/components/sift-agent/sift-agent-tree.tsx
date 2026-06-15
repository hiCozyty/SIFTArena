import {
  TreeIcon,
  TreeLabel,
  TreeNode,
  TreeNodeContent,
  TreeProvider,
  TreeNodeTrigger,
  TreeView,
  useTree,
} from "@/components/kibo-ui/tree"
import { Trash2 } from "lucide-react"
type FileEntry = {
  name: string
  type: "file" | "directory"
  children?: FileEntry[]
}

export type Workflow = {
  name: string
  config: Record<string, unknown> | null
  agentsContent: string | null
  files: FileEntry[]
}

function FileTreeRow({
  name,
  isDirectory,
  children,
  nodeId,
  isLast,
  level,
  onSelectFile,
  onResetSelection,
  onDeleteFolder,
}: {
  name: string
  isDirectory: boolean
  children?: FileEntry[]
  nodeId: string
  isLast: boolean
  level: number
  onSelectFile?: (path: string) => void
  onResetSelection?: (nodeId: string | null) => void
  onDeleteFolder?: (name: string) => void
}) {
  const { expandedIds } = useTree()

  return (
    <TreeNode nodeId={nodeId} isLast={isLast} level={level}>
      <TreeNodeTrigger
        onClick={
          isDirectory
            ? onResetSelection
              ? () => {
                  if (expandedIds.has(nodeId)) {
                    onResetSelection(null)
                  } else {
                    onResetSelection(nodeId)
                  }
                }
              : undefined
            : onSelectFile
              ? () => onSelectFile(nodeId)
              : undefined
        }
      >
        <TreeIcon hasChildren={isDirectory && (children?.length ?? 0) > 0} />
        <TreeLabel className="whitespace-normal break-words text-xs">{name}</TreeLabel>
        {level === 1 && onDeleteFolder && (
          <button
            className="ml-auto hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              onDeleteFolder(name)
            }}
            aria-label={`Delete ${name}`}
          >
            <Trash2 className="size-3" />
          </button>
        )}
      </TreeNodeTrigger>
      {isDirectory && children && children.length > 0 && (
        <TreeNodeContent hasChildren>
          {children.map((entry, i) => (
            <FileTreeRow
              key={entry.name}
              name={entry.name}
              isDirectory={entry.type === "directory"}
              children={entry.children}
              nodeId={`${nodeId}/${entry.name}`}
              isLast={i === children.length - 1}
              level={level + 1}
              onSelectFile={onSelectFile}
              onResetSelection={onResetSelection}
              onDeleteFolder={onDeleteFolder}
            />
          ))}
        </TreeNodeContent>
      )}
    </TreeNode>
  )
}

function collectDirIds(entries: FileEntry[], parentPath: string): string[] {
  const ids: string[] = []
  for (const entry of entries) {
    if (entry.type !== "directory") continue
    const id = `${parentPath}/${entry.name}`
    ids.push(id)
    if (entry.children) ids.push(...collectDirIds(entry.children, id))
  }
  return ids
}

export function SiftAgentTree({
  workflows,
  onSelectFile,
  onResetSelection,
  selectedNodeId,
  rootLabel = "Workflows",
  onDeleteFolder,
}: {
  workflows?: Workflow[] | null
  onSelectFile?: (path: string) => void
  onResetSelection?: (nodeId: string | null) => void
  selectedNodeId: string | null
  rootLabel?: string
  onDeleteFolder?: (name: string) => void
}) {

  return (
    <TreeProvider
      defaultExpandedIds={[
        "workflows",
        ...(workflows?.flatMap((w) => {
          const dirId = `workflows/${w.name}`
          return [dirId, ...collectDirIds(w.files, dirId)]
        }) ?? []),
      ]}
      selectedIds={selectedNodeId ? [selectedNodeId] : []}
      onSelectionChange={() => {}}
      className="h-full"
    >
      <div className="flex h-full flex-col">
        <div className="min-h-0 min-w-0 flex-1 max-w-full flex flex-col">
          <TreeView className="pl-0 pt-0 rounded-lg mt-0 mr-2 mb-2 ml-2 -ml-[5px] flex-1 overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TreeNode nodeId="workflows" isLast={true}>
              <div className="group relative mx-1 flex items-center rounded-4xl px-3 py-2">
                <TreeIcon hasChildren />
                <TreeLabel className="whitespace-normal break-words">{rootLabel}</TreeLabel>
              </div>
              <TreeNodeContent hasChildren>
                {workflows?.map((w, i) => (
                  <FileTreeRow
                    key={w.name}
                    name={w.name}
                    isDirectory={true}
                    children={w.files}
                    nodeId={`workflows/${w.name}`}
                    isLast={i === (workflows.length - 1)}
                    level={1}
                    onSelectFile={onSelectFile}
                    onResetSelection={onResetSelection}
                    onDeleteFolder={onDeleteFolder}
                  />
                ))}
              </TreeNodeContent>
            </TreeNode>
          </TreeView>
        </div>
      </div>
    </TreeProvider>
  )
}
