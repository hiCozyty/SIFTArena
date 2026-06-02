import { useEffect, useRef, useState, useCallback } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import "@xterm/xterm/css/xterm.css"
import { cn } from "@/lib/utils"

type TermStatus = "connecting" | "connected" | "disconnected" | "error"

interface TermViewerProps {
  vmId: number
  className?: string
  onStatusChange?: (status: TermStatus) => void
}

function getWsUrl(vmId: number) {
  const apiUrl = import.meta.env.VITE_API_URL || `${location.protocol}//${location.host}`
  const proto = apiUrl.startsWith("https:") ? "wss:" : "ws:"
  const host = new URL(apiUrl).host
  return `${proto}//${host}/term/${vmId}`
}

export function TermViewer({ vmId, className, onStatusChange }: TermViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<TermStatus>("disconnected")
  const [copied, setCopied] = useState(false)
  const onStatusChangeRef = useRef(onStatusChange)
  onStatusChangeRef.current = onStatusChange
  const setCopiedRef = useRef(setCopied)
  setCopiedRef.current = setCopied

  const updateStatus = useCallback((next: TermStatus) => {
    setStatus(next)
    onStatusChangeRef.current?.(next)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    updateStatus("connecting")

    let cancelled = false
    let term: Terminal | null = null
    let fitAddon: FitAddon | null = null
    let ws: WebSocket | null = null

    const onMouseUp = () => {
      const sel = term?.getSelection()
      if (!sel) return
      navigator.clipboard.writeText(sel).then(() => {
        setCopiedRef.current(true)
        setTimeout(() => setCopiedRef.current(false), 1500)
      }).catch(() => {})
    }
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      const currentWs = ws
      if (currentWs?.readyState === WebSocket.OPEN) {
        navigator.clipboard.readText().then(text => {
          if (text) currentWs.send(text)
        }).catch(() => {})
      }
    }
    container.addEventListener("mouseup", onMouseUp)
    container.addEventListener("contextmenu", onContextMenu)

    const timer = setTimeout(() => {
      if (cancelled) return

      term = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: "#1a1b26",
          foreground: "#c0caf5",
          cursor: "#c0caf5",
          selectionBackground: "#33467c",
        },
      })

      fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(container)

      try {
        fitAddon.fit()
      } catch {
        // container may not have dimensions yet
      }

      const observer = new ResizeObserver(() => {
        try { fitAddon?.fit() } catch { /* ignore */ }
        if (ws?.readyState === WebSocket.OPEN && term) {
          ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }))
        }
      })
      observer.observe(container)

      const wsUrl = getWsUrl(vmId)
      console.log(`[Term] Connecting to ${wsUrl}`)

      ws = new WebSocket(wsUrl)
      ws.binaryType = "arraybuffer"

      ws.onopen = () => {
        if (cancelled) return
        console.log(`[Term] Connected to VM ${vmId}`)
        updateStatus("connected")
        if (term) {
          ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }))
        }
        term?.focus()
      }

      ws.onmessage = (event) => {
        if (cancelled || !term) return
        if (event.data instanceof ArrayBuffer) {
          term.write(new Uint8Array(event.data))
        } else if (typeof event.data === "string") {
          term.write(event.data)
        }
      }

      ws.onerror = () => {
        if (cancelled) return
        console.error(`[Term] WebSocket error for VM ${vmId}`)
        updateStatus("error")
      }

      ws.onclose = (event) => {
        if (cancelled) return
        console.log(`[Term] Disconnected from VM ${vmId}`, { code: event.code, reason: event.reason })
        updateStatus("disconnected")
      }

      term.onData((data) => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(data)
        }
      })
    }, 50)

    return () => {
      console.log(`[Term] Cleaning up VM ${vmId} connection`)
      cancelled = true
      clearTimeout(timer)
      container.removeEventListener("mouseup", onMouseUp)
      container.removeEventListener("contextmenu", onContextMenu)
      if (ws) {
        ws.onclose = null
        ws.close()
        ws = null
      }
      term?.dispose()
      term = null
    }
  }, [vmId, updateStatus])

  return (
    <div className={cn("relative", className)}>
      <div ref={containerRef} className="h-full w-full" />
      {copied && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow">
          Copied to clipboard
        </div>
      )}
      {status !== "connected" && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80">
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            {status === "connecting" && (
              <>
                <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Connecting to VM {vmId} console...
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
