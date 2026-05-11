import { useLocation, useNavigate } from "react-router-dom"
import { useState, useEffect, useRef } from "react"
import * as backendWs from "@/lib/backend-ws"
import { RiTrophyLine, RiVoiceprintLine } from "@remixicon/react"
import { LudusIcon } from "@/components/icons/ludus-icon"
import { CalderaIcon } from "@/components/icons/caldera-icon"
import { MeshNetworkIcon } from "@/components/icons/game-icons-mesh-network"
import { SiftAgentIcon } from "@/components/icons/sift-agent-icon"
import { BrandSpeedtestIcon } from "@/components/icons/tabler-brand-speedtest"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, Lock } from "lucide-react"
import { useHealthCheck } from "@/hooks/use-health-check"
import { ConnectionErrorContent, HealthErrorContent } from "@/components/backend-gate"
import { LudusServerGuide } from "@/components/ludus-server-guide"
import { InteractiveTimeline } from "@/components/interactive-timeline"

interface CompletionState {
  labRangeCompleted: boolean
  attackConfigCompleted: boolean
  siftAgentConfigured: boolean
}

interface LandingTabsProps extends CompletionState {
  onLabRangeComplete: () => void
  onAttackConfigComplete: () => void
  onSiftAgentConfigured: () => void
}

const SECTIONS = [
  "Leaderboard",
  "Lab Range",
  "Attack Configuration",
  "SnR",
  "SIFT Agent",
  "Run Benchmark",
  "Knowledge Graph",
] as const

const TAB_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Leaderboard: RiTrophyLine,
  "Lab Range": LudusIcon,
  "Attack Configuration": CalderaIcon,
  SnR: RiVoiceprintLine,
  "SIFT Agent": SiftAgentIcon,
  "Run Benchmark": BrandSpeedtestIcon,
  "Knowledge Graph": MeshNetworkIcon,
}

const TAB_PATHS: Record<string, string> = {
  Leaderboard: "/",
  "Lab Range": "/lab-range",
  "Attack Configuration": "/attack-configuration",
  SnR: "/snr",
  "SIFT Agent": "/sift-agent",
  "Run Benchmark": "/run-benchmark",
  "Knowledge Graph": "/knowledge-graph",
}

const PATH_TO_TAB: Record<string, string> = {
  "/": "Leaderboard",
  "/lab-range": "Lab Range",
  "/attack-configuration": "Attack Configuration",
  "/snr": "SnR",
  "/sift-agent": "SIFT Agent",
  "/run-benchmark": "Run Benchmark",
  "/knowledge-graph": "Knowledge Graph",
}

const PREREQUISITES: Record<string, string> = {
  "Attack Configuration": "Lab Range",
  SnR: "Attack Configuration",
  "Run Benchmark": "SIFT Agent",
}

function isTabAccessible(section: string, state: CompletionState): boolean {
  switch (section) {
    case "Attack Configuration":
      return state.labRangeCompleted
    case "SnR":
      return state.attackConfigCompleted
    case "Run Benchmark":
      return state.siftAgentConfigured
    default:
      return true
  }
}

function getPrerequisite(section: string): string | undefined {
  return PREREQUISITES[section]
}

function LeaderboardContent() {
  const Icon = TAB_ICONS["Leaderboard"]
  return (
    <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
          <Icon className="size-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Leaderboard</h3>
          <p className="text-muted-foreground text-sm">Ranked player/team scores</p>
        </div>
      </div>
      <p className="text-muted-foreground text-sm">
        Content for <strong>Leaderboard</strong> goes here.
      </p>
    </div>
  )
}

function LabRangeContent({
  completed,
  onComplete,
}: {
  completed: boolean
  onComplete: () => void
}) {
  const { status, connect } = useHealthCheck()
  const [showGuide, setShowGuide] = useState(false)
  const [timelineItems, setTimelineItems] = useState([
    { id: "1", title: "placeholder-title", description: "placeholder-description" },
  ])
  const templatesQueryRan = useRef(false)

  useEffect(() => {
    if (status.type === "idle") {
      connect()
    }
  }, [connect, status.type])

  useEffect(() => {
    if (status.type !== "ok" || templatesQueryRan.current) return
    templatesQueryRan.current = true

    const unsub = backendWs.subscribe((data) => {
      if (data.type === "templatesList") {
        console.log("templatesList:", data)
        unsub()
      }
    })
    backendWs.send({ type: "templatesList" })

    return () => unsub()
  }, [status.type])

  useEffect(() => {
    if (status.type !== "ok") return
    const timers = [
      setTimeout(() => {
        setTimelineItems((prev) => [...prev, { id: "2", title: "Checking templates", description: "Querying Ludus for available VM templates" }])
      }, 1500),
      setTimeout(() => {
        setTimelineItems((prev) => [...prev, { id: "3", title: "Templates found", description: "5 templates available, 0 built" }])
      }, 3000),
      setTimeout(() => {
        setTimelineItems((prev) => [...prev, { id: "4", title: "Building debian-11", description: "Template build in progress..." }])
      }, 4500),
      setTimeout(() => {
        setTimelineItems((prev) => [...prev, { id: "5", title: "Building kali", description: "Template build in progress..." }])
      }, 6000),
      setTimeout(() => {
        setTimelineItems((prev) => [...prev, { id: "6", title: "Building win11", description: "Template build in progress..." }])
      }, 7500),
    ]
    return () => timers.forEach(clearTimeout)
  }, [status.type])

  if (status.type === "idle" || status.type === "connecting") {
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

  if (status.type === "connection-error") {
    return (
      <>
        <div className="flex min-h-[80vh] items-center justify-center">
          <Card className="w-full max-w-sm gap-2 py-4">
            <CardHeader>
              <CardTitle>Connection Failed</CardTitle>
            </CardHeader>
            <CardContent>
              <ConnectionErrorContent
                onRetry={connect}
                onShowGuide={() => setShowGuide(true)}
              />
            </CardContent>
          </Card>
        </div>
        <LudusServerGuide open={showGuide} onOpenChange={setShowGuide} />
      </>
    )
  }

  if (status.type === "health-error") {
    return (
      <>
        <div className="flex min-h-[80vh] items-center justify-center">
          <Card className="w-full max-w-sm gap-2 py-4">
            <CardHeader>
              <CardTitle>Configuration Error</CardTitle>
            </CardHeader>
            <CardContent>
              <HealthErrorContent
                status={status.rawStatus}
                detail={status.detail}
                config={status.config}
                onRetry={connect}
                onShowGuide={() => setShowGuide(true)}
              />
            </CardContent>
          </Card>
        </div>
        <LudusServerGuide open={showGuide} onOpenChange={setShowGuide} />
      </>
    )
  }

  return (
    <>
      <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
            <LudusIcon className="size-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Ludus Lab Range</h3>
            <p className="text-muted-foreground text-sm">Lab provisioning and management</p>
          </div>
        </div>
        <InteractiveTimeline items={timelineItems} maxItems={3} />
        <div className="mt-4">
          {completed ? (
            <p className="text-sm text-green-600">✓ Lab Range setup completed</p>
          ) : (
            <Button onClick={onComplete}>Complete Lab Range Setup</Button>
          )}
        </div>
      </div>
      <LudusServerGuide open={showGuide} onOpenChange={setShowGuide} />
    </>
  )
}

function AttackConfigurationContent({
  completed,
  onComplete,
}: {
  completed: boolean
  onComplete: () => void
}) {
  const Icon = TAB_ICONS["Attack Configuration"]
  return (
    <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
          <Icon className="size-6 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Attack Configuration</h3>
          <p className="text-muted-foreground text-sm">Configure attack parameters</p>
        </div>
      </div>
      <p className="text-muted-foreground text-sm">
        Content for <strong>Attack Configuration</strong> goes here.
      </p>
      <div className="mt-4">
        {completed ? (
          <p className="text-sm text-green-600">✓ Attack Configuration completed</p>
        ) : (
          <Button onClick={onComplete}>Complete Attack Configuration</Button>
        )}
      </div>
    </div>
  )
}

function SnrContent() {
  const Icon = TAB_ICONS["SnR"]
  return (
    <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
          <Icon className="size-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">SnR</h3>
          <p className="text-muted-foreground text-sm">Signal to noise ratio analysis</p>
        </div>
      </div>
      <p className="text-muted-foreground text-sm">
        Content for <strong>SnR</strong> goes here.
      </p>
    </div>
  )
}

function SiftAgentContent({
  configured,
  onConfigured,
}: {
  configured: boolean
  onConfigured: () => void
}) {
  const Icon = TAB_ICONS["SIFT Agent"]
  return (
    <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
          <Icon className="size-[1.375rem] text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">SIFT Agent</h3>
          <p className="text-muted-foreground text-sm">Select deployed SIFT agents</p>
        </div>
      </div>
      <p className="text-muted-foreground text-sm">
        Content for <strong>SIFT Agent</strong> goes here.
      </p>
      <div className="mt-4">
        {configured ? (
          <p className="text-sm text-green-600">✓ SIFT Agent configured</p>
        ) : (
          <Button onClick={onConfigured}>Configure SIFT Agent</Button>
        )}
      </div>
    </div>
  )
}

function BenchmarkContent() {
  const Icon = TAB_ICONS["Run Benchmark"]
  return (
    <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
          <Icon className="size-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Run Benchmark</h3>
          <p className="text-muted-foreground text-sm">Execute performance benchmarks</p>
        </div>
      </div>
      <p className="text-muted-foreground text-sm">
        Content for <strong>Run Benchmark</strong> goes here.
      </p>
    </div>
  )
}

function KnowledgeGraphContent() {
  const Icon = TAB_ICONS["Knowledge Graph"]
  return (
    <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
          <Icon className="size-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Knowledge Graph</h3>
          <p className="text-muted-foreground text-sm">
            Knowledge graph visualization and exploration
          </p>
        </div>
      </div>
      <p className="text-muted-foreground text-sm">
        Content for <strong>Knowledge Graph</strong> goes here.
      </p>
    </div>
  )
}

function LockedContent({
  section,
  prerequisite,
}: {
  section: string
  prerequisite: string
}) {
  const navigate = useNavigate()
  const targetPath = TAB_PATHS[prerequisite]

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border bg-card py-16 text-card-foreground shadow-sm">
      <Lock className="mb-4 size-12 text-muted-foreground" />
      <h3 className="mb-2 text-lg font-semibold">{section} is locked</h3>
      <p className="mb-6 text-sm text-muted-foreground">
        Complete <strong>{prerequisite}</strong> setup first to unlock this section.
      </p>
      <Button onClick={() => navigate(targetPath, { replace: true })}>
        Go to {prerequisite}
      </Button>
    </div>
  )
}

export function LandingTabs({
  labRangeCompleted,
  attackConfigCompleted,
  siftAgentConfigured,
  onLabRangeComplete,
  onAttackConfigComplete,
  onSiftAgentConfigured,
}: LandingTabsProps) {
  const location = useLocation()
  const navigate = useNavigate()

  const completionState: CompletionState = {
    labRangeCompleted,
    attackConfigCompleted,
    siftAgentConfigured,
  }

  const activeTab = PATH_TO_TAB[location.pathname] ?? SECTIONS[0]

  return (
    <div className="mx-auto w-fit p-8">
      <Tabs
        value={activeTab}
        onValueChange={(tab) => navigate(TAB_PATHS[tab], { replace: true })}
        className="w-full"
      >
        <TabsList>
          {SECTIONS.map((s) => {
            const Icon = TAB_ICONS[s]
            return (
              <TabsTrigger key={s} value={s}>
                <Icon />
                {s}
              </TabsTrigger>
            )
          })}
        </TabsList>
        {SECTIONS.map((s) => {
          const unlocked = isTabAccessible(s, completionState)
          const prerequisite = getPrerequisite(s)

          return (
            <TabsContent key={s} value={s} forceMount>
              {!unlocked && prerequisite ? (
                <LockedContent section={s} prerequisite={prerequisite} />
              ) : s === "Leaderboard" ? (
                <LeaderboardContent />
              ) : s === "Lab Range" ? (
                <LabRangeContent
                  completed={labRangeCompleted}
                  onComplete={onLabRangeComplete}
                />
              ) : s === "Attack Configuration" ? (
                <AttackConfigurationContent
                  completed={attackConfigCompleted}
                  onComplete={onAttackConfigComplete}
                />
              ) : s === "SnR" ? (
                <SnrContent />
              ) : s === "SIFT Agent" ? (
                <SiftAgentContent
                  configured={siftAgentConfigured}
                  onConfigured={onSiftAgentConfigured}
                />
              ) : s === "Run Benchmark" ? (
                <BenchmarkContent />
              ) : s === "Knowledge Graph" ? (
                <KnowledgeGraphContent />
              ) : null}
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}
