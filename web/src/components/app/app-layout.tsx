import { useState } from "react"
import { LandingTabs } from "@/components/app/landing-tabs"
import BottomDock from "@/components/app/dock"

export function AppLayout() {
  const [labRangeCompleted, setLabRangeCompleted] = useState(false)
  const [attackConfigCompleted, setAttackConfigCompleted] = useState(false)
  const [siftAgentConfigured, setSiftAgentConfigured] = useState(false)
  const [hasPlaybooks, setHasPlaybooks] = useState(false)
  const [playbookCompleted, setPlaybookCompleted] = useState(false)

  return (
    <>
      <LandingTabs
        labRangeCompleted={labRangeCompleted}
        attackConfigCompleted={attackConfigCompleted}
        siftAgentConfigured={siftAgentConfigured}
        hasPlaybooks={hasPlaybooks}
        playbookCompleted={playbookCompleted}
        onLabRangeComplete={() => setLabRangeCompleted(true)}
        onAttackConfigComplete={(v) => setAttackConfigCompleted(v)}
        onSiftAgentConfigured={() => setSiftAgentConfigured(true)}
        onHasPlaybooks={setHasPlaybooks}
        onPlaybookComplete={() => setPlaybookCompleted(true)}
      />
      <BottomDock />
    </>
  )
}
