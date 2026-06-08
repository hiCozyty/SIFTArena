import { useState } from "react"
import { Monitor } from "lucide-react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TermViewer } from "@/components/lab-range/term-viewer"

type Status = "connecting" | "connected" | "disconnected" | "error"

const SIFT_ID = "sift"

const STATUS_COLORS: Record<Status, string> = {
  connecting: "text-amber-500",
  connected: "text-green-500",
  disconnected: "text-muted-foreground",
  error: "text-red-500",
}

export function PrototypeUI3() {
  const [activeTab, setActiveTab] = useState("vnc")
  const [vncStatus, setVncStatus] = useState<Status>("connecting")
  const [termStatus, setTermStatus] = useState<Status>("disconnected")

  const status = activeTab === "vnc" ? vncStatus : termStatus

  const apiBase = import.meta.env.VITE_API_URL || `${location.protocol}//${location.host}`
  const kasmUrl = `${apiBase}/docker-vnc/${SIFT_ID}/`

  return (
    <div className="flex h-screen flex-col">
      <div className="flex shrink-0 items-center gap-4 border-b px-6 py-3">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-8">
            <TabsTrigger value="vnc" className="px-2.5 py-0.5 text-xs gap-1.5">
              <Monitor className="h-3.5 w-3.5" />
              VNC
            </TabsTrigger>
            <TabsTrigger value="terminal" className="px-2.5 py-0.5 text-xs gap-1.5">
              &gt;_
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <span className="text-xs text-muted-foreground">
          SIFT Workstation (Docker) — sift:forensics
        </span>

        <div className="ml-auto flex items-center gap-2">
          <span className={STATUS_COLORS[status]}>●</span>
          <span className="text-sm capitalize text-muted-foreground">{status}</span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === "vnc" ? (
          <iframe
            src={kasmUrl}
            className="h-full w-full border-0"
            onLoad={() => setVncStatus("connected")}
            onError={() => setVncStatus("error")}
          />
        ) : (
          <TermViewer
            key="sift-term"
            vmId={SIFT_ID}
            backend="docker"
            className="h-full"
            onStatusChange={setTermStatus}
          />
        )}
      </div>
    </div>
  )
}
