import { useState, useEffect, useRef, useMemo } from "react"
import * as backendWs from "@/lib/backend-ws"
import { useHealthCheck, type HealthCheckStatus } from "@/hooks/use-health-check"
import type { DeploymentStatus } from "@/components/ui/tabs-fancy"

export type GatePhase = "checking-templates" | "templates-error" | "templates-incomplete" | "show-content"
export type TimelineItem = { id: string; title: string; description: string; status?: string }
export type TemplateItem = { id: number; label: string; subText: string; icon: string }
export type CustomVmConfig = { id: string; hostname: string; config: string; parsedConfig: Record<string, unknown> }

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

function parsePlayRecap(playRecap: string[], expectedVms?: string[]): boolean {
  const vms = expectedVms ?? EXPECTED_VMS
  return vms.every((suffix) => {
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
  const [deploymentStatus, setDeploymentStatus] = useState<DeploymentStatus>("Not Deployed")
  const [isDeploying, setIsDeploying] = useState(false)
  const [systemInfo, setSystemInfo] = useState<{ totalCpu: number; totalRam: number } | null>(null)
  const [vmDefs, setVmDefs] = useState<Record<string, Record<string, unknown>> | null>(null)
  // Dynamic VMs appended by the user at runtime. Merged with static vmDefs
  // to produce enrichedVmDefs for topology visualization. Use setDynamicVms
  // to append VMs — topology will reactively update.
  const [dynamicVms, setDynamicVms] = useState<Record<string, Record<string, unknown>>>({})
  const builtSentRef = useRef<Set<string>>(new Set())
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const calderaLogRef = useRef<string>("")
  const timelineBuiltOnceRef = useRef(false)
  const [snapshotsTaken, setSnapshotsTaken] = useState(false)
  const deployModeRef = useRef<"auto" | "reset" | "singleDeploy">("auto")
  const selectedDeployVmRef = useRef<string>("")
  const selectedDeployYamlRef = useRef<string>("")
  const deployedVmNameRef = useRef<string>("")
  const [postDeploySnapshotActive, setPostDeploySnapshotActive] = useState(false)
  const [deployingVmHostname, setDeployingVmHostname] = useState<string | null>(null)
  const [customVmConfigs, setCustomVmConfigs] = useState<Record<string, CustomVmConfig>>({})
  const [rangeVmNames, setRangeVmNames] = useState<string[]>([])
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

    type Phase = "check" | "deleting" | "deploying"
    const mode = deployModeRef.current
    const phaseRef: { current: Phase } = { current: mode === "auto" ? "check" : "deleting" }
    const seenVMsRef: { current: Set<string> } = { current: new Set() }
    const playRecapRef: { current: string[] | null } = { current: null }
    const playRecapPassStartRef: { current: number } = { current: 0 }
    const proxmoxVMsRef: { current: string[] } = { current: [] }
    const rangeStatusReceivedRef: { current: boolean } = { current: false }

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
    } else if (mode === "singleDeploy") {
      setTimelineItems((prev) => {
        const capped = prev.length >= 10 ? prev.slice(prev.length - 9) : prev
        return [...capped, { id: "deploy-rebuilding", title: "Deploying VM", description: "checking existing VMs...", status: "building" }]
      })
      backendWs.send({ type: "deployCustomVM", hostname: selectedDeployVmRef.current, yaml: selectedDeployYamlRef.current })
    }

    const unsub = backendWs.subscribe((data) => {
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

      if (mode === "singleDeploy" && data.type === "deployCustomVM") {
        const error = data.error as string | undefined
        const result = data.result as { deployed?: string | null; alreadyDeployed?: boolean; vmName?: string; deletedExisting?: boolean } | undefined

        if (error) {
          setTimelineItems((prev) =>
            prev.map((item) =>
              item.id === "deploy-rebuilding"
                ? { ...item, title: "Deploy failed", description: error, status: "error" }
                : item
            )
          )
          setDeployActive(false)
          setDeploymentStatus("Error")
          setIsDeploying(false)
          unsub()
          return
        }

        if (result?.alreadyDeployed) {
          setTimelineItems((prev) =>
            prev.map((item) =>
              item.id === "deploy-rebuilding"
                ? { ...item, title: "VM already deployed", description: "base-clean snapshot exists", status: "built" }
                : item
            )
          )
          setDeployActive(false)
          setDeploymentStatus("Deployed")
          setIsDeploying(false)
          unsub()
          return
        }

        if (result?.vmName) {
          deployedVmNameRef.current = result.vmName
        }

        phaseRef.current = "deploying"
        setTimelineItems((prev) =>
          prev.map((item) =>
            item.id === "deploy-rebuilding"
              ? { ...item, title: `Deploying ${result?.vmName ?? selectedDeployVmRef.current}`, description: result?.deletedExisting ? "deleted existing VM, deploying..." : "deploying...", status: "building" }
              : item
          )
        )
        backendWs.send({ type: "subscribe", channel: "rangeStatus" })
        return
      }

      if (data.type === "listProxmoxVMs") {
        const result = data.result as string[] | undefined
        if (result) proxmoxVMsRef.current = result
        if (mode === "auto" && phaseRef.current === "check" && rangeStatusReceivedRef.current) {
          runVmCheck()
        }
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

      const proxmoxVMs = proxmoxVMsRef.current
      const routerFound = result.find((vm) => vm.name.endsWith("router-debian11-x64")) || proxmoxVMs.some((n) => n.endsWith("router-debian11-x64"))
      const kaliFound = result.find((vm) => vm.name.endsWith("attacker-kali")) || proxmoxVMs.some((n) => n.endsWith("attacker-kali"))
      const windowsFound = result.find((vm) => vm.name.endsWith("win11-22h2")) || proxmoxVMs.some((n) => n.endsWith("win11-22h2"))

      const latestLog = data.latestLog as string | undefined
      const playRecap = data.playRecap as string[] | null | undefined
      if (phaseRef.current === "deploying") playRecapRef.current = playRecap || null

      const runVmCheck = () => {
        if (phaseRef.current !== "check") return

        if (routerFound && kaliFound && windowsFound) {
          setTimelineItems((prev) =>
            prev.map((item) =>
              item.id === "check-vms"
                ? { ...item, title: "router-debian11-x64 is already deployed", description: "", status: "built" }
                : item
            )
          )
          setTimeout(() => {
            setTimelineItems((prev) => {
              if (prev.some(item => item.id === "deploy-kali")) {
                return prev.map((item) =>
                  item.id === "deploy-kali"
                    ? { ...item, title: "attacker-kali is already deployed", description: "", status: "built" }
                    : item
                )
              }
              return [...prev, { id: "deploy-kali", title: "attacker-kali is already deployed", description: "", status: "built" }]
            })
          }, 200)
          setTimeout(() => {
            setTimelineItems((prev) => {
              if (prev.some(item => item.id === "deploy-windows")) {
                return prev.map((item) =>
                  item.id === "deploy-windows"
                    ? { ...item, title: "win11-22h2 is already deployed", description: "", status: "built" }
                    : item
                )
              }
              return [...prev, { id: "deploy-windows", title: "win11-22h2 is already deployed", description: "", status: "built" }]
            })
          }, 400)
          setTimeout(() => {
            setTimelineItems((prev) => {
              if (prev.some(item => item.id === "caldera-setup")) {
                return prev.map((item) =>
                  item.id === "caldera-setup"
                    ? { ...item, title: "Installing ansible script on attacker-kali", description: "Checking Caldera status...", status: "building" }
                    : item
                )
              }
              return [...prev, { id: "caldera-setup", title: "Installing ansible script on attacker-kali", description: "Checking Caldera status...", status: "building" }]
            })
            setCalderaActive(true)
            backendWs.send({ type: "checkCaldera", label: "kali" })
          }, 600)
          setDeployActive(false)
          setDeploymentStatus("Deployed")
          unsub()
          return
        }

        setTimelineItems((prev) =>
          prev.map((item) =>
            item.id === "check-vms"
              ? { ...item, title: "VM check inconclusive — halted for analysis", description: `Ludus API: ${result.map(v => v.name).join(", ") || "empty"} | qm list: ${proxmoxVMs.join(", ") || "empty"}`, status: "error" }
              : item
          )
        )
        setDeployActive(false)
        setDeploymentStatus("Halted")
        unsub()
      }

      if (mode === "auto" && phaseRef.current === "check") {
        rangeStatusReceivedRef.current = true
        if (proxmoxVMs.length > 0) {
          runVmCheck()
        }
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

      if (mode === "singleDeploy") {
        if (latestLog) {
          setTimelineItems((prev) =>
            prev.map((item) =>
              item.id === "deploy-rebuilding"
                ? { ...item, description: latestLog }
                : item
            )
          )
        }

        if (!playRecapRef.current) {
          playRecapPassStartRef.current = 0
          return
        }

        const vmName = deployedVmNameRef.current || selectedDeployVmRef.current
        const recapContainsVM = playRecapRef.current.some((l) => l.includes(vmName))

        if (!recapContainsVM) {
          playRecapPassStartRef.current = 0
          return
        }

        const allOk = parsePlayRecap(playRecapRef.current, [vmName])

        if (!allOk) {
          playRecapPassStartRef.current = 0
          return
        }

        const now = Date.now()
        if (!playRecapPassStartRef.current) {
          playRecapPassStartRef.current = now
          return
        }

        if (now - playRecapPassStartRef.current < 5000) return

        setTimelineItems((prev) => [
          ...prev.map((item) =>
            item.id === "deploy-rebuilding"
              ? { ...item, title: "VM deployed", description: allOk ? "" : "completed with errors", status: allOk ? "built" : "error" }
              : item
          ),
          {
            id: "post-deploy-snapshot",
            title: `Preparing golden image for ${vmName}`,
            description: `Creating base-clean snapshot...`,
            status: "building",
          },
        ])
        setPostDeploySnapshotActive(true)
        backendWs.send({ type: "prepareGoldenImage", vmNames: [vmName] })

        setDeployActive(false)
        setDeploymentStatus("Deployed")
        setIsDeploying(false)
        unsub()
        backendWs.send({ type: "unsubscribe", channel: "rangeStatus" })
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
          unsub()
          backendWs.send({ type: "unsubscribe", channel: "rangeStatus" })
      }
    })

    if (mode === "auto") {
      backendWs.send({ type: "setRangeConfig", data: { defaults: true } })
      backendWs.send({ type: "rangeStatus" })
      backendWs.send({ type: "listProxmoxVMs" })
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

  useEffect(() => {
    if (status.type !== "ok") return
    const unsub = backendWs.subscribe((data) => {
      if (data.type !== "getVmDefs") return
      setVmDefs(data.result as Record<string, Record<string, unknown>>)
      unsub()
    })
    backendWs.send({ type: "getVmDefs" })
    return () => unsub()
  }, [status.type])

  useEffect(() => {
    if (status.type !== "ok") return
    const unsub = backendWs.subscribe((data) => {
      if (data.type !== "getDeployableVmConfigs") return
      const error = data.error as string | undefined
      if (error) {
        unsub()
        return
      }
      const result = data.result as Array<{ id: string; hostname: string; config: string; parsed_config: Record<string, unknown> }> | undefined
      if (!result) {
        unsub()
        return
      }
      const configs: Record<string, CustomVmConfig> = {}
      for (const item of result) {
        configs[item.hostname] = {
          id: item.id,
          hostname: item.hostname,
          config: item.config,
          parsedConfig: item.parsed_config,
        }
      }
      setCustomVmConfigs(configs)
      unsub()
    })
    backendWs.send({ type: "getDeployableVmConfigs" })
    return () => unsub()
  }, [status.type])

  useEffect(() => {
    if (status.type !== "ok") return
    const unsub = backendWs.subscribe((data) => {
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
      const names = result.map((vm) => vm.name)
      setRangeVmNames(names)
    })
    backendWs.send({ type: "subscribe", channel: "rangeStatus" })
    backendWs.send({ type: "rangeStatus" })
    return () => {
      backendWs.send({ type: "unsubscribe", channel: "rangeStatus" })
      unsub()
    }
  }, [status.type])

  const createDeployableVmConfig = (hostname: string, config: string, parsedConfig: Record<string, unknown>): Promise<{ id: string } | { error: string }> => {
    return new Promise((resolve) => {
      const unsub = backendWs.subscribe((data) => {
        if (data.type !== "createDeployableVmConfig") return
        const error = data.error as string | undefined
        if (error) {
          unsub()
          resolve({ error })
          return
        }
        const result = data.result as { id: string; hostname: string; config: string } | undefined
        if (!result) {
          unsub()
          resolve({ error: "Empty response" })
          return
        }
        setCustomVmConfigs((prev) => ({
          ...prev,
          [result.hostname]: {
            id: result.id,
            hostname: result.hostname,
            config: result.config,
            parsedConfig,
          },
        }))
        unsub()
        resolve({ id: result.id })
      })
      backendWs.send({ type: "createDeployableVmConfig", data: { hostname, config, parsed_config: parsedConfig } })
    })
  }

  const deleteDeployableVmConfig = (id: string, hostname: string): Promise<{ success: boolean } | { error: string }> => {
    return new Promise((resolve) => {
      const unsub = backendWs.subscribe((data) => {
        if (data.type !== "deleteDeployableVmConfig") return
        const error = data.error as string | undefined
        if (error) {
          unsub()
          resolve({ error })
          return
        }
        setCustomVmConfigs((prev) => {
          const next = { ...prev }
          delete next[hostname]
          return next
        })
        unsub()
        resolve({ success: true })
      })
      backendWs.send({ type: "deleteDeployableVmConfig", data: { id } })
    })
  }

  const nonDeployedVms = useMemo(() => {
    const result: Record<string, { id: string; parsed: Record<string, unknown>; raw: string }> = {}
    for (const [hostname, config] of Object.entries(customVmConfigs)) {
      const isDeployed = rangeVmNames.some((vmName) => vmName.endsWith(hostname))
      if (!isDeployed || deployingVmHostname === hostname) {
        result[hostname] = { id: config.id, parsed: config.parsedConfig, raw: config.config }
      }
    }
    return result
  }, [customVmConfigs, rangeVmNames, deployingVmHostname])

  const deployedCustomVms = useMemo(() => {
    const result: Record<string, { id: string; parsed: Record<string, unknown>; raw: string }> = {}
    for (const [hostname, config] of Object.entries(customVmConfigs)) {
      const isDeployed = rangeVmNames.some((vmName) => vmName.endsWith(hostname))
      if (isDeployed && deployingVmHostname !== hostname) {
        result[hostname] = { id: config.id, parsed: config.parsedConfig, raw: config.config }
      }
    }
    return result
  }, [customVmConfigs, rangeVmNames, deployingVmHostname])

  const enrichedVmDefs = useMemo(() => {
    if (!vmDefs) return null
    let result = { ...vmDefs, ...dynamicVms }
    for (const [hostname, config] of Object.entries(deployedCustomVms)) {
      result[hostname] = config.parsed
    }
    return result
  }, [vmDefs, dynamicVms, deployedCustomVms])

  const handleReset = () => {
    setIsDeploying(true)
    setDeploymentStatus("Deploying")
    deployModeRef.current = "reset"
    setDeployActive(true)
  }

  const handleSingleDeploy = (vmConfig: { hostname: string; yaml: string }) => {
    selectedDeployVmRef.current = vmConfig.hostname
    selectedDeployYamlRef.current = vmConfig.yaml
    deployedVmNameRef.current = ""
    setDeployingVmHostname(vmConfig.hostname)
    setIsDeploying(true)
    setDeploymentStatus("Deploying")
    deployModeRef.current = "singleDeploy"
    setDeployActive(true)
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
      setDeployingVmHostname(null)
      setIsDeploying(false)
      onCompleteRef.current()
      unsub()
    })

    return () => { unsub() }
  }, [status.type, postDeploySnapshotActive])

  const yamlReady = timelineBuiltOnceRef.current && snapshotsTaken

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
    vmDefs,
    enrichedVmDefs,
    setDynamicVms,
    nonDeployedVms,
    deployedCustomVms,
    deployingVmHostname,
    createDeployableVmConfig,
    deleteDeployableVmConfig,
    handleReset,
    handleSingleDeploy,
  }
}