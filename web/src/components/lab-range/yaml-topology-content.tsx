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
  enrichedVmDefs?: Record<string, Record<string, unknown>> | null
  nonDeployedVms?: Record<string, { id: string; parsed: Record<string, unknown>; raw: string }>
  deployedCustomVms?: Record<string, { id: string; parsed: Record<string, unknown>; raw: string }>
  deployingVmHostname?: string | null
  onCreateVmConfig?: (hostname: string, config: string, parsedConfig: Record<string, unknown>) => Promise<{ id: string } | { error: string }>
  onDeleteVmConfig?: (id: string, hostname: string) => Promise<{ success: boolean } | { error: string }>
  onDeleteRunningVm?: (vmName: string) => Promise<{ deleted: string } | { error: string }>
  onReset?: () => void
  onSingleDeploy?: (vmConfig: { hostname: string; yaml: string }) => void
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
