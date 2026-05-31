import { useState, useMemo } from "react"
import { cn } from "@/lib/utils"
import { vmDefsToYaml } from "@/lib/json2yaml"
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

  const yamlText = useMemo(() => (vmDefs ? "# default\n" + vmDefsToYaml(vmDefs) : ""), [vmDefs])
  const enrichedYaml = useMemo(() => (enrichedVmDefs ? "# enriched\n" + vmDefsToYaml(enrichedVmDefs) : ""), [enrichedVmDefs])

  const handleWriteVmConf = () => {
    setSelectedRangeNode(null)
    setIsCustomVmMode(true)
    setActiveRightTab("yaml")
    setActiveLeftTab("range")
  }

  const handleAddVmConf = (name: string) => {
    console.log("Add VM Conf:", name)
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
      content: <RangeTreeContent vmDefs={vmDefs} enrichedVmDefs={enrichedVmDefs} onNodeSelect={handleNodeSelect} onWriteVmConf={handleWriteVmConf} onAddVmConf={handleAddVmConf} />,
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
        <textarea
          className="h-full w-full resize-none bg-muted p-4 font-mono text-sm text-foreground placeholder-muted-foreground focus:outline-none"
          value={customVmConfig}
          onChange={(e) => setCustomVmConfig(e.target.value)}
          spellCheck={false}
        />
      ) : selectedRangeNode === "non-deployed" || selectedRangeNode === null ? (
        <div className="h-full w-full flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Please click on a VM</p>
        </div>
      ) : (
        <textarea
          className="h-full w-full resize-none bg-muted p-4 font-mono text-sm text-foreground placeholder-muted-foreground focus:outline-none"
          value={selectedRangeNode === "deployed" ? enrichedYaml : yamlText}
          readOnly
          placeholder="No VM definitions available"
          spellCheck={false}
        />
      ),
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
