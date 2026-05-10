import { BackendGate } from "@/components/backend-gate"
import { useState } from "react"

export function HomePage() {
  const [gatePassed, setGatePassed] = useState(false)

  if (!gatePassed) {
    return <BackendGate onSuccess={() => setGatePassed(true)} />
  }

  return <></>
}
