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
import type { SnapshotInfo } from "@/components/lab-range/use-lab-range-state"

type SnapshotNode = {
  id: string
  label: string
  children?: SnapshotNode[]
}

function buildSnapshotTree(vmName: string, snapshots: { name: string; parent?: string }[]): SnapshotNode[] {
  const filtered = snapshots.filter(s => s.name !== "current")

  const nodeMap = new Map<string, SnapshotNode>()

  for (const s of filtered) {
    nodeMap.set(s.name, {
      id: `${vmName}::${s.name}`,
      label: s.name,
      children: [],
    })
  }

  const roots: SnapshotNode[] = []
  for (const s of filtered) {
    const node = nodeMap.get(s.name)!
    if (s.parent && nodeMap.has(s.parent)) {
      nodeMap.get(s.parent)!.children!.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

function SnapshotNodeTree({ node, isLast, level = 0 }: { node: SnapshotNode; isLast: boolean; level?: number }) {
  const hasChildren = !!node.children?.length

  return (
    <TreeNode isLast={isLast} level={level} nodeId={node.id}>
      <TreeNodeTrigger>
        <TreeExpander hasChildren={hasChildren} />
        <TreeIcon icon={level === 0 ? <Server className="h-4 w-4" /> : <Database className="h-4 w-4" />} />
        <TreeLabel className="whitespace-normal break-words">{node.label}</TreeLabel>
      </TreeNodeTrigger>
      {hasChildren && (
        <TreeNodeContent hasChildren>
          {node.children!.map((child, idx) => (
            <SnapshotNodeTree
              key={child.id}
              node={child}
              isLast={idx === node.children!.length - 1}
              level={level + 1}
            />
          ))}
        </TreeNodeContent>
      )}
    </TreeNode>
  )
}

export function SnapshotTreeContent({ snapshotData, selectedIds, onSelectionChange }: { snapshotData: Record<string, SnapshotInfo>; selectedIds?: string[]; onSelectionChange?: (selectedIds: string[]) => void }) {
  const vmNodes: SnapshotNode[] = []
  const allIds: string[] = []

  for (const [vmName, info] of Object.entries(snapshotData)) {
    const vmId = vmName
    const snapNodes = buildSnapshotTree(vmName, info.snapshots)
    allIds.push(vmId)

    if (snapNodes.length > 0) {
      for (const n of snapNodes) {
        const collectIds = (node: SnapshotNode) => {
          allIds.push(node.id)
          node.children?.forEach(collectIds)
        }
        collectIds(n)
      }
    }

    vmNodes.push({
      id: vmId,
      label: vmName,
      children: snapNodes,
    })
  }

  return (
    <TreeProvider defaultExpandedIds={allIds} selectable={true} selectedIds={selectedIds} onSelectionChange={onSelectionChange} className="h-full" collapseDisabled noDeselect>
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg">
        <div className="flex-1 min-h-0 overflow-clip">
          <TreeView className="p-0 h-full overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {vmNodes.map((vmNode, idx) => (
              <SnapshotNodeTree
                key={vmNode.id}
                node={vmNode}
                isLast={idx === vmNodes.length - 1}
              />
            ))}
          </TreeView>
        </div>
      </div>
    </TreeProvider>
  )
}
