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
import { Monitor, FolderOpen, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

type RangeNode = {
  id: string
  label: string
  icon?: React.ReactNode
  children?: RangeNode[]
}

function buildTreeFromVmDefs(
  vmDefs: Record<string, Record<string, unknown>> | null,
  deployedCustomVms: Record<string, Record<string, unknown>> | null,
  nonDeployedVms: Record<string, Record<string, unknown>> | null,
): RangeNode[] {
  const defaultChildren: RangeNode[] = []
  const allDefs = vmDefs ?? {}

  for (const [key, def] of Object.entries(allDefs)) {
    const label = (def.hostname as string) || key
    defaultChildren.push({
      id: `default-${key}`,
      label,
      icon: <Monitor className="h-4 w-4" />,
    })
  }

  const deployedCustomChildren: RangeNode[] = []
  const allDeployedCustom = deployedCustomVms ?? {}
  for (const [key, def] of Object.entries(allDeployedCustom)) {
    const parsed = (def as { parsed: Record<string, unknown>; raw: string }).parsed
    const label = (parsed.hostname as string) || key
    deployedCustomChildren.push({
      id: `deployed-custom-${key}`,
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
      id: "default-vms",
      label: "Default VMs",
      icon: <FolderOpen className="h-4 w-4" />,
      children: defaultChildren,
    },
    {
      id: "deployed-custom",
      label: "Deployed Custom VMs",
      icon: <FolderOpen className="h-4 w-4" />,
      children: deployedCustomChildren,
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
  deployedCustomVms,
  nonDeployedVms,
  deployingVmHostname,
  onNodeSelect,
  onWriteVmConf,
  onAddVmConf,
  onDeleteVm,
  isConfigTabActive,
  selectedNode,
}: {
  vmDefs?: Record<string, Record<string, unknown>> | null
  deployedCustomVms?: Record<string, Record<string, unknown>> | null
  nonDeployedVms?: Record<string, Record<string, unknown>> | null
  deployingVmHostname?: string | null
  onNodeSelect?: (nodeId: string | null) => void
  onWriteVmConf?: () => void
  onAddVmConf?: () => void
  onDeleteVm?: (key: string) => void
  isConfigTabActive?: boolean
  selectedNode?: string | null
}) {
  const treeData = buildTreeFromVmDefs(vmDefs ?? null, deployedCustomVms ?? null, nonDeployedVms ?? null)

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
                     const isDeletable = node.id === "deployed-custom" || node.id === "non-deployed"
                     const childKey = child.id.replace(`${node.id}-`, "")
                     const isDeploying = node.id === "non-deployed" && deployingVmHostname === childKey
                     return (
                       <TreeNode key={child.id} isLast={isLastChild} level={1} nodeId={child.id}>
                         <TreeNodeTrigger>
                           <TreeIcon icon={child.icon} />
                           <TreeLabel className="whitespace-normal break-words">{child.label}</TreeLabel>
                           {isDeploying && <Spinner variant="circle" className="size-3 shrink-0 animate-spin" />}
                           {isDeletable && onDeleteVm && (
                            <button
                              className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation()
                                onDeleteVm(childKey)
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
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
