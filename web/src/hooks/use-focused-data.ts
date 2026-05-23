import { useState, useCallback } from "react"
import * as backendWs from "@/lib/backend-ws"

export type AtomicAbility = {
  ability_id: string
  executor: string
  name: string
}

export type Technique = {
  technique_id: string
  technique_name: string
  abilities: AtomicAbility[]
}

export type FocusedData = {
  categories: string[]
  techniques: Record<string, Record<string, Technique>>
}

export type FocusedDataStatus =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "error"; message: string }
  | { type: "success"; data: FocusedData }

export function useFocusedData() {
  const [status, setStatus] = useState<FocusedDataStatus>({ type: "idle" })

  const fetch = useCallback(() => {
    setStatus({ type: "loading" })

    const unsub = backendWs.subscribe((data) => {
      if (data.type === "connected") return
      if (data.error) {
        setStatus({ type: "error", message: data.error as string })
        unsub()
        return
      }
      if (data.result) {
        setStatus({ type: "success", data: data.result as FocusedData })
        unsub()
      }
    })

    backendWs.send({ type: "getFocusedCategoriesAndTechniques" })
  }, [])

  return { status, fetch }
}
