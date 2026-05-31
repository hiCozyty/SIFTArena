import { useState, useMemo } from "react"
import { FilePen } from "lucide-react"
import { cn } from "@/lib/utils"
import { vmDefsToYaml } from "@/lib/json2yaml"
import yaml from "js-yaml"
import { TabsFancy, type Category, type Item, type DeploymentStatus } from "@/components/ui/tabs-fancy"
import { VmTopology } from "@/components/lab-range/vm-topology"
import { TemplateTreeContent } from "@/components/lab-range/template-tree-content"
import { RangeTreeContent } from "@/components/lab-range/range-tree-content"
import { SnapshotListContent } from "@/components/lab-range/snapshot-list-content"
import { LeftPanelTabs } from "@/components/lab-range/left-panel-tabs"

type YamlTopologyGuiProps = {
  items?: Item[]
  className?: string
  cpuUsage?: string
  memoryUsage?: string
  deploymentStatus?: DeploymentStatus
  isDeploying?: boolean
  vmDefs?: Record<string, Record<string, unknown>> | null
  enrichedVmDefs?: Record<string, Record<string, unknown>> | null
  onReset?: () => void
  onDeploy?: () => void
  templateItems?: { id: number; label: string; subText: string; icon: string }[]
}

export function YamlTopologyGui({
  items = [],
  className,
  cpuUsage,
  memoryUsage,
  deploymentStatus,
  isDeploying,
  vmDefs,
  enrichedVmDefs,
  onReset,
  onDeploy,
  templateItems = [],
}: YamlTopologyGuiProps) {
  const [activeLeftTab, setActiveLeftTab] = useState<"templates" | "range" | "snapshots">("range")
  const [selectedRangeNode, setSelectedRangeNode] = useState<string | null>(null)
  const [activeRightTab, setActiveRightTab] = useState<string>("topology")
  const [customVmConfig, setCustomVmConfig] = useState<string>("#please write your single vm config here\n")
  const [isCustomVmMode, setIsCustomVmMode] = useState(false)
  const [addVmError, setAddVmError] = useState<string | null>(null)
  const [addVmSuccess, setAddVmSuccess] = useState(false)
  const [nonDeployedVms, setNonDeployedVms] = useState<Record<string, { parsed: Record<string, unknown>; raw: string }>>({})
  const [proofreadState, setProofreadState] = useState(false)
  const [proofreadError, setProofreadError] = useState<string | null>(null)
  const [alerts, setAlerts] = useState<{ id: number; type: "error" | "success"; message: string }[]>([])

  const addAlert = (type: "error" | "success", message: string) => {
    const id = Date.now()
    setAlerts((prev) => [...prev, { id, type, message }])
    setTimeout(() => setAlerts((prev) => prev.filter((a) => a.id !== id)), 5000)
  }

  const builtTemplateNames = useMemo(
    () => templateItems.filter((t) => t.subText === "Built").map((t) => t.label),
    [templateItems],
  )

  const existingIps = useMemo(() => {
    const ips = new Set<number>()
    const sources: (Record<string, Record<string, unknown>> | Record<string, { parsed: Record<string, unknown>; raw: string }> | null)[] = [enrichedVmDefs, nonDeployedVms]
    for (const source of sources) {
      if (!source) continue
      const entries = Object.values(source)
      for (const entry of entries) {
        const vmDef = "parsed" in entry ? (entry as { parsed: Record<string, unknown> }).parsed : (entry as Record<string, unknown>)
        const octet = vmDef.ip_last_octet
        if (typeof octet === "number") ips.add(octet)
      }
    }
    return ips
  }, [enrichedVmDefs, nonDeployedVms])

  const existingHostnames = useMemo(() => {
    const hostnames = new Set<string>()
    const sources: (Record<string, Record<string, unknown>> | Record<string, { parsed: Record<string, unknown>; raw: string }> | null)[] = [enrichedVmDefs, nonDeployedVms]
    for (const source of sources) {
      if (!source) continue
      const entries = Object.values(source)
      for (const entry of entries) {
        const vmDef = "parsed" in entry ? (entry as { parsed: Record<string, unknown> }).parsed : (entry as Record<string, unknown>)
        const hostname = vmDef.hostname
        if (typeof hostname === "string") hostnames.add(hostname.toLowerCase())
      }
    }
    return hostnames
  }, [enrichedVmDefs, nonDeployedVms])

  const validateVmConfig = (raw: string): { valid: boolean; error: string | null; vmDef?: Record<string, unknown> } => {
    try {
      const parsed = yaml.load(raw) as Record<string, unknown> | null
      if (!parsed || typeof parsed !== "object") {
        return { valid: false, error: "Invalid YAML config" }
      }

      if (!parsed.ludus || !Array.isArray(parsed.ludus) || parsed.ludus.length === 0) {
        return { valid: false, error: "Missing ludus: array at top level" }
      }

      const vmDef = parsed.ludus[0]
      if (!vmDef || typeof vmDef !== "object") {
        return { valid: false, error: "Invalid ludus entry: must be an object" }
      }

      const def = vmDef as Record<string, unknown>

      if (!def.windows || typeof def.windows !== "object") {
        return { valid: false, error: "Missing windows: section (required for Windows VMs)" }
      }

      const hostname = def.hostname
      if (typeof hostname !== "string" || hostname.trim() === "") {
        return { valid: false, error: "Missing or empty hostname" }
      }

      const vmName = def.vm_name
      const expectedVmName = "{{ range_id }}-" + hostname
      if (vmName !== expectedVmName) {
        return { valid: false, error: `vm_name must be "${expectedVmName}"` }
      }

      const template = def.template
      if (typeof template !== "string") {
        return { valid: false, error: "Missing template" }
      }
      if (!builtTemplateNames.includes(template)) {
        return { valid: false, error: `Template "${template}" is not built` }
      }

      const vlan = def.vlan
      if (vlan !== 99) {
        return { valid: false, error: "vlan must be 99" }
      }

      const ipLastOctet = def.ip_last_octet
      if (typeof ipLastOctet !== "number") {
        return { valid: false, error: "ip_last_octet must be a number" }
      }
      if (existingIps.has(ipLastOctet)) {
        return { valid: false, error: `ip_last_octet ${ipLastOctet} is already in use` }
      }

      if (existingHostnames.has(hostname.toLowerCase())) {
        return { valid: false, error: `Hostname "${hostname}" is already in use` }
      }

      const ramGb = def.ram_gb
      if (typeof ramGb !== "number") {
        return { valid: false, error: "ram_gb must be a number" }
      }

      const cpus = def.cpus
      if (typeof cpus !== "number") {
        return { valid: false, error: "cpus must be a number" }
      }

      return { valid: true, error: null, vmDef: def }
    } catch {
      return { valid: false, error: "Failed to parse YAML" }
    }
  }

  const yamlText = useMemo(() => (vmDefs ? "# default\n" + vmDefsToYaml(vmDefs) : ""), [vmDefs])
  const enrichedYaml = useMemo(() => (enrichedVmDefs ? "# enriched\n" + vmDefsToYaml(enrichedVmDefs) : ""), [enrichedVmDefs])

  const handleWriteVmConf = () => {
    setSelectedRangeNode(null)
    setIsCustomVmMode(true)
    setActiveRightTab("yaml")
    setActiveLeftTab("range")
  }

  const handleAddVmConf = () => {
    setAddVmError(null)
    setAddVmSuccess(false)
    if (!proofreadState) {
      addAlert("error", "Please proofread using the button on the bottom right")
      return
    }
    try {
      const result = validateVmConfig(customVmConfig)
      if (!result.valid || !result.vmDef) {
        addAlert("error", result.error || "Validation failed")
        return
      }
      const hostname = result.vmDef.hostname as string
      const key = hostname.toLowerCase().replace(/[^a-z0-9-]/g, "-")
      const rawConfig = customVmConfig.replace(/^#please write your single vm config here\n?/m, "").trimStart()
      setNonDeployedVms((prev) => ({ ...prev, [key]: { parsed: result.vmDef!, raw: rawConfig || customVmConfig } }))
      addAlert("success", "✓ VM added to Non Deployed VMs")
      setAddVmSuccess(true)
      setProofreadState(false)
      setProofreadError(null)
      setCustomVmConfig("#please write your single vm config here\n")
    } catch {
      addAlert("error", "Failed to parse YAML")
    }
  }

  const handleNodeSelect = (nodeId: string | null) => {
    setIsCustomVmMode(false)
    setSelectedRangeNode(nodeId)
  }

  const resetCustomVmConfig = () => {
    setCustomVmConfig("#please write your single vm config here\n")
  }

  const leftPanelTabs: Category[] = [
    {
      id: "templates",
      label: "Templates",
      content: <TemplateTreeContent items={templateItems} />,
    },
    {
      id: "range",
      label: "Range",
        content: <RangeTreeContent vmDefs={vmDefs} enrichedVmDefs={enrichedVmDefs} nonDeployedVms={nonDeployedVms} selectedNode={selectedRangeNode} onNodeSelect={handleNodeSelect} onWriteVmConf={handleWriteVmConf} onAddVmConf={handleAddVmConf} isConfigTabActive={activeRightTab === "yaml"} />,
    },
    {
      id: "snapshots",
      label: "Snapshots",
      content: <SnapshotListContent />,
    },
  ]

  const rightPanelCategories: Category[] = [
    {
      id: "yaml",
      label: "config.yaml",
      content: isCustomVmMode ? (
        <div className="flex h-full flex-col">
          <div className="relative flex-1 min-h-0">
            <textarea
              className="h-full w-full resize-none bg-muted p-4 font-mono text-sm text-foreground placeholder-muted-foreground focus:outline-none"
              value={customVmConfig}
              onChange={(e) => {
                setCustomVmConfig(e.target.value)
                setProofreadState(false)
                setProofreadError(null)
              }}
              spellCheck={false}
            />
            <div className="absolute bottom-3 right-3 z-10 flex flex-col items-end gap-1.5">
              <button
                className={cn(
                  "group flex items-center gap-1.5 rounded-full bg-white/10 p-2 text-xs backdrop-blur-sm transition-all hover:bg-white/20",
                  proofreadState ? "text-emerald-400" : "text-white/70 hover:text-white",
                )}
                onClick={() => {
                  const result = validateVmConfig(customVmConfig)
                  setProofreadState(result.valid)
                  setProofreadError(result.error)
                  if (result.valid) {
                    addAlert("success", "✓ Proofread passed")
                  }
                }}
              >
                <FilePen className="size-4 shrink-0" />
                <span className="hidden group-hover:inline">Proofread</span>
              </button>
            </div>
          </div>
          {proofreadError && (
            <div className="border-t border-red-500/30 bg-red-950/30 px-4 py-2">
              <p className="text-xs text-red-400">{proofreadError}</p>
            </div>
          )}
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={cn(
                "border-t px-4 py-2",
                alert.type === "error"
                  ? "border-red-500/30 bg-red-950/30"
                  : "border-emerald-500/30 bg-emerald-950/30",
              )}
            >
              <p className={cn("text-xs", alert.type === "error" ? "text-red-400" : "text-emerald-400")}>
                {alert.message}
              </p>
            </div>
          ))}
        </div>
      ) : (() => {
        return selectedRangeNode === "deployed" ? (
          <textarea
            className="h-full w-full resize-none bg-muted p-4 font-mono text-sm text-foreground placeholder-muted-foreground focus:outline-none"
            value={enrichedYaml}
            readOnly
            placeholder="No VM definitions available"
            spellCheck={false}
          />
      ) : selectedRangeNode === "non-deployed" || selectedRangeNode === null ? (
        <div className="h-full w-full flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Please click on a VM</p>
        </div>
      ) : selectedRangeNode.startsWith("non-deployed-") ? (
        <textarea
          className="h-full w-full resize-none bg-muted p-4 font-mono text-sm text-foreground placeholder-muted-foreground focus:outline-none"
          value={nonDeployedVms[selectedRangeNode.replace("non-deployed-", "")]?.raw ?? ""}
          readOnly
          placeholder="No VM definitions available"
          spellCheck={false}
        />
      ) : (
          <textarea
            className="h-full w-full resize-none bg-muted p-4 font-mono text-sm text-foreground placeholder-muted-foreground focus:outline-none"
            value={yamlText}
            readOnly
            placeholder="No VM definitions available"
            spellCheck={false}
          />
        )
      })(),
    },
    {
      id: "topology",
      label: "Topology",
      content: <VmTopology yamlContent={enrichedYaml} />,
    },
  ]

  const showSnapshotPlaceholder = activeLeftTab === "snapshots"

  return (
    <div className={cn("flex flex-row gap-6 h-full min-h-0", className)}>
      <LeftPanelTabs
        tabs={leftPanelTabs}
        className="w-56 shrink-0 h-full"
        activeTab={activeLeftTab}
        onTabChange={setActiveLeftTab}
      />
      {showSnapshotPlaceholder ? (
        <div className="flex-1 min-w-0 flex items-center justify-center rounded-4xl bg-muted border shadow-sm">
          <p className="text-sm text-muted-foreground">Snapshot management coming soon</p>
        </div>
      ) : (
        <TabsFancy
          categories={rightPanelCategories}
          defaultCategory="topology"
          activeCategory={activeRightTab}
          onCategoryChange={setActiveRightTab}
          items={items}
          className="flex-1 min-w-0"
          cpuUsage={cpuUsage}
          memoryUsage={memoryUsage}
          deploymentStatus={deploymentStatus}
          isDeploying={isDeploying}
          onReset={onReset}
          onDeploy={onDeploy}
          hideSidebar
        />
      )}
    </div>
  )
}

export function YamlTopologySkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-row gap-6 h-full min-h-0", className)}>
      <div className="w-56 shrink-0 flex flex-col rounded-4xl bg-muted p-3 min-h-0 overflow-hidden">
        <div className="h-8 w-full bg-muted-foreground/10 rounded-full" />
        <div className="flex-1 mt-3 flex flex-col gap-0.5 min-h-0 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center w-full px-3 py-2 rounded-4xl shrink-0">
              <div className="flex items-center gap-3">
                <div className="size-5 rounded bg-muted-foreground/10" />
                <div className="flex flex-col">
                  <div className="h-3.5 w-20 bg-muted-foreground/10 rounded" />
                  {i % 2 === 0 && <div className="h-2.5 w-14 bg-muted-foreground/10 rounded mt-1" />}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="h-8 w-full bg-muted-foreground/10 rounded-4xl mt-3" />
      </div>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="shrink-0 grid grid-cols-[1fr_auto_1fr] items-start gap-3 min-h-[40px] px-1">
          <div className="flex items-center gap-6">
            <div className="flex flex-col gap-0.5">
              <div className="h-2 w-6 bg-muted-foreground/10 rounded" />
              <div className="h-3 w-10 bg-muted-foreground/10 rounded" />
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="h-2 w-10 bg-muted-foreground/10 rounded" />
              <div className="h-3 w-8 bg-muted-foreground/10 rounded" />
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="h-2 w-8 bg-muted-foreground/10 rounded" />
              <div className="h-3 w-12 bg-muted-foreground/10 rounded" />
            </div>
          </div>
          <div className="h-8 w-44 bg-muted-foreground/10 rounded-full" />
          <div className="flex items-center gap-3 justify-self-end">
            <div className="h-8 w-16 bg-muted-foreground/10 rounded-4xl" />
            <div className="h-8 w-20 bg-muted-foreground/10 rounded-4xl" />
          </div>
        </div>
        <div className="flex-1 rounded-4xl bg-muted border shadow-sm overflow-hidden">
          <div className="h-full bg-muted-foreground/10 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
