import { Undo, Save } from "lucide-react"
import { cn } from "@/lib/utils"
import { TabsFancy, type Category, type Item, type DeploymentStatus } from "@/components/ui/tabs-fancy"
import { VmTopology } from "@/components/vm-topology"

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
  onDeploy?: () => void
  onReset?: () => void
  saveDisabled?: boolean
  yamlErrors?: string[]
  yamlLoading?: boolean
  saveStatus?: SaveStatus
  revertStatus?: "idle" | "success"
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
  onDeploy,
  onReset,
  saveDisabled,
  yamlErrors,
  yamlLoading,
  saveStatus,
  revertStatus,
}: YamlTopologyGuiProps) {
  const categories: Category[] = [
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

  return (
    <TabsFancy
      categories={categories}
      items={items}
      className={className}
      cpuUsage={cpuUsage}
      memoryUsage={memoryUsage}
      deploymentStatus={deploymentStatus}
      isDeploying={isDeploying}
      onDeploy={onDeploy}
      onReset={onReset}
    />
  )
}

export function YamlTopologySkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("w-full animate-pulse", className)}>
      <div className="flex flex-row gap-6 rounded-4xl overflow-hidden h-full min-h-0">
        <div className="w-56 flex flex-col gap-3 rounded-4xl bg-muted p-3 min-h-0 overflow-hidden">
          <div className="flex-1 flex flex-col gap-0.5 min-h-[120px]">
            {Array.from({ length: 8 }).map((_, i) => (
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
          <div className="h-8 w-full bg-muted-foreground/10 rounded-4xl" />
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
    </div>
  )
}