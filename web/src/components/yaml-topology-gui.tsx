import { Undo, Save } from "lucide-react"
import { cn } from "@/lib/utils"
import { TabsFancy, type Category, type Item } from "@/components/ui/tabs-fancy"
import { VmTopology } from "@/components/vm-topology"
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"

type YamlTopologyGuiProps = {
  items?: Item[]
  className?: string
  cpuUsage?: string
  memoryUsage?: string
  deploymentStatus?: string
  yamlContent?: string
  onYamlChange?: (yaml: string) => void
  onSave?: () => void
  onRevert?: () => void
  saveDisabled?: boolean
  yamlErrors?: string[]
  yamlLoading?: boolean
  saveStatus?: "idle" | "saving" | "success"
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
}: {
  yamlContent?: string
  onYamlChange?: (yaml: string) => void
  onSave?: () => void
  onRevert?: () => void
  saveDisabled?: boolean
  yamlErrors?: string[]
  yamlLoading?: boolean
  saveStatus?: "idle" | "saving" | "success"
  revertStatus?: "idle" | "success"
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
          className="flex-1 resize-none bg-[#0d1117] p-4 font-mono text-sm text-[#e6edf3] placeholder-[#484f58] focus:outline-none"
          value={yamlContent ?? ""}
          onChange={(e) => onYamlChange?.(e.target.value)}
          placeholder="# Lab range configuration will appear here"
          spellCheck={false}
        />
        <div className="absolute bottom-3 right-3 z-10 flex flex-col items-end gap-1.5">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                disabled={!onSave || saveDisabled}
                className="group flex items-center gap-1.5 rounded-full bg-white/10 p-2 text-xs text-white/70 backdrop-blur-sm transition-all hover:bg-white/20 hover:text-white disabled:opacity-40"
              >
                <Save className="size-4 shrink-0" />
                <span className="hidden group-hover:inline">Save</span>
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Save Configuration</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to make the changes?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onSave?.()}>Save</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <button
            onClick={onRevert}
            className="group flex items-center gap-1.5 rounded-full bg-white/10 p-2 text-xs text-white/70 backdrop-blur-sm transition-all hover:bg-white/20 hover:text-white active:translate-y-px"
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
          <p className="text-xs text-emerald-400">✓ Successfully saved</p>
        </div>
      )}
      {revertStatus === "success" && (
        <div className="border-t border-emerald-500/30 bg-emerald-950/30 px-4 py-2">
          <p className="text-xs text-emerald-400">✓ Reverted to last saved</p>
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
  yamlContent,
  onYamlChange,
  onSave,
  onRevert,
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
        />
      ),
    },
    {
      id: "topology",
      label: "Topology",
      content: <VmTopology />,
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
    />
  )
}

export function YamlTopologySkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("w-full animate-pulse", className)}>
      <div className="flex flex-row gap-6 rounded-xl overflow-hidden h-full min-h-0">
        <div className="w-56 flex flex-col gap-3 rounded-xl bg-muted/30 p-3 min-h-0 overflow-hidden">
          <div className="h-9 w-full bg-muted-foreground/10 rounded-lg" />
          <div className="flex-1 flex flex-col gap-0.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center w-full px-3 py-2 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="size-5 rounded bg-muted-foreground/10" />
                  <div className="flex flex-col gap-1.5">
                    <div className="h-3.5 w-20 bg-muted-foreground/10 rounded" />
                    {i % 2 === 0 && <div className="h-2.5 w-14 bg-muted-foreground/10 rounded" />}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="h-8 w-full bg-muted-foreground/10 rounded-lg" />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="shrink-0 flex items-center justify-between min-h-[40px] px-1">
            <div className="flex items-center gap-6">
              <div className="flex flex-col gap-1">
                <div className="h-2 w-14 bg-muted-foreground/10 rounded" />
                <div className="h-3 w-20 bg-muted-foreground/10 rounded" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="h-2 w-16 bg-muted-foreground/10 rounded" />
                <div className="h-3 w-20 bg-muted-foreground/10 rounded" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="h-2 w-10 bg-muted-foreground/10 rounded" />
                <div className="h-3 w-14 bg-muted-foreground/10 rounded" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-8 w-16 bg-muted-foreground/10 rounded-4xl" />
              <div className="h-8 w-20 bg-muted-foreground/10 rounded-4xl" />
              <div className="h-8 w-20 bg-muted-foreground/10 rounded-4xl" />
            </div>
          </div>
          <div className="flex-1 rounded-xl bg-card border shadow-sm overflow-hidden p-1">
            <div className="h-full bg-muted-foreground/10 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  )
}
