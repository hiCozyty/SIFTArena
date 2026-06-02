import { useEffect, useRef, useState, useCallback } from "react"
import RFB from "@novnc/novnc"
import { cn } from "@/lib/utils"

type VncStatus = "connecting" | "connected" | "disconnected" | "error"

interface VncViewerProps {
  vmId: number
  className?: string
  onStatusChange?: (status: VncStatus) => void
}

function getWsUrl(vmId: number) {
  const apiUrl = import.meta.env.VITE_API_URL || `${location.protocol}//${location.host}`
  const proto = apiUrl.startsWith("https:") ? "wss:" : "ws:"
  const host = new URL(apiUrl).host
  return `${proto}//${host}/vnc/${vmId}`
}

function getTicketUrl(vmId: number) {
  const apiUrl = import.meta.env.VITE_API_URL || `${location.protocol}//${location.host}`
  return `${apiUrl}/vnc-ticket/${vmId}`
}

export function VncViewer({ vmId, className, onStatusChange }: VncViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rfbRef = useRef<RFB | null>(null)
  const [status, setStatus] = useState<VncStatus>("disconnected")
  const onStatusChangeRef = useRef(onStatusChange)
  onStatusChangeRef.current = onStatusChange

  const updateStatus = useCallback((next: VncStatus) => {
    setStatus(next)
    onStatusChangeRef.current?.(next)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    while (container.firstChild) container.removeChild(container.firstChild)

    updateStatus("connecting")
    let rfb: RFB | null = null
    let cancelled = false

    const timer = setTimeout(async () => {
      if (cancelled) return

      try {
        const ticketRes = await fetch(getTicketUrl(vmId))
        if (!ticketRes.ok) throw new Error(`Failed to fetch VNC ticket: ${ticketRes.status}`)
        const { ticket } = await ticketRes.json()
        if (cancelled) return

        const wsUrl = getWsUrl(vmId)
        rfb = new RFB(container, wsUrl, {
          wsProtocols: ["binary"],
          credentials: { password: ticket },
        })
        rfb.scaleViewport = true
        rfb.resizeSession = false
        rfbRef.current = rfb

        rfb.addEventListener("connect", () => {
          if (cancelled) return
          updateStatus("connected")
        })

        rfb.addEventListener("disconnect", (e: any) => {
          if (cancelled) return
          const detail = e?.detail || {}
          updateStatus("disconnected")
        })

        rfb.addEventListener("securityfailure", (e: any) => {
          if (cancelled) return
          updateStatus("error")
        })

        rfb.addEventListener("desktopname", (e: any) => {
          })

        rfb.addEventListener("clipboard", (e: any) => {
          })

        rfb.addEventListener("credentialsrequired", () => {
          rfb.sendCredentials({ password: ticket })
        })
      } catch (err) {
        console.error(`[VNC] Setup error for VM ${vmId}:`, err)
        updateStatus("error")
      }
    }, 50)

    return () => {
      cancelled = true
      clearTimeout(timer)
      rfbRef.current = null
      if (rfb) {
        rfb.disconnect()
        rfb = null
      }
      while (container.firstChild) container.removeChild(container.firstChild)
    }
  }, [vmId, updateStatus])

  return (
    <div className={cn("relative", className)}>
      <div ref={containerRef} className="h-full w-full" />
      {status !== "connected" && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80">
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            {status === "connecting" && (
              <>
                <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Connecting to VM {vmId}...
              </>
            )}
            {status === "disconnected" && <>Disconnected</>}
            {status === "error" && <>Connection failed</>}
          </div>
        </div>
      )}
    </div>
  )
}
