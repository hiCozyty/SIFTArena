import {
  TreeExpander,
  TreeIcon,
  TreeLabel,
  TreeNode,
  TreeNodeContent,
  TreeNodeTrigger,
  TreeProvider,
  TreeView,
} from "@/components/kibo-ui/tree"
import { Database, Server } from "lucide-react"

type SnapshotNode = {
  id: string
  label: string
  children?: SnapshotNode[]
}

const PLACEHOLDER_SNAPSHOTS: SnapshotNode[] = [
  {
    id: "kali",
    label: "attacker-kali",
    children: [
      { id: "kali-base", label: "Base Snapshot" },
      { id: "kali-caldera", label: "Caldera Installed" },
    ],
  },
  {
    id: "windows",
    label: "win11-22h2",
    children: [
      { id: "win-base", label: "Base Snapshot" },
      { id: "win-hardened", label: "Hardened Config" },
    ],
  },
]

export function SnapshotTreeContent() {
  const allIds = PLACEHOLDER_SNAPSHOTS.flatMap((s) => [
    s.id,
    ...(s.children?.map((c) => c.id) ?? []),
  ])

  return (
    <TreeProvider defaultExpandedIds={allIds} selectable={false}>
      <div className="flex h-full flex-col">
        <TreeView className="pl-0 rounded-lg m-2 -ml-[5px] h-full overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PLACEHOLDER_SNAPSHOTS.map((snapshot, idx) => {
            const isLast = idx === PLACEHOLDER_SNAPSHOTS.length - 1
            return (
              <TreeNode key={snapshot.id} isLast={isLast} nodeId={snapshot.id}>
                <TreeNodeTrigger>
                  <TreeExpander hasChildren={!!snapshot.children?.length} />
                  <TreeIcon icon={<Server className="h-4 w-4" />} />
                  <TreeLabel className="whitespace-normal break-words">{snapshot.label}</TreeLabel>
                </TreeNodeTrigger>
                <TreeNodeContent hasChildren={!!snapshot.children?.length}>
                  {snapshot.children?.map((child, childIdx) => {
                    const isLastChild = childIdx === (snapshot.children?.length ?? 0) - 1
                    return (
                      <TreeNode key={child.id} isLast={isLastChild} level={1} nodeId={child.id}>
                        <TreeNodeTrigger>
                          <TreeIcon icon={<Database className="h-4 w-4" />} />
                          <TreeLabel className="whitespace-normal break-words">{child.label}</TreeLabel>
                        </TreeNodeTrigger>
                      </TreeNode>
                    )
                  })}
                </TreeNodeContent>
              </TreeNode>
            )
          })}
        </TreeView>
      </div>
    </TreeProvider>
  )
}
