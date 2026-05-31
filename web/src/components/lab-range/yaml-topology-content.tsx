import { YamlTopologyGui, YamlTopologySkeleton } from "@/components/lab-range/yaml-topology-gui"
import type { DeploymentStatus } from "@/components/ui/tabs-fancy"
import type { TemplateItem } from "@/components/lab-range/use-lab-range-state"

interface YamlTopologyContentProps {
  ready: boolean
  className?: string
  cpuUsage?: string
  memoryUsage?: string
  deploymentStatus?: DeploymentStatus
  isDeploying?: boolean
  items?: TemplateItem[]
  vmDefs?: Record<string, Record<string, unknown>> | null
  onReset?: () => void
  onDeploy?: () => void
  templateItems?: TemplateItem[]
}

export function YamlTopologyContent({
  ready,
  className,
  ...guiProps
}: YamlTopologyContentProps) {
  if (!ready) {
    return <YamlTopologySkeleton className={className ?? "h-full w-full"} />
  }

  return (
    <YamlTopologyGui
      className={className ?? "h-full w-full"}
      {...guiProps}
    />
  )
}
