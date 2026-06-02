import { useState, useMemo } from "react"
import { Monitor } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { VncViewer } from "@/components/lab-range/vnc-viewer"
import { TermViewer } from "@/components/lab-range/term-viewer"
import type { SnapshotInfo } from "@/components/lab-range/use-lab-range-state"

export function SnapshotRightPanel({ selectedNodeId, snapshotData }: {
  selectedNodeId?: string | null
  snapshotData?: Record<string, SnapshotInfo>
}) {
  const [activeTab, setActiveTab] = useState("terminal")

  const vmHostname = useMemo(() => {
    if (!selectedNodeId) return null
    const sep = selectedNodeId.indexOf("::")
    return sep === -1 ? selectedNodeId : selectedNodeId.slice(0, sep)
  }, [selectedNodeId])

  const proxmoxID = useMemo(() => {
    if (!vmHostname || !snapshotData) return null
    return snapshotData[vmHostname]?.proxmoxID ?? null
  }, [vmHostname, snapshotData])

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
          <Button size="sm" className="active:translate-y-px">Revert</Button>
          <Button size="sm" className="active:translate-y-px">Take Snapshot</Button>
        </div>
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
