import { useState } from "react"
import { SiftVnc } from "@/sift-docker/sift-vnc"

type Status = "connecting" | "connected" | "disconnected" | "error"

const SIFT_ID = "sift"

const STATUS_COLORS: Record<Status, string> = {
  connecting: "text-amber-500",
  connected: "text-green-500",
  disconnected: "text-muted-foreground",
  error: "text-red-500",
}

export function PrototypeUI4() {
  const [status, setStatus] = useState<Status>("connecting")

  return (
    <div className="flex h-screen flex-col">
      <div className="flex shrink-0 items-center gap-4 border-b px-6 py-3">
        <span className="text-xs text-muted-foreground">
          SIFT Workstation (Docker) — sift:forensics
        </span>

        <div className="ml-auto flex items-center gap-2">
          <span className={STATUS_COLORS[status]}>●</span>
          <span className="text-sm capitalize text-muted-foreground">{status}</span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <SiftVnc
          key="sift-vnc"
          containerId={SIFT_ID}
          className="h-full"
          onStatusChange={setStatus}
        />
      </div>
    </div>
  )
}
