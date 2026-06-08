import {
  TreeIcon,
  TreeLabel,
  TreeNode,
  TreeNodeContent,
  TreeNodeTrigger,
  TreeProvider,
  TreeView,
} from "@/components/kibo-ui/tree"
import { Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"

export type NoiseSelected =
  | { type: "create-noise" }
  | { type: "select-noise" }
  | { type: "none" }

export function NoiseTree({
  onSelect,
  noises,
  onDeleteNoise,
  onSelectedNoiseChange,
  hideAddButton,
}: {
  onSelect: (selected: NoiseSelected) => void
  noises: Array<{ name: string; command: string; description: string }>
  onDeleteNoise: (name: string) => void
  onSelectedNoiseChange?: (name: string | null) => void
  hideAddButton?: boolean
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const handleSelectionChange = (ids: string[]) => {
    setSelectedIds(ids)
    const noiseId = ids.find(id => id.startsWith("noise-"))
    onSelectedNoiseChange?.(noiseId ? noiseId.replace("noise-", "") : null)
  }

  return (
    <TreeProvider selectedIds={selectedIds} onSelectionChange={handleSelectionChange} defaultExpandedIds={["noise"]} collapseDisabled className="h-full">
      <div className="flex h-full flex-col">
        <div className="min-h-0 min-w-0 flex-1 max-w-full flex flex-col">
          <TreeView className="pl-0 rounded-lg m-2 -ml-[5px] flex-1 overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TreeNode nodeId="noise" isLast={true}>
              <div className="group relative mx-1 flex items-center rounded-4xl px-3 py-2">
                <TreeIcon hasChildren />
                <TreeLabel className="whitespace-normal break-words">Noise</TreeLabel>
              </div>
              <TreeNodeContent hasChildren>
                {noises.map((n, i) => (
                  <TreeNode key={n.name} nodeId={`noise-${n.name}`} level={1} isLast={i === noises.length - 1}>
                    <TreeNodeTrigger>
                      <TreeIcon hasChildren={false} />
                      <TreeLabel className="whitespace-normal break-words">{n.name}</TreeLabel>
                      <button
                        className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteNoise(n.name)
                        }}
                        aria-label={`Delete ${n.name}`}
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
        <div className="shrink-0 p-2">
          {!hideAddButton && (
            <Button className="w-full" onClick={() => onSelect({ type: "create-noise" })}>
              <Plus className="size-4" />
              Add Noise Template
            </Button>
          )}
        </div>
      </div>
    </TreeProvider>
  )
}
