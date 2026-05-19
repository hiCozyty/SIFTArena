import { useLocation, useNavigate } from "react-router-dom"
import { RiTrophyLine, RiVoiceprintLine } from "@remixicon/react"
import { LudusIcon } from "@/components/icons/ludus-icon"
import { CalderaIcon } from "@/components/icons/caldera-icon"
import { MeshNetworkIcon } from "@/components/icons/game-icons-mesh-network"
import { SiftAgentIcon } from "@/components/icons/sift-agent-icon"
import { BrandSpeedtestIcon } from "@/components/icons/tabler-brand-speedtest"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Lock } from "lucide-react"
import { LabRangeContent } from "@/components/lab-range/lab-range-content"
import { LeaderboardContent } from "@/components/leaderboard/leaderboard-content"
import { AttackConfigurationContent } from "@/components/attack-configuration/attack-configuration-content"
import { SnrContent } from "@/components/snr/snr-content"
import { SiftAgentContent } from "@/components/sift-agent/sift-agent-content"
import { BenchmarkContent } from "@/components/run-benchmark/benchmark-content"
import { KnowledgeGraphContent } from "@/components/knowledge-graph/knowledge-graph-content"
import { TabContentCard } from "@/components/shared-ui-primitives/tab-content-card"

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
    <TabContentCard className="py-16 flex flex-col items-center justify-center">
      <Lock className="mb-4 size-12 text-muted-foreground" />
      <h3 className="mb-2 text-lg font-semibold">{section} is locked</h3>
      <p className="mb-6 text-sm text-muted-foreground">
        Complete <strong>{prerequisite}</strong> setup first to unlock this section.
      </p>
      <Button onClick={() => navigate(targetPath, { replace: true })}>
        Go to {prerequisite}
      </Button>
    </TabContentCard>
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