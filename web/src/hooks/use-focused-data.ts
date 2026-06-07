import { useState, useCallback } from "react"
import * as backendWs from "@/lib/backend-ws"

export type AtomicAbility = {
  ability_id: string
  name: string
  description?: string
  command: string
  win_prereq: string
  custom?: boolean
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
      if (data.type === "getFocusedCategoriesAndTechniques" && data.result) {
        const result = data.result as FocusedData
        const t1003 = result.techniques?.["credential-access"]?.["T1003.001"]
        setStatus({ type: "success", data: result })
        unsub()
      }
    })

    backendWs.send({ type: "getFocusedCategoriesAndTechniques" })
  }, [])

  return { status, fetch }
}
