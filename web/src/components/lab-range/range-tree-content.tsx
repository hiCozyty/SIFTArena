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
import { Button } from "@/components/ui/button"

type RangeNode = {
  id: string
  label: string
  icon?: React.ReactNode
  children?: RangeNode[]
}

function buildTreeFromVmDefs(
  vmDefs: Record<string, Record<string, unknown>> | null,
  enrichedVmDefs: Record<string, Record<string, unknown>> | null,
  nonDeployedVms: Record<string, Record<string, unknown>> | null,
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

  const nonDeployedChildren: RangeNode[] = []
  const allNonDeployed = nonDeployedVms ?? {}
  for (const [key, def] of Object.entries(allNonDeployed)) {
    const parsed = (def as { parsed: Record<string, unknown>; raw: string }).parsed
    const label = (parsed.hostname as string) || key
    nonDeployedChildren.push({
      id: `non-deployed-${key}`,
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
      children: nonDeployedChildren,
    },
  ]
}

export function RangeTreeContent({
  vmDefs,
  enrichedVmDefs,
  nonDeployedVms,
  onNodeSelect,
  onWriteVmConf,
  onAddVmConf,
  isConfigTabActive,
  selectedNode,
}: {
  vmDefs?: Record<string, Record<string, unknown>> | null
  enrichedVmDefs?: Record<string, Record<string, unknown>> | null
  nonDeployedVms?: Record<string, Record<string, unknown>> | null
  onNodeSelect?: (nodeId: string | null) => void
  onWriteVmConf?: () => void
  onAddVmConf?: () => void
  isConfigTabActive?: boolean
  selectedNode?: string | null
}) {
  const treeData = buildTreeFromVmDefs(vmDefs ?? null, enrichedVmDefs ?? null, nonDeployedVms ?? null)

  return (
    <TreeProvider defaultExpandedIds={treeData.flatMap((n) => [n.id, ...(n.children?.map((c) => c.id) ?? [])])} selectedIds={selectedNode ? [selectedNode] : []} onSelectionChange={(ids) => { if (onNodeSelect) onNodeSelect(ids.length > 0 ? ids[0] : null) }} className="h-full">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg">
        <div className="flex-1 min-h-0 overflow-clip">
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
        <div className="p-3 flex flex-col gap-2">
          <Button className="w-full" onClick={onWriteVmConf}>Write VM Conf</Button>
          <Button className="w-full" onClick={onAddVmConf} disabled={!isConfigTabActive}>Add VM Conf</Button>
        </div>
      </div>
    </TreeProvider>
  )
}
