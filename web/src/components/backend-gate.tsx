import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Copy, Check, AlertCircle, FileText } from "lucide-react"

const SERVER_CMD = "bun run ./server/index.js"

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

export function ConnectionErrorContent({
  onRetry,
  onShowGuide,
}: {
  onRetry: () => void
  onShowGuide: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Could not connect to the backend server. Make sure it is running:
      </p>
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
    </div>
  )
}

export function HealthErrorContent({
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
    <div className="flex flex-col gap-3">
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
    </div>
  )
}
