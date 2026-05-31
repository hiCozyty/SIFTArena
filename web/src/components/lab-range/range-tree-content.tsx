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
import { Network, Monitor, Shield, Globe } from "lucide-react"

type RangeNode = {
  id: string
  label: string
  icon?: React.ReactNode
  children?: RangeNode[]
}

const PLACEHOLDER_RANGE: RangeNode[] = [
  {
    id: "network",
    label: "Network Infrastructure",
    icon: <Network className="h-4 w-4" />,
    children: [
      { id: "router", label: "router-debian11-x64", icon: <Globe className="h-4 w-4" /> },
      { id: "switch", label: "Core Switch", icon: <Network className="h-4 w-4" /> },
    ],
  },
  {
    id: "attackers",
    label: "Attacker VMs",
    icon: <Shield className="h-4 w-4" />,
    children: [
      { id: "kali", label: "attacker-kali", icon: <Monitor className="h-4 w-4" /> },
    ],
  },
  {
    id: "targets",
    label: "Target VMs",
    icon: <Monitor className="h-4 w-4" />,
    children: [
      { id: "win11", label: "win11-22h2", icon: <Monitor className="h-4 w-4" /> },
    ],
  },
]

export function RangeTreeContent() {
  const allIds = PLACEHOLDER_RANGE.flatMap((n) => [
    n.id,
    ...(n.children?.map((c) => c.id) ?? []),
  ])

  return (
    <TreeProvider defaultExpandedIds={allIds} selectable={false}>
      <div className="flex h-full flex-col">
        <div className="flex-1 min-h-0 border border-white/20 overflow-clip">
          <TreeView className="p-0 h-full overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PLACEHOLDER_RANGE.map((node, idx) => {
            const isLast = idx === PLACEHOLDER_RANGE.length - 1
            return (
              <TreeNode key={node.id} isLast={isLast} nodeId={node.id}>
                <TreeNodeTrigger>
                  <TreeExpander hasChildren={!!node.children?.length} />
                  <TreeIcon icon={node.icon} />
                  <TreeLabel className="whitespace-normal break-words">{node.label}</TreeLabel>
                </TreeNodeTrigger>
                <TreeNodeContent hasChildren={!!node.children?.length}>
                  {node.children?.map((child, childIdx) => {
                    const isLastChild = childIdx === (node.children?.length ?? 0) - 1
                    return (
                      <TreeNode key={child.id} isLast={isLastChild} level={1} nodeId={child.id}>
                        <TreeNodeTrigger>
                          <TreeIcon icon={child.icon} />
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
      </div>
    </TreeProvider>
  )
}
