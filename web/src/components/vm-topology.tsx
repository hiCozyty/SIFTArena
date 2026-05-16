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
import "@xyflow/react/dist/base.css"

type VmNode = {
  label: string
  ip: string
  status: "Healthy" | "Degraded" | "Unhealthy"
}

function VmNode({ data }: NodeProps) {
  const { label, ip, status } = data as VmNode
  const statusColor =
    status === "Healthy"
      ? "text-emerald-600"
      : status === "Degraded"
        ? "text-amber-600"
        : "text-red-600"

  return (
    <div className="flex flex-col gap-1.5 rounded-md border bg-card px-3 py-2.5 text-sm shadow-xs min-w-[150px]">
      <Handle type="target" position={Position.Top} className="!bg-border" />
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground truncate">{label}</span>
        <span className={`shrink-0 text-xs font-medium ${statusColor}`}>
          {status}
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

const defaultNodes: Node[] = [
  {
    id: "lb",
    type: "vmNode",
    position: { x: 200, y: 0 },
    data: { label: "Load Balancer", ip: "10.0.0.1", status: "Healthy" satisfies VmNode["status"] },
  },
  {
    id: "web-1",
    type: "vmNode",
    position: { x: 0, y: 150 },
    data: { label: "Web Server 01", ip: "10.0.1.10", status: "Healthy" satisfies VmNode["status"] },
  },
  {
    id: "web-2",
    type: "vmNode",
    position: { x: 200, y: 140 },
    data: { label: "Web Server 02", ip: "10.0.1.11", status: "Degraded" satisfies VmNode["status"] },
  },
  {
    id: "web-3",
    type: "vmNode",
    position: { x: 400, y: 150 },
    data: { label: "Web Server 03", ip: "10.0.1.12", status: "Healthy" satisfies VmNode["status"] },
  },
  {
    id: "auth",
    type: "vmNode",
    position: { x: 340, y: 290 },
    data: { label: "Auth Service", ip: "10.0.8.1", status: "Healthy" satisfies VmNode["status"] },
  },
  {
    id: "dns",
    type: "vmNode",
    position: { x: 120, y: 290 },
    data: { label: "DNS Resolver", ip: "10.0.7.1", status: "Healthy" satisfies VmNode["status"] },
  },
  {
    id: "mq",
    type: "vmNode",
    position: { x: 560, y: 290 },
    data: { label: "Message Queue", ip: "10.0.4.1", status: "Healthy" satisfies VmNode["status"] },
  },
  {
    id: "db-1",
    type: "vmNode",
    position: { x: 0, y: 430 },
    data: { label: "Database Primary", ip: "10.0.2.1", status: "Healthy" satisfies VmNode["status"] },
  },
  {
    id: "db-2",
    type: "vmNode",
    position: { x: 0, y: 540 },
    data: { label: "Database Replica", ip: "10.0.2.2", status: "Healthy" satisfies VmNode["status"] },
  },
  {
    id: "cache-1",
    type: "vmNode",
    position: { x: 200, y: 430 },
    data: { label: "Cache Cluster 01", ip: "10.0.3.1", status: "Healthy" satisfies VmNode["status"] },
  },
  {
    id: "cache-2",
    type: "vmNode",
    position: { x: 200, y: 540 },
    data: { label: "Cache Cluster 02", ip: "10.0.3.2", status: "Unhealthy" satisfies VmNode["status"] },
  },
  {
    id: "storage-1",
    type: "vmNode",
    position: { x: 400, y: 430 },
    data: { label: "Storage Node 01", ip: "10.0.5.1", status: "Healthy" satisfies VmNode["status"] },
  },
  {
    id: "storage-2",
    type: "vmNode",
    position: { x: 400, y: 540 },
    data: { label: "Storage Node 02", ip: "10.0.5.2", status: "Healthy" satisfies VmNode["status"] },
  },
  {
    id: "monitor",
    type: "vmNode",
    position: { x: 560, y: 430 },
    data: { label: "Monitoring Agent", ip: "10.0.6.1", status: "Healthy" satisfies VmNode["status"] },
  },
  {
    id: "log",
    type: "vmNode",
    position: { x: 560, y: 540 },
    data: { label: "Log Aggregator", ip: "10.0.6.2", status: "Degraded" satisfies VmNode["status"] },
  },
]

const defaultEdges: Edge[] = [
  { id: "e-lb-web1", source: "lb", target: "web-1" },
  { id: "e-lb-web2", source: "lb", target: "web-2" },
  { id: "e-lb-web3", source: "lb", target: "web-3" },
  { id: "e-web1-auth", source: "web-1", target: "auth" },
  { id: "e-web2-auth", source: "web-2", target: "auth" },
  { id: "e-web3-auth", source: "web-3", target: "auth" },
  { id: "e-auth-db", source: "auth", target: "db-1" },
  { id: "e-auth-cache", source: "auth", target: "cache-1" },
  { id: "e-auth-storage", source: "auth", target: "storage-1" },
  { id: "e-db1-db2", source: "db-1", target: "db-2" },
  { id: "e-cache1-cache2", source: "cache-1", target: "cache-2" },
  { id: "e-storage1-storage2", source: "storage-1", target: "storage-2" },
  { id: "e-web1-monitor", source: "web-1", target: "monitor" },
  { id: "e-monitor-log", source: "monitor", target: "log" },
]

export function VmTopology() {
  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={defaultNodes}
        edges={defaultEdges}
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
        <Controls showInteractive={false} showFitView={false} />
      </ReactFlow>
    </div>
  )
}
