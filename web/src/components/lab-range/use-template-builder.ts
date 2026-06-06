import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import * as backendWs from "@/lib/backend-ws"
import type { HealthCheckStatus } from "@/hooks/use-health-check"
import type { GatePhase, TimelineItem, TemplateItem } from "./use-lab-range-state"

export const REQUIRED_TEMPLATES = [
  "debian-11-x64-server-template",
  "kali-x64-desktop-template",
  "win11-22h2-x64-enterprise-template",
  "win2022-server-x64-template",
]

function isReallyBuilt(t: { built: boolean; status: string }): boolean {
  return t.built && t.status !== "not_built" && t.status !== "building"
}

function buildTimelineItems(
  result: Array<{ name: string; built: boolean; status: string; os: string }>,
): TimelineItem[] {
  return REQUIRED_TEMPLATES.map((name, i) => {
    const t = result.find((t) => t.name === name)
    if (!t) return null
    if (isReallyBuilt(t)) {
      return { id: `build-${i + 1}`, title: `Finished building ${name}`, description: "", status: "built" }
    }
    return { id: `build-${i + 1}`, title: `Building ${name}`, description: t.status, status: t.status }
  }).filter((item): item is NonNullable<typeof item> => item != null)
}

export interface UseTemplateBuilderDeps {
  statusType: HealthCheckStatus["type"]
  setGatePhase: (phase: GatePhase) => void
  setTemplatesError: (error: string) => void
  setDeployActive: (active: boolean) => void
  setTimelineItems: React.Dispatch<React.SetStateAction<TimelineItem[]>>
}

export function useTemplateBuilder({
  statusType,
  setGatePhase,
  setTemplatesError,
  setDeployActive,
  setTimelineItems,
}: UseTemplateBuilderDeps) {
  const [buildActive, setBuildActive] = useState(false)
  const [templatesResult, setTemplatesResult] = useState<Array<{ name: string; built: boolean; status: string; os: string }>>([])
  const builtSentRef = useRef<Set<string>>(new Set())
  const timelineBuiltOnceRef = useRef(false)

  const templateItems = useMemo(
    () =>
      templatesResult.map((t, i) => ({
        id: i,
        label: t.name,
        subText: t.status === "built" ? "Built" : t.status === "building" ? "Building..." : "Not Built",
        icon: "🖥️",
      })),
    [templatesResult],
  )

  useEffect(() => {
    if (timelineBuiltOnceRef.current) return
    if (templatesResult.length === 0) return
    const allBuilt = REQUIRED_TEMPLATES.every((name) => {
      const t = templatesResult.find((r) => r.name === name)
      return t ? isReallyBuilt(t) : false
    })
    if (allBuilt) {
      timelineBuiltOnceRef.current = true
    }
  }, [templatesResult])

  // Initial template check
  useEffect(() => {
    if (statusType !== "ok") return
    if (buildActive) return

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
        const allItems = buildTimelineItems(result)
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
          setDeployActive(true)
        } else {
          setTimelineItems(visible)
        }
        setGatePhase(allBuilt ? "show-content" : "templates-incomplete")
        unsub()
      }
    })
    backendWs.send({ type: "templatesList" })

    return () => { unsub() }
  }, [statusType, buildActive, setGatePhase, setTemplatesError, setDeployActive, setTimelineItems])

  // Template building loop
  useEffect(() => {
    if (statusType !== "ok") return
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
              setDeployActive(true)
              return [...prev, {
                id: "check-vms",
                title: "Checking current VMs deployed",
                description: "checking...",
                status: "building",
              }]
            }
          }
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
  }, [statusType, buildActive, setGatePhase, setTemplatesError, setDeployActive, setTimelineItems])

  return {
    buildActive,
    setBuildActive,
    templateItems,
    timelineBuiltOnceRef,
  }
}
