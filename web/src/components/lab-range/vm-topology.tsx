import {
  ReactFlow,
  Handle,
  Position,
  type NodeProps,
  type Node,
  type Edge,
  Background,
  BackgroundVariant,
  Controls,
} from "@xyflow/react"
import { useState, useEffect, useMemo } from "react"
import "@xyflow/react/dist/base.css"
import yaml from "js-yaml"

type VmNode = {
  label: string
  ip: string
  poweredOn: boolean
}

function VmNode({ data }: NodeProps) {
  const { label, ip, poweredOn } = data as VmNode
  const statusColor = poweredOn ? "text-emerald-600" : "text-red-600"

  return (
    <div className="flex flex-col gap-1.5 rounded-4xl border bg-card px-3 py-2.5 text-sm shadow-xs min-w-[150px]">
      <Handle type="target" position={Position.Top} className="!bg-border" />
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground truncate">{label}</span>
        <span className={`shrink-0 text-xs font-medium ${statusColor}`}>
          {poweredOn ? "On" : "Off"}
        </span>
      </div>
      <span className="text-xs text-muted-foreground font-mono">{ip}</span>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-border"
      />
    </div>
  )
}

const nodeTypes = { vmNode: VmNode }

function cleanLabel(raw: string): string {
  return raw.replace(/^\{\{\s*range_id\s*\}\}-/, "")
}

function parseTopology(yamlContent: string): { nodes: Node[]; edges: Edge[] } | null {
  try {
    const parsed = yaml.load(yamlContent) as Record<string, unknown> | undefined
    if (!parsed || typeof parsed !== "object") return null

    const ludusVMs = Array.isArray(parsed.ludus) ? (parsed.ludus as Record<string, unknown>[]) : []
    const router = parsed.router && typeof parsed.router === "object" ? (parsed.router as Record<string, unknown>) : null

    const nodeSpacing = 220
    const yRouter = 0
    const yVM = 180

    const nodes: Node[] = []
    const edges: Edge[] = []

    if (router) {
      const label = cleanLabel(String(router.hostname || router.vm_name || "Router"))
      nodes.push({
        id: "router",
        type: "vmNode",
        position: { x: 200, y: yRouter },
        data: { label, ip: "10.1.0.0/16", poweredOn: true },
      })
    }

    if (ludusVMs.length > 0) {
      const totalWidth = (ludusVMs.length - 1) * nodeSpacing
      ludusVMs.forEach((vm, idx) => {
        const label = cleanLabel(String(vm.hostname || vm.vm_name || `VM ${idx + 1}`))
        const vlan = Number(vm.vlan)
        const ipLastOctet = Number(vm.ip_last_octet)
        const ip = vlan && ipLastOctet ? `10.1.${vlan}.${ipLastOctet}` : "—"
        const x = 200 - totalWidth / 2 + idx * nodeSpacing
        nodes.push({
          id: `ludus-${idx}`,
          type: "vmNode",
          position: { x, y: yVM },
          data: { label, ip, poweredOn: true },
        })
        if (router) {
          edges.push({
            id: `e-router-ludus-${idx}`,
            source: "router",
            target: `ludus-${idx}`,
          })
        }
      })
    }

    return { nodes, edges }
  } catch {
    return null
  }
}

export function VmTopology({ yamlContent }: { yamlContent?: string }) {
  const parsed = useMemo(() => {
    if (!yamlContent) return null
    return parseTopology(yamlContent)
  }, [yamlContent])

  const [lastValid, setLastValid] = useState<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] })

  useEffect(() => {
    if (parsed) setLastValid(parsed)
  }, [parsed])

  const nodes = parsed?.nodes ?? lastValid.nodes
  const edges = parsed?.edges ?? lastValid.edges

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.5}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} showFitView={false} className="!m-3" />
      </ReactFlow>
    </div>
  )
}
