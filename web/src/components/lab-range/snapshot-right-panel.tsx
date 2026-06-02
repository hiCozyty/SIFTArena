import { useState, useMemo, useCallback } from "react"
import { Monitor, Loader2 } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { VncViewer } from "@/components/lab-range/vnc-viewer"
import { TermViewer } from "@/components/lab-range/term-viewer"
import type { SnapshotInfo } from "@/components/lab-range/use-lab-range-state"
import * as backendWs from "@/lib/backend-ws"
import { executeWsOperation } from "@/lib/ws-ops"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"

export function SnapshotRightPanel({ selectedNodeId, snapshotData }: {
  selectedNodeId?: string | null
  snapshotData?: Record<string, SnapshotInfo>
}) {
  const [activeTab, setActiveTab] = useState("terminal")
  const [snapshotDialogOpen, setSnapshotDialogOpen] = useState(false)
  const [snapshotName, setSnapshotName] = useState("")
  const [snapshotting, setSnapshotting] = useState(false)
  const [revertDialogOpen, setRevertDialogOpen] = useState(false)
  const [reverting, setReverting] = useState(false)
  const [overwriteDialogOpen, setOverwriteDialogOpen] = useState(false)
  const [overwriting, setOverwriting] = useState(false)

  const vmHostname = useMemo(() => {
    if (!selectedNodeId) return null
    const sep = selectedNodeId.indexOf("::")
    return sep === -1 ? selectedNodeId : selectedNodeId.slice(0, sep)
  }, [selectedNodeId])

  const selectedSnapshotName = useMemo(() => {
    if (!selectedNodeId) return null
    const sep = selectedNodeId.indexOf("::")
    return sep === -1 ? null : selectedNodeId.slice(sep + 2)
  }, [selectedNodeId])

  const canRevert = selectedSnapshotName !== null

  const proxmoxID = useMemo(() => {
    if (!vmHostname || !snapshotData) return null
    return snapshotData[vmHostname]?.proxmoxID ?? null
  }, [vmHostname, snapshotData])

  const existingSnapshotNames = useMemo(() => {
    if (!vmHostname || !snapshotData) return new Set<string>()
    const names = snapshotData[vmHostname]?.snapshots?.map(s => s.name) ?? []
    return new Set(names)
  }, [vmHostname, snapshotData])

  const snapshotChildrenMap = useMemo(() => {
    if (!vmHostname || !snapshotData) return new Map<string, string[]>()
    const snaps = snapshotData[vmHostname]?.snapshots ?? []
    const map = new Map<string, string[]>()
    for (const s of snaps) {
      const p = s.parent || ""
      if (!map.has(p)) map.set(p, [])
      map.get(p)!.push(s.name)
    }
    return map
  }, [vmHostname, snapshotData])

  const snapshotsToDelete = useMemo(() => {
    if (!selectedSnapshotName || !vmHostname || !snapshotData) return []
    const childrenMap = snapshotChildrenMap
    if (childrenMap.size === 0) return []

    const descendants: string[] = []
    const queue = [selectedSnapshotName]
    const seen = new Set([selectedSnapshotName])
    while (queue.length > 0) {
      const cur = queue.shift()!
      const kids = childrenMap.get(cur)
      if (kids) {
        for (const kid of kids) {
          if (!seen.has(kid)) {
            seen.add(kid)
            queue.push(kid)
            if (kid !== "current") descendants.push(kid)
          }
        }
      }
    }
    return descendants
  }, [selectedSnapshotName, vmHostname, snapshotData, snapshotChildrenMap])

  const canOverwrite = useMemo(() => {
    if (!selectedSnapshotName || selectedSnapshotName === "base-clean") return false
    const kids = snapshotChildrenMap.get(selectedSnapshotName)
    if (!kids || kids.length === 0) return true
    return kids.every(k => k === "current")
  }, [selectedSnapshotName, snapshotChildrenMap])

  const isDuplicateName = existingSnapshotNames.has(snapshotName.trim())
  const isBaseClean = snapshotName.trim() === "base-clean"

  const canSnapshot = vmHostname !== null

  const handleTakeSnapshotClick = useCallback(() => {
    if (!vmHostname) return
    setSnapshotName("")
    setSnapshotDialogOpen(true)
  }, [vmHostname])

  const handleConfirmSnapshot = useCallback(async () => {
    if (!vmHostname) return
    const name = snapshotName.trim() || undefined
    setSnapshotDialogOpen(false)
    setSnapshotting(true)
    try {
      const result = await executeWsOperation({
        messageType: "saveBaseClean",
        sendFn: () => {
          backendWs.send({ type: "saveBaseClean", label: vmHostname, snapshotName: name })
        },
        ensurePaint: true,
      })
      backendWs.send({ type: "listSnapshots" })
    } catch (err) {
      console.error("[takeSnapshot] Error:", err)
    } finally {
      setSnapshotting(false)
    }
  }, [vmHostname, snapshotName])

  const handleRevertClick = useCallback(() => {
    if (!canRevert) return
    setRevertDialogOpen(true)
  }, [canRevert])

  const handleConfirmRevert = useCallback(async () => {
    if (!vmHostname || !selectedSnapshotName) return
    setRevertDialogOpen(false)
    setReverting(true)
    try {
      await executeWsOperation({
        messageType: "restoreToBaseClean",
        sendFn: () => backendWs.send({ type: "restoreToBaseClean", label: vmHostname, snapshotName: selectedSnapshotName, snapshotsToDelete: snapshotsToDelete.slice().reverse() }),
        ensurePaint: true,
      })
      backendWs.send({ type: "listSnapshots" })
    } catch (err) {
      console.error("[revert] Error:", err)
    } finally {
      setReverting(false)
    }
  }, [vmHostname, selectedSnapshotName, snapshotsToDelete])

  const handleOverwriteClick = useCallback(() => {
    if (!canOverwrite) return
    setOverwriteDialogOpen(true)
  }, [canOverwrite])

  const handleConfirmOverwrite = useCallback(async () => {
    if (!vmHostname || !selectedSnapshotName) return
    setOverwriteDialogOpen(false)
    setOverwriting(true)
    try {
      await executeWsOperation({
        messageType: "saveBaseClean",
        sendFn: () => backendWs.send({ type: "saveBaseClean", label: vmHostname, snapshotName: selectedSnapshotName }),
        ensurePaint: true,
      })
      backendWs.send({ type: "listSnapshots" })
    } catch (err) {
      console.error("[overwrite] Error:", err)
    } finally {
      setOverwriting(false)
    }
  }, [vmHostname, selectedSnapshotName])

  const showTerm = activeTab === "terminal" && proxmoxID !== null
  const showVnc = activeTab === "vnc" && proxmoxID !== null

  return (
    <div className="w-full flex-1 flex flex-col min-w-0 pt-0 pb-0 rounded-none">
      <div className="shrink-0 flex items-center justify-between gap-3 min-h-[40px] px-1">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-8">
            <TabsTrigger value="terminal" className="px-2.5 py-0.5 text-xs">
              &gt;_
            </TabsTrigger>
            <TabsTrigger value="vnc" className="px-2.5 py-0.5 text-xs">
              <Monitor className="h-4 w-4" />
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={!canRevert || snapshotting || reverting || overwriting} className="active:translate-y-px" onClick={handleRevertClick} variant={canRevert ? "destructive" : undefined}>{reverting ? <><Loader2 className="h-3.5 w-3.5 inline animate-spin" /> Reverting...</> : "Revert"}</Button>
          <Button size="sm" disabled={!canSnapshot || snapshotting || reverting || overwriting} className="active:translate-y-px" onClick={handleTakeSnapshotClick}>{snapshotting ? <><Loader2 className="h-3.5 w-3.5 inline animate-spin" /> Taking...</> : "Take Snapshot"}</Button>
          <Button size="sm" disabled={!canOverwrite || snapshotting || reverting || overwriting} className="active:translate-y-px" onClick={handleOverwriteClick}>{overwriting ? <><Loader2 className="h-3.5 w-3.5 inline animate-spin" /> Overwriting...</> : "Overwrite Snapshot"}</Button>
        </div>
        <AlertDialog open={snapshotDialogOpen} onOpenChange={setSnapshotDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Create Snapshot</AlertDialogTitle>
              <AlertDialogDescription>
                Enter a name for the new snapshot on{" "}
                <span className="font-medium text-foreground">{vmHostname}</span>.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="mt-2">
              <Input
                placeholder="e.g. after-deploy"
                value={snapshotName}
                onChange={(e) => setSnapshotName(e.target.value)}
                aria-invalid={isDuplicateName || isBaseClean || undefined}
              />
              {isBaseClean && (
                <p className="mt-1 text-xs text-destructive">
                  &quot;base-clean&quot; is protected and cannot be overwritten.
                </p>
              )}
              {isDuplicateName && (
                <p className="mt-1 text-xs text-destructive">
                  A snapshot with this name already exists on {vmHostname}.
                </p>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmSnapshot} disabled={!snapshotName.trim() || isDuplicateName || isBaseClean}>
                Create
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={revertDialogOpen} onOpenChange={setRevertDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revert Snapshot</AlertDialogTitle>
              <AlertDialogDescription>
                This will revert{" "}
                <span className="font-medium text-foreground">{vmHostname}</span>{" "}
                to snapshot{" "}
                <span className="font-medium text-foreground">{selectedSnapshotName}</span>{" "}
                and replace the current VM state.
                {snapshotsToDelete.length > 0 && (
                  <> The following snapshots will be deleted:{" "}
                    <span className="font-medium text-destructive">{snapshotsToDelete.join(", ")}</span>
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleConfirmRevert}>
                Revert
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={overwriteDialogOpen} onOpenChange={setOverwriteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Overwrite Snapshot</AlertDialogTitle>
              <AlertDialogDescription>
                This will delete and recreate snapshot{" "}
                <span className="font-medium text-foreground">{selectedSnapshotName}</span>{" "}
                on{" "}
                <span className="font-medium text-foreground">{vmHostname}</span>{" "}
                with the current VM state.
                {snapshotsToDelete.length > 0 && (
                  <> The following snapshots will be deleted:{" "}
                    <span className="font-medium text-destructive">{snapshotsToDelete.join(", ")}</span>
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleConfirmOverwrite}>
                Overwrite
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <div className="flex-1 mt-1 rounded-4xl bg-muted border shadow-sm overflow-hidden">
        {showTerm ? (
          <TermViewer key={proxmoxID} vmId={proxmoxID} className="h-full w-full" />
        ) : showVnc ? (
          <VncViewer key={proxmoxID} vmId={proxmoxID} className="h-full w-full" />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.3 }}
              className="h-full flex items-center justify-center"
            >
              <p className="text-sm text-muted-foreground">
                Select a vm from the left
              </p>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
