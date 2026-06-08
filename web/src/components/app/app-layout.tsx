import { useState } from "react"
import { LandingTabs } from "@/components/app/landing-tabs"
import BottomDock from "@/components/app/dock"
import type { ScenarioItem } from "@/components/attack-configuration/scenario-tab"

export function AppLayout() {
  const [labRangeCompleted, setLabRangeCompleted] = useState(false)
  const [attackConfigCompleted, setAttackConfigCompleted] = useState(false)
  const [siftAgentConfigured, setSiftAgentConfigured] = useState(false)
  const [hasPlaybooks, setHasPlaybooks] = useState(false)
  const [playbookCompleted, setPlaybookCompleted] = useState(false)
  const [scenarioItems, setScenarioItems] = useState<ScenarioItem[]>([])

  return (
    <>
      <LandingTabs
        labRangeCompleted={labRangeCompleted}
        attackConfigCompleted={attackConfigCompleted}
        siftAgentConfigured={siftAgentConfigured}
        hasPlaybooks={hasPlaybooks}
        playbookCompleted={playbookCompleted}
        scenarioItems={scenarioItems}
        onLabRangeComplete={() => setLabRangeCompleted(true)}
        onAttackConfigComplete={(v) => setAttackConfigCompleted(v)}
        onSiftAgentConfigured={() => setSiftAgentConfigured(true)}
        onHasPlaybooks={setHasPlaybooks}
        onPlaybookComplete={() => setPlaybookCompleted(true)}
        onSelectNoise={() => {}}
        onScenarioItemsChange={setScenarioItems}
      />
      <BottomDock />
    </>
  )
}
