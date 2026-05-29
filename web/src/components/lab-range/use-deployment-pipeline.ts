import { useState, useEffect, useRef, useCallback } from "react"
import * as backendWs from "@/lib/backend-ws"
import type { HealthCheckStatus } from "@/hooks/use-health-check"
import type { TimelineItem } from "./use-lab-range-state"
import type { DeploymentStatus } from "@/components/ui/tabs-fancy"

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

const EXPECTED_VMS = ["router-debian11-x64", "attacker-kali", "win11-22h2"]

const NODE_LABELS: Record<string, string> = {
  "check-vms": "router-debian11-x64",
  "deploy-kali": "attacker-kali",
  "deploy-windows": "win11-22h2",
}

function parsePlayRecap(playRecap: string[]): boolean {
  return EXPECTED_VMS.every((suffix) => {
    const line = playRecap.find((l) => l.includes(suffix))
    if (!line) return false
    const unreachable = line.match(/unreachable=(\d+)/)?.[1]
    const failed = line.match(/failed=(\d+)/)?.[1]
    return unreachable === "0" && failed === "0"
  })
}

function isVmPresent(result: Array<{ name: string }>, suffix: string): boolean {
  return !!result.find((vm) => vm.name.endsWith(suffix))
}

export interface UseDeploymentPipelineDeps {
  statusType: HealthCheckStatus["type"]
  deployActive: boolean
  redeployRef: React.MutableRefObject<boolean>
  rangeYaml: string | null
  lastSavedDraftRef: React.MutableRefObject<string | null>
  serverYamlRef: React.MutableRefObject<string | null>
  timersRef: React.MutableRefObject<ReturnType<typeof setTimeout>[]>
  setTimelineItems: React.Dispatch<React.SetStateAction<TimelineItem[]>>
  setDeploymentStatus: React.Dispatch<React.SetStateAction<DeploymentStatus>>
  setIsDeploying: React.Dispatch<React.SetStateAction<boolean>>
  setCalderaActive: React.Dispatch<React.SetStateAction<boolean>>
  setDeployActive: React.Dispatch<React.SetStateAction<boolean>>
}

export function useDeploymentPipeline({
  statusType,
  deployActive,
  redeployRef,
  rangeYaml,
  lastSavedDraftRef,
  serverYamlRef,
  timersRef,
  setTimelineItems,
  setDeploymentStatus,
  setIsDeploying,
  setCalderaActive,
  setDeployActive,
}: UseDeploymentPipelineDeps) {
  const [timelineItems, setTimelineItemsLocal] = useState<TimelineItem[]>([])

  useEffect(() => {
    if (statusType !== "ok") return
    if (!deployActive) return

    type Phase = "saving-config" | "check" | "deleting" | "deploying"
    const isRedeploy = redeployRef.current
    const phaseRef: { current: Phase } = { current: isRedeploy ? "saving-config" : "check" }
    const seenVMsRef: { current: Set<string> } = { current: new Set() }
    const playRecapRef: { current: string[] | null } = { current: null }

    if (isRedeploy) {
      redeployRef.current = false
      setTimelineItemsLocal((prev) => {
        const capped = prev.length >= 10 ? prev.slice(prev.length - 9) : prev
        return [...capped, { id: "redeploy-save", title: "Saving configuration", description: "sending config...", status: "building" }]
      })
      backendWs.send({ type: "setRangeConfig", yaml: rangeYaml! })
    }

    const unsub = backendWs.subscribe((data) => {
      if (isRedeploy && data.type === "setRangeConfig" && phaseRef.current === "saving-config") {
        serverYamlRef.current = lastSavedDraftRef.current
        phaseRef.current = "deleting"
        setTimelineItemsLocal((prev) =>
          prev.map((item) =>
            item.id === "redeploy-save"
              ? { ...item, title: "Configuration saved", description: "", status: "built" }
              : item
          )
        )
        setTimelineItemsLocal((prev) => [
          ...prev,
          { id: "redeploy-delete", title: "Removing existing VMs", description: "deleting...", status: "building" },
        ])
        backendWs.send({ type: "deleteRangeVMs", all: true })
        return
      }

      if (data.type === "deleteRangeVMs") {
        if (phaseRef.current !== "deleting") return
        phaseRef.current = "deploying"
        seenVMsRef.current = new Set()
        if (isRedeploy) {
          setTimelineItemsLocal((prev) => [
            ...prev.map((item) =>
              item.id === "redeploy-delete"
                ? { ...item, title: "Existing VMs removed", description: "", status: "built" }
                : item
            ),
            { id: "redeploy-rebuilding", title: "Rebuilding range", description: "deploying VMs...", status: "building" },
          ])
        } else {
          setTimelineItemsLocal((prev) => {
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

      const routerFound = isVmPresent(result, "router-debian11-x64")
      const kaliFound = isVmPresent(result, "attacker-kali")
      const windowsFound = isVmPresent(result, "win11-22h2")

      const latestLog = data.latestLog as string | undefined
      const playRecap = data.playRecap as string[] | null | undefined
      if (playRecap) playRecapRef.current = playRecap

      if (phaseRef.current === "check") {
        if (routerFound && kaliFound && windowsFound) {
          setTimelineItemsLocal((prev) =>
            prev.map((item) =>
              item.id === "check-vms"
                ? { ...item, title: "router-debian11-x64 is already deployed", description: "", status: "built" }
                : item
            )
          )
          setTimeout(() => {
            setTimelineItemsLocal((prev) => [
              ...prev,
              { id: "deploy-kali", title: "attacker-kali is already deployed", description: "", status: "built" },
            ])
          }, 200)
          setTimeout(() => {
            setTimelineItemsLocal((prev) => [
              ...prev,
              { id: "deploy-windows", title: "win11-22h2 is already deployed", description: "", status: "built" },
            ])
          }, 400)
          setTimeout(() => {
            setTimelineItemsLocal((prev) => [
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
        setTimelineItemsLocal((prev) =>
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

      if (isRedeploy) {
        if (latestLog) {
          setTimelineItemsLocal((prev) =>
            prev.map((item) =>
              item.id === "redeploy-rebuilding"
                ? { ...item, description: latestLog }
                : item
            )
          )
        }

        if (playRecapRef.current) {
          const allOk = parsePlayRecap(playRecapRef.current)

          setTimelineItemsLocal((prev) => [
            ...prev.map((item) =>
              item.id === "redeploy-rebuilding"
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

      const vmPresence: Record<string, boolean> = {
        router: routerFound,
        kali: kaliFound,
        windows: windowsFound,
      }

      for (const vm of VM_ORDER) {
        if (vmPresence[vm] && !seenVMsRef.current.has(vm)) {
          seenVMsRef.current.add(vm)
          const prevVMIndex = VM_ORDER.indexOf(vm) - 1
          const prevVM = prevVMIndex >= 0 ? VM_ORDER[prevVMIndex] : null

          if (prevVM && seenVMsRef.current.has(prevVM)) {
            const prevNodeId = VM_NODE_IDS[prevVM]
            const prevLabel = VM_LABELS[prevVM]
            setTimelineItemsLocal((prev) =>
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
            setTimelineItemsLocal((prev) =>
              prev.map((item) =>
                item.id === "check-vms"
                  ? { ...item, title: `Deploying ${label}`, description: latestLog || "starting deployment...", status: "building" }
                  : item
              )
            )
          } else {
            setTimelineItemsLocal((prev) => {
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
        setTimelineItemsLocal((prev) => {
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
        const allOk = parsePlayRecap(playRecapRef.current)
        setTimelineItemsLocal((prev) => {
          let updated = prev.map((item) => {
            const label = NODE_LABELS[item.id]
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

    if (!isRedeploy) {
      backendWs.send({ type: "rangeStatus" })
    }

    return () => {
      backendWs.send({ type: "unsubscribe", channel: "rangeStatus" })
      for (const t of timersRef.current) clearTimeout(t)
      timersRef.current = []
      unsub()
    }
  }, [statusType, deployActive])

  // Fetch range config
  useEffect(() => {
    if (statusType !== "ok") return
    if (!deployActive) return

    const unsub = backendWs.subscribe((data) => {
      if (data.type !== "getRangeConfig") return
      const result = data.result as { result?: string } | undefined
      const yaml = result?.result
      if (yaml) {
        // We need to pass this up - handled by parent
      }
      unsub()
    })
    backendWs.send({ type: "getRangeConfig" })

    return () => unsub()
  }, [statusType, deployActive])

  // Fetch system info
  useEffect(() => {
    if (statusType !== "ok") return
    if (!deployActive) return

    const unsub = backendWs.subscribe((data) => {
      if (data.type !== "systemInfo") return
      const result = data.result as { totalCpu?: number; totalRam?: number } | undefined
      if (result && result.totalCpu != null && result.totalRam != null) {
        // Handled by parent
      }
      unsub()
    })
    backendWs.send({ type: "systemInfo" })

    return () => unsub()
  }, [statusType, deployActive])

  return {
    timelineItems,
    setTimelineItems: setTimelineItemsLocal,
  }
}
