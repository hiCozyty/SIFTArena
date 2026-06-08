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
import { Trash2 } from "lucide-react"
import { useState } from "react"
import { NoiseTree, type NoiseSelected } from "@/components/playbook/noise-tree"
import type { PlaybookData } from "@/components/playbook/playbook-content"

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
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const handlePlaybookSelectionChange = (ids: string[]) => {
    setSelectedIds(ids)
    const playbookId = ids.find(id => id.startsWith("playbook-"))
    onSelectedPlaybookChange?.(playbookId ? playbookId.replace("playbook-", "") : null)
  }

  return (
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
                </div>
                <TreeNodeContent hasChildren>
                  {playbooks.map((p, i) => (
                    <TreeNode key={p.name} nodeId={`playbook-${p.name}`} level={1} isLast={i === playbooks.length - 1}>
                      <TreeNodeTrigger>
                        <TreeIcon hasChildren={false} />
                        <TreeLabel className="whitespace-normal break-words">{p.name}</TreeLabel>
                        <button
                          className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeletePlaybook?.(p.name)
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
  )
}
