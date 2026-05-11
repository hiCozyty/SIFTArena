import { useState } from "react"
import { LandingTabs } from "@/components/landing-tabs"
import BottomDock from "@/components/dock"

export function AppLayout() {
  const [labRangeCompleted, setLabRangeCompleted] = useState(false)
  const [attackConfigCompleted, setAttackConfigCompleted] = useState(false)
  const [siftAgentConfigured, setSiftAgentConfigured] = useState(false)

  return (
    <>
      <LandingTabs
        labRangeCompleted={labRangeCompleted}
        attackConfigCompleted={attackConfigCompleted}
        siftAgentConfigured={siftAgentConfigured}
        onLabRangeComplete={() => setLabRangeCompleted(true)}
        onAttackConfigComplete={() => setAttackConfigCompleted(true)}
        onSiftAgentConfigured={() => setSiftAgentConfigured(true)}
      />
      <BottomDock />
    </>
  )
}
