import { useEffect, useRef, useState, useCallback } from "react"
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import "@xterm/xterm/css/xterm.css"
import { cn } from "@/lib/utils"

type TermStatus = "connecting" | "connected" | "disconnected" | "error"

interface SiftTerminalProps {
  containerId: string
  className?: string
  onStatusChange?: (status: TermStatus) => void
}

function getWsUrl(containerId: string) {
  const apiUrl = import.meta.env.VITE_API_URL || `${location.protocol}//${location.host}`
  const proto = apiUrl.startsWith("https:") ? "wss:" : "ws:"
  const host = new URL(apiUrl).host
  return `${proto}//${host}/term/${containerId}`
}

export function SiftTerminal({ containerId, className, onStatusChange }: SiftTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<TermStatus>("disconnected")
  const onStatusChangeRef = useRef(onStatusChange)
  onStatusChangeRef.current = onStatusChange

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

      try { fitAddon.fit() } catch { /* container may not have dimensions yet */ }

      const observer = new ResizeObserver(() => {
        try { fitAddon?.fit() } catch { /* ignore */ }
        if (ws?.readyState === WebSocket.OPEN && term) {
          ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }))
        }
      })
      observer.observe(container)

      const wsUrl = getWsUrl(containerId)
      ws = new WebSocket(wsUrl)
      ws.binaryType = "arraybuffer"

      ws.onopen = () => {
        if (cancelled) return
        updateStatus("connected")
        if (term) {
          ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }))
        }
        term?.focus()
      }

      ws.onmessage = (event) => {
        if (cancelled || !term) return
        const preview = typeof event.data === "string"
          ? event.data.slice(0, 100)
          : `[binary ${event.data instanceof ArrayBuffer ? event.data.byteLength : '?'} bytes]`
        if (event.data instanceof ArrayBuffer) {
          term.write(new Uint8Array(event.data))
        } else if (typeof event.data === "string") {
          term.write(event.data)
        }
      }

      ws.onerror = (e) => {
        if (cancelled) return
        console.error(`[SiftTerminal] WebSocket error:`, e)
        updateStatus("error")
      }

      ws.onclose = (event) => {
        if (cancelled) return
        updateStatus("disconnected")
      }

      term.onData((data) => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(data)
        }
      })

      term.onSelectionChange(() => {
        const sel = term?.getSelection()
        if (sel) {
          navigator.clipboard.writeText(sel).catch(() => {})
        }
      })

      term.attachCustomKeyEventHandler((e) => {
        if (e.ctrlKey && e.shiftKey && e.key === "C") {
          const sel = term?.getSelection()
          if (sel) {
            navigator.clipboard.writeText(sel).catch(() => {})
          }
          return false
        }
        if (e.ctrlKey && e.shiftKey && e.key === "V") {
          navigator.clipboard.readText().then((text) => {
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(text)
            }
          }).catch(() => {})
          return false
        }
        return true
      })
    }, 50)

    return () => {
      cancelled = true
      clearTimeout(timer)
      if (ws) {
        ws.onclose = null
        ws.close()
        ws = null
      }
      term?.dispose()
      term = null
    }
  }, [containerId, updateStatus])

  return (
    <div className={cn("relative", className)}>
      <div ref={containerRef} className="h-full w-full" />
      {status === "connecting" && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80">
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Connecting to {containerId}...
          </div>
        </div>
      )}
    </div>
  )
}
