import { useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TermViewer } from "@/components/lab-range/term-viewer"

type TermStatus = "connecting" | "connected" | "disconnected" | "error"

const VMS = [
  { id: 104, label: "Kali Linux — ty-attacker-kali", ip: "10.1.99.1" },
  { id: 105, label: "Windows 11 — ty-win11-22h2", ip: "10.1.99.24" },
  { id: 106, label: "Windows 11 Test — ty-win11-22h2-test", ip: "10.1.99.25" },
]

const STATUS_COLORS: Record<TermStatus, string> = {
  connecting: "text-amber-500",
  connected: "text-green-500",
  disconnected: "text-muted-foreground",
  error: "text-red-500",
}

export function PrototypeUI2() {
  const [selectedVm, setSelectedVm] = useState<number | null>(null)
  const [status, setStatus] = useState<TermStatus>("disconnected")

  const handleStatusChange = (next: TermStatus) => {
    console.log(`[PrototypeUI2] Status: ${status} → ${next}`)
    setStatus(next)
  }

  const selected = VMS.find((v) => v.id === selectedVm)

  return (
    <div className="flex h-screen flex-col">
      <div className="flex shrink-0 items-center gap-4 border-b px-6 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">VM:</span>
          <Select
            value={selectedVm?.toString() ?? ""}
            onValueChange={(v) => {
              const id = Number(v)
              console.log(`[PrototypeUI2] VM selected: ${id}`)
              setSelectedVm(id)
              setStatus("connecting")
            }}
          >
            <SelectTrigger className="w-[340px]">
              <SelectValue placeholder="Select a VM..." />
            </SelectTrigger>
            <SelectContent>
              {VMS.map((vm) => (
                <SelectItem key={vm.id} value={vm.id.toString()}>
                  {vm.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selected && (
          <span className="text-xs text-muted-foreground">
            IP: {selected.ip} — Proxmox ID: {selected.id}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className={STATUS_COLORS[status]}>●</span>
          <span className="text-sm capitalize text-muted-foreground">{status}</span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {selectedVm ? (
          <TermViewer
            key={selectedVm}
            vmId={selectedVm}
            className="h-full"
            onStatusChange={handleStatusChange}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select a VM to connect via console (xterm.js)
          </div>
        )}
      </div>
    </div>
  )
}
