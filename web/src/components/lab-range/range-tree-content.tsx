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
import { Monitor, FolderOpen } from "lucide-react"

type RangeNode = {
  id: string
  label: string
  icon?: React.ReactNode
  children?: RangeNode[]
}

function buildTreeFromVmDefs(
  vmDefs: Record<string, Record<string, unknown>> | null,
  enrichedVmDefs: Record<string, Record<string, unknown>> | null,
): RangeNode[] {
  const deployedChildren: RangeNode[] = []
  const allDefs = enrichedVmDefs ?? vmDefs ?? {}

  for (const [key, def] of Object.entries(allDefs)) {
    const label = (def.hostname as string) || key
    deployedChildren.push({
      id: key,
      label,
      icon: <Monitor className="h-4 w-4" />,
    })
  }

  return [
    {
      id: "deployed",
      label: "Deployed VMs",
      icon: <FolderOpen className="h-4 w-4" />,
      children: deployedChildren,
    },
    {
      id: "non-deployed",
      label: "Non Deployed VMs",
      icon: <FolderOpen className="h-4 w-4" />,
      children: [],
    },
  ]
}

export function RangeTreeContent({
  vmDefs,
  enrichedVmDefs,
}: {
  vmDefs?: Record<string, Record<string, unknown>> | null
  enrichedVmDefs?: Record<string, Record<string, unknown>> | null
}) {
  const treeData = buildTreeFromVmDefs(vmDefs ?? null, enrichedVmDefs ?? null)
  const allIds = treeData.flatMap((n) => [
    n.id,
    ...(n.children?.map((c) => c.id) ?? []),
  ])

  return (
    <TreeProvider defaultExpandedIds={allIds} selectable={false}>
      <div className="flex h-full flex-col">
        <div className="flex-1 min-h-0 border border-white/20 overflow-clip">
          <TreeView className="p-0 h-full overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {treeData.map((node, idx) => {
            const isLast = idx === treeData.length - 1
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
