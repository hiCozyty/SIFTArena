import { useLocation, useNavigate } from "react-router-dom"
import { useEffect } from "react"
import { executeWsOperation } from "@/lib/ws-ops"
import * as backendWs from "@/lib/backend-ws"
import { RiTrophyLine, RiBookLine } from "@remixicon/react"
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
import { AttackConfiguration } from "@/components/attack-configuration/attack-configuration"
import { PlaybookContent } from "@/components/playbook/playbook-content"
import type { ScenarioItem } from "@/components/attack-configuration/scenario-tab"
import { SiftAgentContent } from "@/components/sift-agent/sift-agent-content"
import { BenchmarkContent } from "@/components/run-benchmark/benchmark-content"
import { KnowledgeGraphContent } from "@/components/knowledge-graph/knowledge-graph-content"
import { TabContentCard } from "@/components/shared-ui-primitives/tab-content-card"

interface CompletionState {
  labRangeCompleted: boolean
  attackConfigCompleted: boolean
  siftAgentConfigured: boolean
  hasPlaybooks: boolean
  playbookCompleted: boolean
}

interface LandingTabsProps extends CompletionState {
  scenarioItems: ScenarioItem[]
  onLabRangeComplete: () => void
  onAttackConfigComplete: (completed: boolean) => void
  onSiftAgentConfigured: () => void
  onHasPlaybooks: (hasPlaybooks: boolean) => void
  onPlaybookComplete: () => void
  onSelectNoise: () => void
  onScenarioItemsChange: React.Dispatch<React.SetStateAction<ScenarioItem[]>>
}

const SECTIONS = [
  "Leaderboard",
  "Lab Range",
  "Attack Configuration",
  "Playbook",
  "SIFT Agent",
  "Run Benchmark",
  "Knowledge Graph",
] as const

const TAB_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Leaderboard: RiTrophyLine,
  "Lab Range": LudusIcon,
  "Attack Configuration": CalderaIcon,
  Playbook: RiBookLine,
  "SIFT Agent": SiftAgentIcon,
  "Run Benchmark": BrandSpeedtestIcon,
  "Knowledge Graph": MeshNetworkIcon,
}

const TAB_PATHS: Record<string, string> = {
  Leaderboard: "/",
  "Lab Range": "/lab-range",
  "Attack Configuration": "/attack-configuration",
  Playbook: "/playbook",
  "SIFT Agent": "/sift-agent",
  "Run Benchmark": "/run-benchmark",
  "Knowledge Graph": "/knowledge-graph",
}

const PATH_TO_TAB: Record<string, string> = {
  "/": "Leaderboard",
  "/lab-range": "Lab Range",
  "/attack-configuration": "Attack Configuration",
  "/playbook": "Playbook",
  "/sift-agent": "SIFT Agent",
  "/run-benchmark": "Run Benchmark",
  "/knowledge-graph": "Knowledge Graph",
}

const PREREQUISITES: Record<string, string> = {
  "Attack Configuration": "Lab Range",
  Playbook: "Attack Configuration",
  "Run Benchmark": "SIFT Agent",
}

function isTabAccessible(section: string, state: CompletionState): boolean {
  switch (section) {
    case "Attack Configuration":
      return state.labRangeCompleted
    case "Playbook":
      return state.hasPlaybooks || state.attackConfigCompleted
    case "Run Benchmark":
      return state.playbookCompleted && state.siftAgentConfigured
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
  playbookCompleted,
  siftAgentConfigured,
  onHasPlaybooks,
}: {
  section: string
  prerequisite: string
  playbookCompleted: boolean
  siftAgentConfigured: boolean
  onHasPlaybooks: (hasPlaybooks: boolean) => void
}) {
  const navigate = useNavigate()
  const targetPath = TAB_PATHS[prerequisite]

  useEffect(() => {
    if (section !== "Playbook") return
    executeWsOperation<Array<{ name: string }>>({
      messageType: "getPlaybooks",
      sendFn: () => backendWs.send({ type: "getPlaybooks" }),
    }).then((result) => {
      onHasPlaybooks(result.length > 0)
    }).catch((err) => {
      console.error("[landing-tabs] getPlaybooks from LockedContent failed:", err)
    })
  }, [section, onHasPlaybooks])

  return (
    <TabContentCard className="py-16 flex flex-col items-center justify-center">
      <Lock className="mb-4 size-12 text-muted-foreground" />
      <h3 className="mb-2 text-lg font-semibold">{section} is locked</h3>
      <p className="mb-6 text-sm text-muted-foreground">
        {section === "Run Benchmark" && !playbookCompleted && !siftAgentConfigured
          ? <>Complete <strong>Playbook</strong> and <strong>SIFT Agent</strong> setup first to unlock this section.</>
          : section === "Run Benchmark" && !playbookCompleted
          ? <>Complete <strong>Playbook</strong> setup first to unlock this section.</>
          : section === "Run Benchmark" && !siftAgentConfigured
          ? <>Complete <strong>SIFT Agent</strong> setup first to unlock this section.</>
          : prerequisite === "Attack Configuration"
          ? <>Please add an ability to the scenario in the <strong>Attack Configuration</strong> to unlock this section.</>
          : <>Complete <strong>{prerequisite}</strong> setup first to unlock this section.</>
        }
      </p>
      <div className="flex items-center gap-2">
        {section === "Run Benchmark" && !playbookCompleted ? (
          <Button onClick={() => navigate(TAB_PATHS["Playbook"], { replace: true })}>
            Go to Playbook
          </Button>
        ) : null}
        {section === "Run Benchmark" && !siftAgentConfigured ? (
          <Button onClick={() => navigate(TAB_PATHS["SIFT Agent"], { replace: true })}>
            Go to SIFT Agent
          </Button>
        ) : section !== "Run Benchmark" ? (
          <Button onClick={() => navigate(targetPath, { replace: true })}>
            Go to {prerequisite}
          </Button>
        ) : null}
      </div>
    </TabContentCard>
  )
}

export function LandingTabs({
  labRangeCompleted,
  attackConfigCompleted,
  siftAgentConfigured,
  hasPlaybooks,
  playbookCompleted,
  scenarioItems,
  onLabRangeComplete,
  onAttackConfigComplete,
  onSiftAgentConfigured,
  onHasPlaybooks,
  onPlaybookComplete,
  onSelectNoise,
  onScenarioItemsChange,
}: LandingTabsProps) {
  const location = useLocation()
  const navigate = useNavigate()

  const completionState: CompletionState = {
    labRangeCompleted,
    attackConfigCompleted,
    siftAgentConfigured,
    hasPlaybooks,
    playbookCompleted,
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
                <LockedContent section={s} prerequisite={prerequisite} playbookCompleted={playbookCompleted} siftAgentConfigured={siftAgentConfigured} onHasPlaybooks={onHasPlaybooks} />
              ) : s === "Leaderboard" ? (
                <LeaderboardContent />
              ) : s === "Lab Range" ? (
                <LabRangeContent
                  completed={labRangeCompleted}
                  onComplete={onLabRangeComplete}
                />
              ) : s === "Attack Configuration" ? (
                <AttackConfiguration
                  scenarioItems={scenarioItems}
                  setScenarioItems={onScenarioItemsChange}
                  onComplete={onAttackConfigComplete}
                />
              ) : s === "Playbook" ? (
                <PlaybookContent
                  scenarioItems={scenarioItems}
                  onHasPlaybooks={onHasPlaybooks}
                  onComplete={onPlaybookComplete}
                  onSelectNoise={onSelectNoise}
                />
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
