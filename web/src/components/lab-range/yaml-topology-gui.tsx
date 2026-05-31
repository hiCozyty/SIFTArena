import { useState } from "react"
import { Undo, Save } from "lucide-react"
import { cn } from "@/lib/utils"
import { TabsFancy, type Category, type Item, type DeploymentStatus } from "@/components/ui/tabs-fancy"
import { VmTopology } from "@/components/lab-range/vm-topology"
import { TemplateTreeContent } from "@/components/lab-range/template-tree-content"
import { RangeTreeContent } from "@/components/lab-range/range-tree-content"
import { SnapshotListContent } from "@/components/lab-range/snapshot-list-content"
import { LeftPanelTabs } from "@/components/lab-range/left-panel-tabs"

type SaveStatus = "idle" | "success" | "no-changes"

type YamlTopologyGuiProps = {
  items?: Item[]
  className?: string
  cpuUsage?: string
  memoryUsage?: string
  deploymentStatus?: DeploymentStatus
  isDeploying?: boolean
  yamlContent?: string
  onYamlChange?: (yaml: string) => void
  onSave?: () => void
  onRevert?: () => void
  onReset?: () => void
  onDeploy?: () => void
  saveDisabled?: boolean
  yamlErrors?: string[]
  yamlLoading?: boolean
  saveStatus?: SaveStatus
  revertStatus?: "idle" | "success"
  templateItems?: { id: number; label: string; subText: string; icon: string }[]
}

function YamlCodeEditor({
  yamlContent,
  onYamlChange,
  onSave,
  onRevert,
  saveDisabled,
  yamlErrors,
  yamlLoading,
  saveStatus,
  revertStatus,
  isDeploying,
}: {
  yamlContent?: string
  onYamlChange?: (yaml: string) => void
  onSave?: () => void
  onRevert?: () => void
  saveDisabled?: boolean
  yamlErrors?: string[]
  yamlLoading?: boolean
  saveStatus?: SaveStatus
  revertStatus?: "idle" | "success"
  isDeploying?: boolean
}) {
  if (yamlLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading configuration...</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex flex-1">
        <textarea
          className="flex-1 resize-none bg-muted p-4 font-mono text-sm text-foreground placeholder-muted-foreground focus:outline-none"
          value={yamlContent ?? ""}
          onChange={(e) => onYamlChange?.(e.target.value)}
          placeholder="# Lab range configuration will appear here"
          spellCheck={false}
        />
        <div className="absolute bottom-3 right-3 z-10 flex flex-col items-end gap-1.5">
          <button
            onClick={onSave}
            disabled={!onSave || saveDisabled || isDeploying}
            className="group flex items-center gap-1.5 rounded-full bg-muted-foreground/10 p-2 text-xs text-muted-foreground backdrop-blur-sm transition-all hover:bg-muted-foreground/20 hover:text-foreground disabled:opacity-40"
          >
            <Save className="size-4 shrink-0" />
            <span className="hidden group-hover:inline">Save</span>
          </button>
          <button
            onClick={onRevert}
            disabled={isDeploying}
            className="group flex items-center gap-1.5 rounded-full bg-muted-foreground/10 p-2 text-xs text-muted-foreground backdrop-blur-sm transition-all hover:bg-muted-foreground/20 hover:text-foreground active:translate-y-px disabled:opacity-40"
          >
            <Undo className="size-4 shrink-0" />
            <span className="hidden group-hover:inline">Revert</span>
          </button>
        </div>
      </div>
      {yamlErrors && yamlErrors.length > 0 && (
        <div className="border-t border-red-500/30 bg-red-950/30 px-4 py-2">
          {yamlErrors.map((err, i) => (
            <p key={i} className="text-xs text-red-400">{err}</p>
          ))}
        </div>
      )}
      {saveStatus === "success" && (
        <div className="border-t border-emerald-500/30 bg-emerald-950/30 px-4 py-2">
          <p className="text-xs text-emerald-400">✓ Draft saved</p>
        </div>
      )}
      {saveStatus === "no-changes" && (
        <div className="border-t border-emerald-500/30 bg-emerald-950/30 px-4 py-2">
          <p className="text-xs text-emerald-400">✓ No changes to save</p>
        </div>
      )}
      {revertStatus === "success" && (
        <div className="border-t border-emerald-500/30 bg-emerald-950/30 px-4 py-2">
          <p className="text-xs text-emerald-400">✓ Reverted to server version</p>
        </div>
      )}
    </div>
  )
}

export function YamlTopologyGui({
  items = [],
  className,
  cpuUsage,
  memoryUsage,
  deploymentStatus,
  isDeploying,
  yamlContent,
  onYamlChange,
  onSave,
  onRevert,
  onReset,
  onDeploy,
  saveDisabled,
  yamlErrors,
  yamlLoading,
  saveStatus,
  revertStatus,
  templateItems = [],
}: YamlTopologyGuiProps) {
  const [activeLeftTab, setActiveLeftTab] = useState<"templates" | "range" | "snapshots">("range")

  const leftPanelTabs: Category[] = [
    {
      id: "templates",
      label: "Templates",
      content: <TemplateTreeContent items={templateItems} />,
    },
    {
      id: "range",
      label: "Range",
      content: <RangeTreeContent />,
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
      content: (
        <YamlCodeEditor
          yamlContent={yamlContent}
          onYamlChange={onYamlChange}
          onSave={onSave}
          onRevert={onRevert}
          saveDisabled={saveDisabled}
          yamlErrors={yamlErrors}
          yamlLoading={yamlLoading}
          saveStatus={saveStatus}
          revertStatus={revertStatus}
          isDeploying={isDeploying}
        />
      ),
    },
    {
      id: "topology",
      label: "Topology",
      content: <VmTopology yamlContent={yamlContent} />,
    },
  ]

  const showSnapshotPlaceholder = activeLeftTab === "snapshots"

  return (
    <div className={cn("flex flex-row gap-6 h-full min-h-0", className)}>
      <LeftPanelTabs
        tabs={leftPanelTabs}
        className="w-56 shrink-0"
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