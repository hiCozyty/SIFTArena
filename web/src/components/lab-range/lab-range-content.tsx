import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Loader2, Info } from "lucide-react"
import { ConnectionErrorContent, HealthErrorContent } from "@/components/lab-range/backend-gate"
import { LudusServerGuide } from "@/components/lab-range/ludus-server-guide"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { TabContentCard } from "@/components/shared-ui-primitives/tab-content-card"
import { useLabRangeState, REQUIRED_TEMPLATES } from "@/components/lab-range/use-lab-range-state"
import { TimelineContent } from "@/components/lab-range/timeline-content"
import { YamlTopologyContent } from "@/components/lab-range/yaml-topology-content"

export function LabRangeContent({
  onComplete,
}: {
  completed: boolean
  onComplete: () => void
}) {
  const state = useLabRangeState(onComplete)

  if (state.status.type === "idle" || state.status.type === "connecting") {
    return (
      <div className="flex min-h-[80vh] items-center justify-center">
        <Card className="w-full max-w-sm gap-2 py-4">
          <CardHeader>
            <CardTitle>Connecting to Backend</CardTitle>
            <CardDescription>
              Attempting to establish a connection to the backend server...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center py-4">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (state.status.type === "connection-error") {
    return (
      <>
        <div className="flex min-h-[80vh] items-center justify-center">
          <Card className="w-full max-w-sm gap-2 py-4">
            <CardHeader>
              <CardTitle>Connection Failed</CardTitle>
            </CardHeader>
            <CardContent>
              <ConnectionErrorContent
                onRetry={state.connect}
                onShowGuide={() => state.setShowGuide(true)}
              />
            </CardContent>
          </Card>
        </div>
        <LudusServerGuide open={state.showGuide} onOpenChange={state.setShowGuide} />
      </>
    )
  }

  if (state.status.type === "health-error") {
    return (
      <>
        <div className="flex min-h-[80vh] items-center justify-center">
          <Card className="w-full max-w-sm gap-2 py-4">
            <CardHeader>
              <CardTitle>Configuration Error</CardTitle>
            </CardHeader>
            <CardContent>
              <HealthErrorContent
                status={state.status.rawStatus}
                detail={state.status.detail}
                config={state.status.config}
                onRetry={state.connect}
                onShowGuide={() => state.setShowGuide(true)}
              />
            </CardContent>
          </Card>
        </div>
        <LudusServerGuide open={state.showGuide} onOpenChange={state.setShowGuide} />
      </>
    )
  }

  if (state.gatePhase === "checking-templates") {
    return (
      <>
        <div className="flex min-h-[80vh] items-center justify-center">
          <Card className="w-full max-w-sm gap-2 py-4">
            <CardHeader>
              <CardTitle>Checking Templates</CardTitle>
              <CardDescription>
                Checking existing templates...
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-center py-4">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>
        <LudusServerGuide open={state.showGuide} onOpenChange={state.setShowGuide} />
      </>
    )
  }

  if (state.gatePhase === "templates-error") {
    return (
      <>
        <div className="flex min-h-[80vh] items-center justify-center">
          <Card className="w-full max-w-sm gap-2 py-4">
            <CardHeader>
              <CardTitle>Template Error</CardTitle>
              <CardDescription>
                Backend returned an error
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-destructive">{state.templatesError}</p>
              <Button onClick={() => { state.setTemplatesError(""); state.setGatePhase("checking-templates"); }} size="sm" className="w-fit self-center">
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
        <LudusServerGuide open={state.showGuide} onOpenChange={state.setShowGuide} />
      </>
    )
  }

  if (state.gatePhase === "templates-incomplete") {
    return (
      <>
        <div className="flex min-h-[80vh] items-center justify-center">
          <Card className="max-w-xs gap-2 py-4">
            <CardHeader>
              <CardTitle>Templates Error</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">
                  Required templates are not yet built.
                </p>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="rounded-full p-1 hover:bg-accent">
                        <Info className="size-4 text-muted-foreground" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      <ul className="list-inside list-disc">
                        {REQUIRED_TEMPLATES.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Button onClick={() => { state.setGatePhase("show-content"); state.setBuildActive(true); }} size="sm" className="w-fit self-center">
                Build
              </Button>
            </CardContent>
          </Card>
        </div>
        <LudusServerGuide open={state.showGuide} onOpenChange={state.setShowGuide} />
      </>
    )
  }

  return (
    <>
      <TabContentCard className="p-6 flex flex-col min-h-0">
        <TimelineContent items={state.timelineItems} />
        <Separator className="mt-4" />
        <div className="mt-4 flex-1 min-h-0 overflow-hidden">
          <YamlTopologyContent
            ready={state.yamlReady}
            className="h-full w-full"
            cpuUsage={state.systemInfo ? String(state.systemInfo.totalCpu) : undefined}
            memoryUsage={state.systemInfo ? String(state.systemInfo.totalRam) : undefined}
            deploymentStatus={state.deploymentStatus}
            isDeploying={state.isDeploying}
            items={state.templateItems}
            yamlContent={state.rangeYaml ?? undefined}
            onYamlChange={state.handleYamlChange}
            onSave={state.handleSave}
            onRevert={state.handleRevert}
            saveDisabled={state.saveDisabled}
            yamlErrors={state.yamlErrors}
            yamlLoading={false}
            saveStatus={state.saveStatus}
            revertStatus={state.revertStatus}
            onReset={state.handleReset}
            onDeploy={state.handleDeploy}
            templateItems={state.templateItems}
          />
        </div>
      </TabContentCard>
      <LudusServerGuide open={state.showGuide} onOpenChange={state.setShowGuide} />
    </>
  )
}