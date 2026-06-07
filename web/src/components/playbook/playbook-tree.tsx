import {
  TreeIcon,
  TreeLabel,
  TreeNode,
  TreeNodeTrigger,
  TreeProvider,
  TreeView,
} from "@/components/kibo-ui/tree"
import { Plus } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"

export type PlaybookEntry = {
  id: string
  name: string
  abilities: { id: string; name: string }[]
}

export function PlaybookTree({
  playbooks,
  onAddPlaybook,
}: {
  playbooks: PlaybookEntry[]
  onAddPlaybook: () => void
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  return (
    <TreeProvider selectedIds={selectedIds} onSelectionChange={setSelectedIds} defaultExpandedIds={[]} className="h-full">
      <div className="flex h-full flex-col">
        <div className="min-h-0 min-w-0 flex-1 max-w-full flex flex-col">
          <TreeView className="pl-0 rounded-lg m-2 -ml-[5px] flex-1 overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TreeNode nodeId="playbooks" isLast={true}>
              <TreeNodeTrigger>
                <TreeIcon hasChildren />
                <TreeLabel className="whitespace-normal break-words">Playbooks</TreeLabel>
              </TreeNodeTrigger>
            </TreeNode>
          </TreeView>
        </div>
        <div className="shrink-0 p-2">
          <Button className="w-full" onClick={onAddPlaybook}>
            <Plus className="size-4" />
            Add a playbook
          </Button>
        </div>
      </div>
    </TreeProvider>
  )
}
