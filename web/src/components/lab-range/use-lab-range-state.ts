import { useState, useEffect, useRef, useMemo } from "react"
import * as backendWs from "@/lib/backend-ws"
import { useHealthCheck, type HealthCheckStatus } from "@/hooks/use-health-check"
import { validateRangeYaml, isYamlContentEqual } from "@/lib/range-yaml-validator"
import type { DeploymentStatus } from "@/components/ui/tabs-fancy"

export type GatePhase = "checking-templates" | "templates-error" | "templates-incomplete" | "show-content"
export type SaveStatus = "idle" | "success" | "no-changes"
export type RevertStatus = "idle" | "success"
export type TimelineItem = { id: string; title: string; description: string; status?: string }
export type TemplateItem = { id: number; label: string; subText: string; icon: string }

export const REQUIRED_TEMPLATES = [
  "debian-11-x64-server-template",
  "kali-x64-desktop-template",
  "win11-22h2-x64-enterprise-template",
]

const GOLDEN_IMAGE_VMS = [
  { label: "kali", vm: "attacker-kali" },
  { label: "windows", vm: "win11-22h2" },
]

interface GoldenImageResult {
  label: string
  vm: string
  ip: string | null
  snapshot: string
  created: boolean
  overwritten?: boolean
  error?: string
}

function isReallyBuilt(t: { built: boolean; status: string }): boolean {
  return t.built && t.status !== "not_built" && t.status !== "building"
}

const EXPECTED_VMS = ["router-debian11-x64", "attacker-kali", "win11-22h2"]

function parsePlayRecap(playRecap: string[]): boolean {
  return EXPECTED_VMS.every((suffix) => {
    const line = playRecap.find((l) => l.includes(suffix))
    if (!line) return false
    const unreachable = line.match(/unreachable=(\d+)/)?.[1]
    const failed = line.match(/failed=(\d+)/)?.[1]
    return unreachable === "0" && failed === "0"
  })
}

export function useLabRangeState(onComplete: () => void) {
  const { status, connect } = useHealthCheck()
  const [showGuide, setShowGuide] = useState(false)
  const [gatePhase, setGatePhase] = useState<GatePhase>("checking-templates")
  const [templatesError, setTemplatesError] = useState("")
  const [buildActive, setBuildActive] = useState(false)
  const [templatesResult, setTemplatesResult] = useState<Array<{ name: string; built: boolean; status: string; os: string }>>([])
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([])
  const [deployActive, setDeployActive] = useState(false)
  const [calderaActive, setCalderaActive] = useState(false)
  const [goldenImageActive, setGoldenImageActive] = useState(false)
  const [rangeYaml, setRangeYaml] = useState<string | null>(null)
  const [yamlErrors, setYamlErrors] = useState<string[]>([])
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const [revertStatus, setRevertStatus] = useState<RevertStatus>("idle")
  const [deploymentStatus, setDeploymentStatus] = useState<DeploymentStatus>("Not Deployed")
  const [isDeploying, setIsDeploying] = useState(false)
  const [systemInfo, setSystemInfo] = useState<{ totalCpu: number; totalRam: number } | null>(null)
  const lastSavedDraftRef = useRef<string | null>(null)
  const serverYamlRef = useRef<string | null>(null)
  const builtSentRef = useRef<Set<string>>(new Set())
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const calderaLogRef = useRef<string>("")
  const timelineBuiltOnceRef = useRef(false)
  const [snapshotsTaken, setSnapshotsTaken] = useState(false)
  const deployModeRef = useRef<"auto" | "reset" | "deploy">("auto")
  const vmsBeforeDeployRef = useRef<string[]>([])
  const vmsCapturedRef = useRef(false)
  const [postDeploySnapshotActive, setPostDeploySnapshotActive] = useState(false)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    if (timelineBuiltOnceRef.current) return
    if (timelineItems.length === 0) return
    if (timelineItems.every((item) => item.status === "built")) {
      timelineBuiltOnceRef.current = true
    }
  }, [timelineItems])

  useEffect(() => {
    if (snapshotsTaken) return
    const golden = timelineItems.find((item) => item.id === "golden-image")
    if (golden && golden.status === "built") {
      setSnapshotsTaken(true)
    }
  }, [timelineItems, snapshotsTaken])

  const templateItems = useMemo(() =>
    templatesResult.map((t, i) => ({
      id: i,
      label: t.name,
      subText: t.status === "built" ? "Built" : t.status === "building" ? "Building..." : "Not Built",
      icon: "🖥️",
    })),
  [templatesResult])

  const isStale = useMemo(() => {
    if (rangeYaml === null || serverYamlRef.current === null) return false
    return !isYamlContentEqual(rangeYaml, serverYamlRef.current)
  }, [rangeYaml])

  useEffect(() => {
    if (deploymentStatus === "Deployed" && isStale) {
      setDeploymentStatus("Deployed (stale)")
    } else if (deploymentStatus === "Deployed (stale)" && !isStale) {
      setDeploymentStatus("Deployed")
    }
  }, [isStale, deploymentStatus])

  useEffect(() => {
    if (status.type === "idle") {
      connect()
    }
  }, [connect, status.type])

  useEffect(() => {
    if (status.type !== "ok") return
    if (gatePhase !== "checking-templates") return

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
        const allItems = REQUIRED_TEMPLATES.map((name, i) => {
          const t = result.find((t) => t.name === name)
          if (!t) return null
          if (isReallyBuilt(t)) {
            return { id: `build-${i + 1}`, title: `Finished building ${name}`, description: "", status: "built" }
          }
          return { id: `build-${i + 1}`, title: `Building ${name}`, description: t.status, status: t.status }
        }).filter((item): item is NonNullable<typeof item> => item != null)
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

    return () => {
      unsub()
    }
  }, [status.type, gatePhase])

  useEffect(() => {
    if (status.type !== "ok") return
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
  }, [status.type, buildActive])

  useEffect(() => {
    if (status.type !== "ok") return
    if (!deployActive) return

    type Phase = "saving-config" | "check" | "deleting" | "deploying"
    const mode = deployModeRef.current
    const phaseRef: { current: Phase } = { current: mode === "auto" ? "check" : mode === "deploy" ? "saving-config" : "deleting" }
    const seenVMsRef: { current: Set<string> } = { current: new Set() }
    const playRecapRef: { current: string[] | null } = { current: null }

    const VM_LABELS: Record<string, string> = {
      router: "router-debian11-x64",
      kali: "attacker-kali",
      windows: "win11-22h2",
    }

    const VM_NODE_IDS: Record<string, string> = {
      router: "check-vms",
      kali: "deploy-kali",
      windows: "deploy-windows",
    }

    const VM_ORDER = ["router", "kali", "windows"]

    if (mode === "reset") {
      setTimelineItems((prev) => {
        const capped = prev.length >= 10 ? prev.slice(prev.length - 9) : prev
        return [...capped, { id: "reset-delete", title: "Removing existing VMs", description: "deleting...", status: "building" }]
      })
      backendWs.send({ type: "deleteRangeVMs", all: true })
    } else if (mode === "deploy") {
      deployModeRef.current = "auto"
      setTimelineItems((prev) => {
        const capped = prev.length >= 10 ? prev.slice(prev.length - 9) : prev
        return [...capped, { id: "deploy-save", title: "Saving configuration", description: "sending config...", status: "building" }]
      })
      backendWs.send({ type: "setRangeConfig", yaml: rangeYaml! })
    }

    const unsub = backendWs.subscribe((data) => {
      if (mode === "deploy" && data.type === "setRangeConfig" && phaseRef.current === "saving-config") {
        serverYamlRef.current = lastSavedDraftRef.current
        phaseRef.current = "deploying"
        setTimelineItems((prev) =>
          prev.map((item) =>
            item.id === "deploy-save"
              ? { ...item, title: "Configuration saved", description: "", status: "built" }
              : item
          )
        )
        setTimelineItems((prev) => [
          ...prev,
          { id: "deploy-rebuilding", title: "Deploying range", description: "deploying VMs...", status: "building" },
        ])
        backendWs.send({ type: "subscribe", channel: "rangeStatus" })
        backendWs.send({ type: "deployAllBaseVMs", skipConfigGeneration: true })
        return
      }

      if (mode === "reset" && data.type === "deleteRangeVMs" && phaseRef.current === "deleting") {
        phaseRef.current = "deploying"
        seenVMsRef.current = new Set()
        setTimelineItems((prev) => [
          ...prev.map((item) =>
            item.id === "reset-delete"
              ? { ...item, title: "Existing VMs removed", description: "", status: "built" }
              : item
          ),
          { id: "reset-rebuilding", title: "Rebuilding range", description: "deploying VMs...", status: "building" },
        ])
        backendWs.send({ type: "subscribe", channel: "rangeStatus" })
        backendWs.send({ type: "deployAllBaseVMs" })
        return
      }

      if (data.type === "deleteRangeVMs") {
        if (phaseRef.current !== "deleting") return
        phaseRef.current = "deploying"
        seenVMsRef.current = new Set()
        if (mode === "reset") {
          setTimelineItems((prev) => [
            ...prev.map((item) =>
              item.id === "reset-delete"
                ? { ...item, title: "Existing VMs removed", description: "", status: "built" }
                : item
            ),
            { id: "reset-rebuilding", title: "Rebuilding range", description: "deploying VMs...", status: "building" },
          ])
        } else {
          setTimelineItems((prev) => {
            const updated = prev.map((item) =>
              item.id === "check-vms"
                ? { ...item, title: "Deploying range", description: "starting deployment...", status: "building" }
                : item
            )
            if (!updated.some((item) => item.id === "check-vms")) {
              return [...updated, { id: "check-vms", title: "Deploying range", description: "starting deployment...", status: "building" }]
            }
            return updated
          })
        }
        backendWs.send({ type: "subscribe", channel: "rangeStatus" })
        backendWs.send({ type: "deployAllBaseVMs" })
        return
      }

      if (data.type !== "rangeStatus") return

      const raw = data.result
      type VmInfo = { name: string; poweredOn?: boolean }
      let result: VmInfo[] = []
      if (Array.isArray(raw)) {
        if (raw.length > 0 && typeof raw[0] === "object" && raw[0] !== null && "name" in raw[0]) {
          result = raw as VmInfo[]
        } else if (raw.length === 2 && Array.isArray(raw[0])) {
          result = raw[0] as VmInfo[]
        }
      }

      const routerFound = result.find((vm) => vm.name.endsWith("router-debian11-x64"))
      const kaliFound = result.find((vm) => vm.name.endsWith("attacker-kali"))
      const windowsFound = result.find((vm) => vm.name.endsWith("win11-22h2"))

      if (mode === "deploy" && phaseRef.current === "deploying" && !vmsCapturedRef.current) {
        vmsBeforeDeployRef.current = result.map(vm => vm.name)
        vmsCapturedRef.current = true
      }

      const latestLog = data.latestLog as string | undefined
      const playRecap = data.playRecap as string[] | null | undefined
      if (playRecap && phaseRef.current === "deploying") playRecapRef.current = playRecap

      if (phaseRef.current === "check") {
        if (routerFound && kaliFound && windowsFound) {
          setTimelineItems((prev) =>
            prev.map((item) =>
              item.id === "check-vms"
                ? { ...item, title: "router-debian11-x64 is already deployed", description: "", status: "built" }
                : item
            )
          )
          setTimeout(() => {
            setTimelineItems((prev) => [
              ...prev,
              { id: "deploy-kali", title: "attacker-kali is already deployed", description: "", status: "built" },
            ])
          }, 200)
          setTimeout(() => {
            setTimelineItems((prev) => [
              ...prev,
              { id: "deploy-windows", title: "win11-22h2 is already deployed", description: "", status: "built" },
            ])
          }, 400)
          setTimeout(() => {
            setTimelineItems((prev) => [
              ...prev,
              { id: "caldera-setup", title: "Installing ansible script on attacker-kali", description: "Checking Caldera status...", status: "building" },
            ])
            setCalderaActive(true)
            backendWs.send({ type: "checkCaldera", label: "kali" })
          }, 600)
          setDeployActive(false)
          setDeploymentStatus("Deployed")
          unsub()
          return
        }
        phaseRef.current = "deleting"
        setTimelineItems((prev) =>
          prev.map((item) =>
            item.id === "check-vms"
              ? { ...item, title: "Cleaning up existing VMs", description: "deleting before redeploy...", status: "building" }
              : item
          )
        )
        backendWs.send({ type: "deleteRangeVMs", all: true })
        return
      }

      if (phaseRef.current === "deleting") return

      if (mode === "reset") {
        if (latestLog) {
          setTimelineItems((prev) =>
            prev.map((item) =>
              item.id === "reset-rebuilding"
                ? { ...item, description: latestLog }
                : item
            )
          )
        }

        if (playRecapRef.current) {
          const expected = ["router-debian11-x64", "attacker-kali", "win11-22h2"]
          const allOk = expected.every((suffix) => {
            const line = playRecapRef.current!.find((l) => l.includes(suffix))
            if (!line) return false
            const unreachable = line.match(/unreachable=(\d+)/)?.[1]
            const failed = line.match(/failed=(\d+)/)?.[1]
            return unreachable === "0" && failed === "0"
          })

          setTimelineItems((prev) => [
            ...prev.map((item) =>
              item.id === "reset-rebuilding"
                ? { ...item, title: "Range rebuilt", description: allOk ? "" : "completed with errors", status: allOk ? "built" : "error" }
                : item
            ),
            {
              id: "caldera-setup",
              title: "Installing ansible script on attacker-kali",
              description: "Checking Caldera status...",
              status: "building",
            },
          ])
          setCalderaActive(true)
          backendWs.send({ type: "checkCaldera", label: "kali" })
          setDeployActive(false)
          setDeploymentStatus("Deployed")
          setIsDeploying(false)
          unsub()
          backendWs.send({ type: "unsubscribe", channel: "rangeStatus" })
        }
        return
      }

      if (mode === "deploy") {
        if (latestLog) {
          setTimelineItems((prev) =>
            prev.map((item) =>
              item.id === "deploy-rebuilding"
                ? { ...item, description: latestLog }
                : item
            )
          )
        }

        if (playRecapRef.current) {
          const allOk = parsePlayRecap(playRecapRef.current)

          const currentVMs = result.map(vm => vm.name)
          const newVMs = currentVMs.filter(name => !vmsBeforeDeployRef.current.includes(name))

          setTimelineItems((prev) => [
            ...prev.map((item) =>
              item.id === "deploy-rebuilding"
                ? { ...item, title: "Range deployed", description: allOk ? "" : "completed with errors", status: allOk ? "built" : "error" }
                : item
            ),
          ])

          if (newVMs.length > 0) {
            const newVMLabels = newVMs.map(name => name.replace(/^ty-/, "")).join(", ")
            setTimelineItems((prev) => [
              ...prev,
              {
                id: "post-deploy-snapshot",
                title: `Preparing golden image for ${newVMLabels}`,
                description: `Creating base-clean snapshot for newly deployed VMs...`,
                status: "building",
              },
            ])
            setPostDeploySnapshotActive(true)
            backendWs.send({ type: "prepareGoldenImage", vmNames: newVMs })
          }

          setDeployActive(false)
          setDeploymentStatus("Deployed")
          setIsDeploying(false)
          unsub()
          backendWs.send({ type: "unsubscribe", channel: "rangeStatus" })
        }
        return
      }

      const vmPresence: Record<string, boolean> = {
        router: !!routerFound,
        kali: !!kaliFound,
        windows: !!windowsFound,
      }

      for (const vm of VM_ORDER) {
        if (vmPresence[vm] && !seenVMsRef.current.has(vm)) {
          seenVMsRef.current.add(vm)
          const prevVMIndex = VM_ORDER.indexOf(vm) - 1
          const prevVM = prevVMIndex >= 0 ? VM_ORDER[prevVMIndex] : null

          if (prevVM && seenVMsRef.current.has(prevVM)) {
            const prevNodeId = VM_NODE_IDS[prevVM]
            const prevLabel = VM_LABELS[prevVM]
            setTimelineItems((prev) =>
              prev.map((item) =>
                item.id === prevNodeId
                  ? { ...item, title: `Finished deploying ${prevLabel}`, description: "", status: "built" }
                  : item
              )
            )
          }

          const nodeId = VM_NODE_IDS[vm]
          const label = VM_LABELS[vm]
          if (nodeId === "check-vms") {
            setTimelineItems((prev) =>
              prev.map((item) =>
                item.id === "check-vms"
                  ? { ...item, title: `Deploying ${label}`, description: latestLog || "starting deployment...", status: "building" }
                  : item
              )
            )
          } else {
            setTimelineItems((prev) => {
              if (prev.some(item => item.id === nodeId)) {
                return prev.map((item) =>
                  item.id === nodeId
                    ? { ...item, title: `Deploying ${label}`, description: latestLog || "starting deployment...", status: "building" }
                    : item
                )
              }
              return [...prev, { id: nodeId, title: `Deploying ${label}`, description: latestLog || "starting deployment...", status: "building" }]
            })
          }
          
        }
      }

      if (latestLog) {
        setTimelineItems((prev) => {
          let targetIdx = -1
          for (let i = prev.length - 1; i >= 0; i--) {
            if (prev[i].status === "building") { targetIdx = i; break }
          }
          if (targetIdx === -1) return prev
          return prev.map((item, idx) =>
            idx === targetIdx ? { ...item, description: latestLog } : item
          )
        })
      }

      if (playRecapRef.current) {
        const expected = ["router-debian11-x64", "attacker-kali", "win11-22h2"]
        const allOk = expected.every((suffix) => {
          const line = playRecapRef.current!.find((l) => l.includes(suffix))
          if (!line) return false
          const unreachable = line.match(/unreachable=(\d+)/)?.[1]
          const failed = line.match(/failed=(\d+)/)?.[1]
          return unreachable === "0" && failed === "0"
        })

        const nodeLabels: Record<string, string> = {
          "check-vms": "router-debian11-x64",
          "deploy-kali": "attacker-kali",
          "deploy-windows": "win11-22h2",
        }
        setTimelineItems((prev) => {
          let updated = prev.map((item) => {
            const label = nodeLabels[item.id]
            if (label) {
              return { ...item, title: `Finished deploying ${label}`, description: allOk ? "" : "completed with errors", status: allOk ? "built" : "error" }
            }
            return item
          })
          if (!updated.some(item => item.id === "deploy-kali")) {
            updated = [...updated, { id: "deploy-kali", title: "Finished deploying attacker-kali", description: allOk ? "" : "completed with errors", status: allOk ? "built" : "error" }]
          }
          if (!updated.some(item => item.id === "deploy-windows")) {
            updated = [...updated, { id: "deploy-windows", title: "Finished deploying win11-22h2", description: allOk ? "" : "completed with errors", status: allOk ? "built" : "error" }]
          }
          return [...updated, {
            id: "caldera-setup",
            title: "Installing ansible script on attacker-kali",
            description: "Checking Caldera status...",
            status: "building",
          }]
        })
        setCalderaActive(true)
        backendWs.send({ type: "checkCaldera", label: "kali" })
        setDeployActive(false)
        setDeploymentStatus("Deployed")
        setIsDeploying(false)
        unsub()
        backendWs.send({ type: "unsubscribe", channel: "rangeStatus" })
      }
    })

    if (mode === "auto") {
      backendWs.send({ type: "rangeStatus" })
    }

    return () => {
      backendWs.send({ type: "unsubscribe", channel: "rangeStatus" })
      for (const t of timersRef.current) clearTimeout(t)
      timersRef.current = []
      unsub()
    }
  }, [status.type, deployActive])

  useEffect(() => {
    if (status.type !== "ok") return
    if (!deployActive) return

    const unsub = backendWs.subscribe((data) => {
      if (data.type !== "getRangeConfig") return
      const result = data.result as { result?: string } | undefined
      const yaml = result?.result
      if (yaml) {
        setRangeYaml(yaml)
        lastSavedDraftRef.current = yaml
        serverYamlRef.current = yaml
      }
      unsub()
    })
    backendWs.send({ type: "getRangeConfig" })

    return () => unsub()
  }, [status.type, deployActive])

  useEffect(() => {
    if (status.type !== "ok") return
    if (!deployActive) return

    const unsub = backendWs.subscribe((data) => {
      if (data.type !== "systemInfo") return
      const result = data.result as { totalCpu?: number; totalRam?: number } | undefined
      if (result && result.totalCpu != null && result.totalRam != null) {
        setSystemInfo(result as { totalCpu: number; totalRam: number })
      }
      unsub()
    })
    backendWs.send({ type: "systemInfo" })

    return () => unsub()
  }, [status.type, deployActive])

  const handleRevert = () => {
    if (serverYamlRef.current !== null) {
      setRangeYaml(serverYamlRef.current)
      lastSavedDraftRef.current = serverYamlRef.current
      setYamlErrors([])
    }
    setRevertStatus("success")
    const t = setTimeout(() => setRevertStatus("idle"), 3000)
    timersRef.current.push(t)
  }

  const handleSave = () => {
    if (!rangeYaml) return
    if (lastSavedDraftRef.current !== null && isYamlContentEqual(rangeYaml, lastSavedDraftRef.current)) {
      setSaveStatus("no-changes")
      const t = setTimeout(() => setSaveStatus("idle"), 3000)
      timersRef.current.push(t)
      return
    }
    const { valid, errors } = validateRangeYaml(rangeYaml)
    setYamlErrors(errors)
    if (!valid) return
    lastSavedDraftRef.current = rangeYaml
    setSaveStatus("success")
    const t = setTimeout(() => setSaveStatus("idle"), 3000)
    timersRef.current.push(t)
  }

  const handleReset = () => {
    setIsDeploying(true)
    setDeploymentStatus("Deploying")
    deployModeRef.current = "reset"
    setDeployActive(true)
  }

  const handleDeploy = () => {
    if (rangeYaml) {
      lastSavedDraftRef.current = rangeYaml
    }
    setIsDeploying(true)
    setDeploymentStatus("Deploying")
    deployModeRef.current = "deploy"
    vmsCapturedRef.current = false
    vmsBeforeDeployRef.current = []
    setDeployActive(true)
  }

  const handleYamlChange = (yaml: string) => {
    setRangeYaml(yaml)
    setYamlErrors([])
  }

  useEffect(() => {
    if (status.type !== "ok") return
    if (!calderaActive) return

    const unsub = backendWs.subscribe((data) => {
      if (data.type === "checkCaldera") {
        const error = data.error as string | undefined
        const result = data.result as { calderaInstalled?: boolean } | undefined
        if (!error && result?.calderaInstalled) {
          setTimelineItems((prev) => [
            ...prev.map((item) =>
              item.id === "caldera-setup"
                ? { ...item, description: "Caldera already installed", status: "built" }
                : item
            ),
            { id: "golden-image", title: `Preparing golden image for ${GOLDEN_IMAGE_VMS[0].vm}`, description: `Creating snapshot if golden image does not exist for ${GOLDEN_IMAGE_VMS[0].vm}...`, status: "building" },
          ])
          setCalderaActive(false)
          setGoldenImageActive(true)
          backendWs.send({ type: "prepareGoldenImage" })
          unsub()
        } else {
          setTimelineItems((prev) =>
            prev.map((item) =>
              item.id === "caldera-setup"
                ? { ...item, description: "Running ansible playbook..." }
                : item
            )
          )
          backendWs.send({ type: "runAnsibleScript", label: "kali", playbook: "./server/kaliAnsibleStart.yml" })
        }
        return
      }

      if (data.type === "ansibleLog" && data.line) {
        calderaLogRef.current = data.line as string
        setTimelineItems((prev) =>
          prev.map((item) =>
            item.id === "caldera-setup"
              ? { ...item, description: data.line as string }
              : item
          )
        )
        return
      }

      if (data.type === "runAnsibleScript") {
        const error = data.error as string | undefined
        if (error) {
          setTimelineItems((prev) =>
            prev.map((item) =>
              item.id === "caldera-setup"
                ? { ...item, description: error, status: "error" }
                : item
            )
          )
          setCalderaActive(false)
          setDeployActive(false)
          setDeploymentStatus("Error")
          setIsDeploying(false)
          unsub()
          return
        }
        const result = data.result as { ansible?: { success?: boolean; playRecap?: string[] } } | undefined
        const ansible = result?.ansible
        if (ansible?.success) {
          setTimelineItems((prev) => [
            ...prev.map((item) =>
              item.id === "caldera-setup"
                ? { ...item, description: "Caldera installed successfully", status: "built" }
                : item
            ),
            { id: "golden-image", title: `Preparing golden image for ${GOLDEN_IMAGE_VMS[0].vm}`, description: `Creating snapshot if golden image does not exist for ${GOLDEN_IMAGE_VMS[0].vm}...`, status: "building" },
          ])
          setCalderaActive(false)
          setGoldenImageActive(true)
          backendWs.send({ type: "prepareGoldenImage" })
          unsub()
        } else {
          const recapLines = ansible?.playRecap ?? []
          const description = recapLines.length > 0 ? recapLines.join(" ") : "Ansible playbook failed"
          setTimelineItems((prev) =>
            prev.map((item) =>
              item.id === "caldera-setup"
                ? { ...item, description, status: "error" }
                : item
            )
          )
          setCalderaActive(false)
          setDeployActive(false)
          setDeploymentStatus("Error")
          setIsDeploying(false)
          unsub()
        }
      }
    })

    return () => { unsub() }
  }, [status.type, calderaActive])

  useEffect(() => {
    if (status.type !== "ok") return
    if (!goldenImageActive) return

    const unsub = backendWs.subscribe((data) => {
      if (data.type !== "prepareGoldenImage") return

      const prepared = (data.result?.prepared ?? []) as GoldenImageResult[]

      if (prepared.length === 0) {
        setGoldenImageActive(false)
        setDeploymentStatus("Deployed")
        onCompleteRef.current()
        unsub()
        return
      }

      const allExisted = prepared.every((p) => p.created === false && !p.error)

      if (allExisted) {
        setTimelineItems((prev) =>
          prev.map((item) =>
            item.id === "golden-image"
              ? {
                  ...item,
                  title: "Base Snapshots already exist",
                  description: prepared.map((p) => p.ip ? `${p.vm} (${p.ip})` : p.vm).join(", "),
                  status: "built",
                }
              : item,
          ),
        )
        setGoldenImageActive(false)
        setDeploymentStatus("Deployed")
        onCompleteRef.current()
        unsub()
      } else {
        for (let i = 1; i <= prepared.length; i++) {
          const timer = setTimeout(() => {
            if (i < prepared.length) {
              const vm = prepared[i]
              setTimelineItems((prev) =>
                prev.map((item) =>
                  item.id === "golden-image"
                    ? {
                        ...item,
                        title: `Preparing golden image for ${vm.label}`,
                        description: `Creating snapshot if golden image does not exist for ${vm.vm}...`,
                        status: "building",
                      }
                    : item,
                ),
              )
            } else {
              setTimelineItems((prev) =>
                prev.map((item) =>
                  item.id === "golden-image"
                    ? {
                        ...item,
                        title: "Snapshots taken for all VMs",
                        description: prepared.map((p) => p.ip ? `${p.vm} (${p.ip})` : p.vm).join(", "),
                        status: "built",
                      }
                    : item,
                ),
              )
              setGoldenImageActive(false)
              setDeploymentStatus("Deployed")
              onCompleteRef.current()
              unsub()
            }
          }, i * 1200)
          timersRef.current.push(timer)
        }
      }
    })

    return () => {
      for (const t of timersRef.current) clearTimeout(t)
      timersRef.current = []
      unsub()
    }
  }, [status.type, goldenImageActive])

  useEffect(() => {
    if (status.type !== "ok") return
    if (!postDeploySnapshotActive) return

    const unsub = backendWs.subscribe((data) => {
      if (data.type !== "prepareGoldenImage") return

      const prepared = (data.result?.prepared ?? []) as GoldenImageResult[]

      if (prepared.length === 0) {
        setPostDeploySnapshotActive(false)
        vmsCapturedRef.current = false
        onCompleteRef.current()
        unsub()
        return
      }

      const allExisted = prepared.every((p) => p.created === false && !p.error)

      if (allExisted) {
        setTimelineItems((prev) =>
          prev.map((item) =>
            item.id === "post-deploy-snapshot"
              ? {
                  ...item,
                  title: "Base Snapshots already exist",
                  description: prepared.map((p) => p.ip ? `${p.vm} (${p.ip})` : p.vm).join(", "),
                  status: "built",
                }
              : item,
          ),
        )
      } else {
        setTimelineItems((prev) =>
          prev.map((item) =>
            item.id === "post-deploy-snapshot"
              ? {
                  ...item,
                  title: "Snapshots taken for new VMs",
                  description: prepared.map((p) => p.ip ? `${p.vm} (${p.ip})` : p.vm).join(", "),
                  status: "built",
                }
              : item,
          ),
        )
      }

      setPostDeploySnapshotActive(false)
      vmsCapturedRef.current = false
      onCompleteRef.current()
      unsub()
    })

    return () => { unsub() }
  }, [status.type, postDeploySnapshotActive])

  const yamlReady = timelineBuiltOnceRef.current && snapshotsTaken && rangeYaml !== null
  const saveDisabled = saveStatus !== "idle"

  return {
    status,
    connect,
    showGuide,
    setShowGuide,
    gatePhase,
    setGatePhase,
    templatesError,
    setTemplatesError,
    setBuildActive,
    timelineItems,
    yamlReady,
    templateItems,
    deploymentStatus,
    isDeploying,
    systemInfo,
    rangeYaml,
    yamlErrors,
    saveStatus,
    revertStatus,
    saveDisabled,
    handleYamlChange,
    handleSave,
    handleRevert,
    handleReset,
    handleDeploy,
  }
}