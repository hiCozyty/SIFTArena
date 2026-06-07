import { useState } from "react"
import { LandingTabs } from "@/components/app/landing-tabs"
import BottomDock from "@/components/app/dock"

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
        onLabRangeReset={() => setLabRangeCompleted(false)}
        onAttackConfigComplete={(v) => setAttackConfigCompleted(v)}
        onSiftAgentConfigured={() => setSiftAgentConfigured(true)}
      />
      <BottomDock />
    </>
  )
}
