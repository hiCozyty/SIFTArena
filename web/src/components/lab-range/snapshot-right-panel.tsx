import { useState, useMemo } from "react"
import { Monitor } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"

export function SnapshotRightPanel({ selectedNodeId }: { selectedNodeId?: string | null }) {
  const [activeTab, setActiveTab] = useState("vnc")

  const { snapshotSelected, vmSelected } = useMemo(() => {
    if (!selectedNodeId) return { snapshotSelected: false, vmSelected: false }
    const isSnapshot = selectedNodeId.includes("::")
    return { snapshotSelected: isSnapshot, vmSelected: true }
  }, [selectedNodeId])

  const vncText = snapshotSelected ? "VNC coming soon" : "Select a snapshot from the left"
  const termText = vmSelected ? "Terminal coming soon" : "Select a vm from the left"

  return (
    <div className="flex-1 flex flex-col min-w-0 pt-0 pb-0 rounded-none">
      <div className="shrink-0 flex items-center justify-between gap-3 min-h-[40px] px-1">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-8">
            <TabsTrigger value="vnc" className="px-2.5 py-0.5 text-xs">
              <Monitor className="h-4 w-4" />
            </TabsTrigger>
            <TabsTrigger value="terminal" className="px-2.5 py-0.5 text-xs">
              &gt;_
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-3">
          <Button size="sm" className="active:translate-y-px">Revert</Button>
          <Button size="sm" className="active:translate-y-px">Take Snapshot</Button>
        </div>
      </div>
      <div className="flex-1 mt-1 rounded-4xl bg-muted border shadow-sm overflow-hidden">
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
              {activeTab === "vnc" ? vncText : termText}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
