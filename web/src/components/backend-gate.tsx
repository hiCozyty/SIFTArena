import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { LudusServerGuide } from "@/components/ludus-server-guide"
import { Loader2, Copy, Check, AlertCircle, FileText } from "lucide-react"

const SERVER_CMD = "bun run ./server/index.js"
const MIN_CONNECTING_MS = 300

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button variant="ghost" size="icon" onClick={handleCopy} className="shrink-0">
      {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
    </Button>
  )
}

type GateState =
  | { type: "connecting" }
  | { type: "connection-error" }
  | { type: "health-error"; rawStatus: string; detail?: string; config?: { ludusUrl?: string } }

export function BackendGate({ onSuccess }: { onSuccess: () => void }) {
  const [state, setState] = useState<GateState>({ type: "connecting" })
  const [showGuide, setShowGuide] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const delayedRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const connectStartRef = useRef(0)
  const resolvedRef = useRef(false)

  const wsUrl = import.meta.env.VITE_BACKEND_WS_URL || "ws://localhost:8011"

  const connect = () => {
    clearTimeout(delayedRef.current)
    clearTimeout(timeoutRef.current)
    wsRef.current?.close()

    resolvedRef.current = false
    connectStartRef.current = Date.now()
    setState({ type: "connecting" })

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    const scheduleErrorTransition = (toState: GateState) => {
      const doTransition = () => {
        if (wsRef.current !== ws) return
        if (resolvedRef.current) return
        setState((prev) => (prev.type === "connecting" ? toState : prev))
      }
      const elapsed = Date.now() - connectStartRef.current
      if (elapsed >= MIN_CONNECTING_MS) {
        doTransition()
      } else {
        delayedRef.current = setTimeout(doTransition, MIN_CONNECTING_MS - elapsed)
      }
    }

    timeoutRef.current = setTimeout(() => {
      ws.close()
    }, 5000)

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "healthCheck" }))
    }

    ws.onmessage = (event) => {
      clearTimeout(timeoutRef.current)
      try {
        const data = JSON.parse(event.data)
        if (data.type === "healthCheck") {
          if (data.result?.status === "ok") {
            resolvedRef.current = true
            clearTimeout(delayedRef.current)
            onSuccess()
          } else {
            scheduleErrorTransition({
              type: "health-error",
              rawStatus: data.result?.status || "unknown",
              detail: data.result?.error,
              config: data.result?.config,
            })
          }
        }
      } catch {}
    }

    ws.onerror = () => {
      if (wsRef.current !== ws) return
      clearTimeout(timeoutRef.current)
      scheduleErrorTransition({ type: "connection-error" })
    }

    ws.onclose = () => {
      if (wsRef.current !== ws) return
      clearTimeout(timeoutRef.current)
      scheduleErrorTransition({ type: "connection-error" })
    }
  }

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(timeoutRef.current)
      clearTimeout(delayedRef.current)
      wsRef.current?.close()
    }
  }, [])

  const isConnecting = state.type === "connecting"

  return (
    <>
      <LudusServerGuide open={showGuide} onOpenChange={setShowGuide} />
      <div className="flex min-h-svh items-center justify-center p-6">
        <Card className="w-full max-w-sm select-none">
          <CardHeader>
            <CardTitle>
              {isConnecting
                ? "Connecting to Backend"
                : state.type === "connection-error"
                  ? "Connection Failed"
                  : "Configuration Error"}
            </CardTitle>
            {isConnecting && (
              <CardDescription>
                Attempting to establish a connection to the shadow server...
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {isConnecting && (
              <div className="flex justify-center py-4">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
              </div>
            )}
            {state.type === "connection-error" && (
              <ConnectionErrorContent onRetry={connect} onShowGuide={() => setShowGuide(true)} />
            )}
            {state.type === "health-error" && (
              <HealthErrorContent
                status={state.rawStatus}
                detail={state.detail}
                config={state.config}
                onRetry={connect}
                onShowGuide={() => setShowGuide(true)}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function ConnectionErrorContent({
  onRetry,
  onShowGuide,
}: {
  onRetry: () => void
  onShowGuide: () => void
}) {
  return (
    <>
      <CardDescription>
        Could not connect to the backend server. Make sure it is running:
      </CardDescription>
      <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm font-mono">
        <span className="min-w-0 grow truncate">{SERVER_CMD}</span>
        <CopyButton text={SERVER_CMD} />
      </div>
      <div className="flex flex-col gap-2">
        <Button onClick={onRetry}>Retry</Button>
        <Button variant="outline" onClick={onShowGuide}>
          Get Ludus Server
        </Button>
      </div>
    </>
  )
}

function HealthErrorContent({
  status,
  detail,
  config,
  onRetry,
  onShowGuide,
}: {
  status: string
  detail?: string
  config?: { ludusUrl?: string }
  onRetry: () => void
  onShowGuide: () => void
}) {
  const isMissingUrl = status === "missing LUDUS_SERVER_URL"
  const isMissingKey = status === "missing LUDUS_API_KEY"
  const displayUrl = config?.ludusUrl || "https://your-ludus-server:8080"

  return (
    <>
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertTitle>
          {isMissingUrl
            ? "LUDUS_SERVER_URL is not configured"
            : isMissingKey
              ? "LUDUS_API_KEY is not configured"
              : "Health check failed"}
        </AlertTitle>
        <AlertDescription>
          {isMissingUrl
            ? "Set the Ludus server URL in the server configuration file."
            : isMissingKey
              ? "Set the Ludus API key in the server configuration file."
              : detail || "An unknown error occurred."}
        </AlertDescription>
      </Alert>

      <div className="rounded-lg bg-muted p-3">
        <div className="flex items-center gap-2 text-xs">
          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="font-mono text-muted-foreground">/.env</span>
        </div>
        <div className="mt-2 space-y-1.5">
          <div>
            <div className="text-xs font-medium text-muted-foreground">LUDUS_SERVER_URL</div>
            <code className="mt-0.5 block truncate rounded-md border bg-background px-2 py-1 font-mono text-xs">
              {displayUrl}
            </code>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">LUDUS_API_KEY</div>
            <code className="mt-0.5 block truncate rounded-md border bg-background px-2 py-1 font-mono text-xs">
              xx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
            </code>
          </div>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm text-muted-foreground">
          Get your API key from the Ludus Server:
        </p>
        <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm font-mono">
          <span className="min-w-0 grow truncate">ludus-install-status</span>
          <CopyButton text="ludus-install-status" />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Button onClick={onRetry}>Retry</Button>
        <Button variant="outline" onClick={onShowGuide}>
          Get Ludus Server
        </Button>
      </div>
    </>
  )
}
