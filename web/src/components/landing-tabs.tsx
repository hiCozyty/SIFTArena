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
import { Loader2, Lock, Info } from "lucide-react"
import { useHealthCheck } from "@/hooks/use-health-check"
import { ConnectionErrorContent, HealthErrorContent } from "@/components/backend-gate"
import { LudusServerGuide } from "@/components/ludus-server-guide"
import { InteractiveTimeline } from "@/components/interactive-timeline"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

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

const REQUIRED_TEMPLATES = [
  "debian-11-x64-server-template",
  "kali-x64-desktop-template",
  "win11-22h2-x64-enterprise-template",
]

function isReallyBuilt(t: { built: boolean; status: string }): boolean {
  return t.built && t.status !== "not_built" && t.status !== "building"
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
  const [gatePhase, setGatePhase] = useState<"checking-templates" | "templates-error" | "templates-incomplete" | "show-content">("checking-templates")
  const [templatesError, setTemplatesError] = useState("")
  const [buildActive, setBuildActive] = useState(false)
  const [templatesResult, setTemplatesResult] = useState<Array<{ name: string; built: boolean; status: string; os: string }>>([])
  const [timelineItems, setTimelineItems] = useState<Array<{ id: string; title: string; description: string; status?: string }>>([])
  const [vmsCheckActive, setVmsCheckActive] = useState(false)
  const builtSentRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (status.type === "idle") {
      connect()
    }
  }, [connect, status.type])

useEffect(() => {
    if (status.type !== "ok") return
    if (gatePhase !== "checking-templates") return

    const unsub = backendWs.subscribe((data) => {
      if (data.type === "templatesList") {
        const error = data.error as string | undefined
        if (error) {
          setTemplatesError(error)
          setGatePhase("templates-error")
          unsub()
          return
        }
        const result = data.result as Array<{ name: string; built: boolean; status: string; os: string }> | undefined
        if (result == null) {
          setTemplatesError("Empty response from backend")
          setGatePhase("templates-error")
          unsub()
          return
        }
setTemplatesResult(result)
        const allItems = REQUIRED_TEMPLATES.map((name, i) => {
          const t = result.find((t) => t.name === name)
          if (!t) return null
          if (isReallyBuilt(t)) {
            return { id: `build-${i + 1}`, title: `Finished building ${name}`, description: "", status: "built" }
          }
          return { id: `build-${i + 1}`, title: `Building ${name}`, description: t.status, status: t.status }
        }).filter((item): item is NonNullable<typeof item> => item != null)
        const firstUnbuiltIdx = allItems.findIndex((item) => item.status !== "built")
        const visible = firstUnbuiltIdx === -1 ? allItems : allItems.slice(0, firstUnbuiltIdx + 1)
        const allBuilt = allItems.every((item) => item.status === "built")
        if (allBuilt) {
          setTimelineItems([...visible, {
            id: "check-vms",
            title: "Checking current VMs deployed",
            description: "checking...",
            status: "building",
          }])
          setVmsCheckActive(true)
        } else {
          setTimelineItems(visible)
        }
        setGatePhase(allBuilt ? "show-content" : "templates-incomplete")
        unsub()
      }
    })
    backendWs.send({ type: "templatesList" })

    return () => {
      unsub()
    }
  }, [status.type, gatePhase])

  useEffect(() => {
    if (status.type !== "ok") return
    if (!buildActive) return

    backendWs.send({ type: "subscribe", channel: "templatesList" })

    const unsub = backendWs.subscribe((data) => {
      if (data.type !== "templatesList") return
      const error = data.error as string | undefined
      if (error) {
        setTemplatesError(error)
        setGatePhase("templates-error")
        setBuildActive(false)
        unsub()
        backendWs.send({ type: "unsubscribe", channel: "templatesList" })
        return
      }
      const result = data.result as Array<{ name: string; built: boolean; status: string; os: string }> | undefined
      if (result == null) {
        setTemplatesError("Empty response from backend")
        setGatePhase("templates-error")
        setBuildActive(false)
        unsub()
        backendWs.send({ type: "unsubscribe", channel: "templatesList" })
        return
      }

      setTemplatesResult(result)

      const latestLog = data.latestLog as string | undefined

      setTimelineItems((prev) => {
        const currentIndex = prev.findIndex((item) => item.status !== "built")

        if (currentIndex === -1) {
          if (prev.length < REQUIRED_TEMPLATES.length) {
            const nextName = REQUIRED_TEMPLATES[prev.length]
            const nextT = result.find((t) => t.name === nextName)
            if (nextT) {
              if (!isReallyBuilt(nextT) && !builtSentRef.current.has(nextT.name)) {
                backendWs.send({ type: "buildTemplates", templates: [nextT.name] })
                builtSentRef.current.add(nextT.name)
              }
              return [...prev, {
                id: `build-${prev.length + 1}`,
                title: isReallyBuilt(nextT) ? `Finished building ${nextName}` : `Building ${nextName}`,
                description: isReallyBuilt(nextT) ? "" : nextT.status,
                status: isReallyBuilt(nextT) ? "built" : nextT.status,
              }]
            }
          }
          if (REQUIRED_TEMPLATES.every((name) => {
            const t = result.find((r) => r.name === name)
            return t ? isReallyBuilt(t) : false
          })) {
            setBuildActive(false)
            if (!prev.some((item) => item.id === "check-vms")) {
              setVmsCheckActive(true)
              return [...prev, {
                id: "check-vms",
                title: "Checking current VMs deployed",
                description: "checking...",
                status: "building",
              }]
            }
          }
          return prev
        }

        const currentName = REQUIRED_TEMPLATES[currentIndex]
        const templateInResult = result.find((t) => t.name === currentName)
        if (!templateInResult) return prev

        if (!isReallyBuilt(templateInResult) && !builtSentRef.current.has(templateInResult.name)) {
          backendWs.send({ type: "buildTemplates", templates: [templateInResult.name] })
          builtSentRef.current.add(templateInResult.name)
        }

        const updated = prev.map((item, i) => {
          if (i !== currentIndex) return item
          if (isReallyBuilt(templateInResult)) {
            return { ...item, title: `Finished building ${templateInResult.name}`, description: "", status: "built" }
          }
          return { ...item, description: latestLog || templateInResult.status, status: templateInResult.status }
        })

        return updated
      })
    })

    return () => {
      backendWs.send({ type: "unsubscribe", channel: "templatesList" })
      unsub()
    }
  }, [status.type, buildActive])

  useEffect(() => {
    if (status.type !== "ok") return
    if (!vmsCheckActive) return

    const unsub = backendWs.subscribe((data) => {
      if (data.type === "rangeStatus") {
        const raw = data.result as [Array<{ name: string }>, unknown] | undefined
        const result = raw?.[0]
        if (!result) return

        const expected = ["router-debian11-x64", "attacker-kali", "win11-22h2"]
        const found = expected.map((suffix) =>
          result.find((vm) => vm.name.endsWith(suffix))
        ).filter(Boolean) as Array<{ name: string }>

        if (found.length === 3) {
          setTimelineItems((prev) => {
            const updated = prev.map((item) =>
              item.id === "check-vms"
                ? { ...item, title: `${found[0].name} is deployed`, description: "", status: "built" }
                : item
            )
            return [
              ...updated,
              { id: "vm-2", title: `${found[1].name} is deployed`, description: "", status: "built" },
              { id: "vm-3", title: `${found[2].name} is deployed`, description: "", status: "built" },
            ]
          })
        } else {
          console.log("early returning")
        }

        unsub()
      }
    })

    backendWs.send({ type: "rangeStatus" })

    return () => {
      unsub()
    }
  }, [status.type, vmsCheckActive])

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

  if (status.type === "ok" && gatePhase === "checking-templates") {
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
        <LudusServerGuide open={showGuide} onOpenChange={setShowGuide} />
      </>
    )
  }

  if (status.type === "ok" && gatePhase === "templates-error") {
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
              <p className="text-sm text-destructive">{templatesError}</p>
              <Button onClick={() => { setTemplatesError(""); setGatePhase("checking-templates"); }} size="sm" className="w-fit self-center">
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
        <LudusServerGuide open={showGuide} onOpenChange={setShowGuide} />
      </>
    )
  }

  if (status.type === "ok" && gatePhase === "templates-incomplete") {
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
              <Button onClick={() => { setGatePhase("show-content"); setBuildActive(true); }} size="sm" className="w-fit self-center">
                Build
              </Button>
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
            <Button onClick={() => { onComplete(); }}>Complete Lab Range Setup</Button>
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
