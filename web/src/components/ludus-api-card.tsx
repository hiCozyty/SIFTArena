import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { LudusServerGuide } from "@/components/ludus-server-guide"

const LUDUS_API_STORAGE_KEY = "local_ludus_config"

export const getLudusApiConfig = (): {
  ip: string
  port: string
  apiKey: string
} | null => {
  const stored = localStorage.getItem(LUDUS_API_STORAGE_KEY)
  if (!stored) return null
  try {
    return JSON.parse(stored)
  } catch {
    return null
  }
}

export const saveLudusApiConfig = (config: {
  ip: string
  port: string
  apiKey: string
}): void => {
  localStorage.setItem(LUDUS_API_STORAGE_KEY, JSON.stringify(config))
}

interface LudusApiCardProps {
  currentConfig?: { ip: string; port: string; apiKey: string }
  onSave?: (config: { ip: string; port: string; apiKey: string }) => void
}

export function LudusApiCard({ currentConfig, onSave }: LudusApiCardProps) {
  const [ip, setIp] = useState(currentConfig?.ip || "")
  const [port, setPort] = useState(currentConfig?.port || "8080")
  const [apiKey, setApiKey] = useState(currentConfig?.apiKey || "")
  const [isValidating, setIsValidating] = useState(false)
  const [alert, setAlert] = useState<{
    variant: "default" | "destructive"
    title: string
    message: string
  } | null>(null)
  const [showGuide, setShowGuide] = useState(false)

  const handleSave = async () => {
    const trimmedIp = ip.trim()
    if (!trimmedIp) {
      setAlert({
        variant: "destructive",
        title: "IP Address Required",
        message: "Please enter a valid IP address.",
      })
      return
    }

    const ipRegex =
      /^(?:\d{1,3}\.){3}\d{1,3}$|^([a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/
    if (!ipRegex.test(trimmedIp)) {
      setAlert({
        variant: "destructive",
        title: "Invalid IP Address Format",
        message: "Please enter a valid IP address or hostname.",
      })
      return
    }

    const trimmedPort = port.trim()
    const portNum = parseInt(trimmedPort, 10)
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setAlert({
        variant: "destructive",
        title: "Invalid Port",
        message: "Port must be between 1 and 65535.",
      })
      return
    }

    const trimmedApiKey = apiKey.trim()
    if (!trimmedApiKey) {
      setAlert({
        variant: "destructive",
        title: "API Key Required",
        message: "Please enter your Ludus API key.",
      })
      return
    }

    setIsValidating(true)
    setAlert(null)

    try {
      const response = await fetch(
        `https://${trimmedIp}:${trimmedPort}/api/health`,
        {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        }
      )

      if (!response.ok) {
        throw new Error("Server responded with error")
      }

      const config = { ip: trimmedIp, port: trimmedPort, apiKey: trimmedApiKey }
      saveLudusApiConfig(config)

      setAlert({
        variant: "default",
        title: "Success",
        message: "Ludus API server configured successfully!",
      })

      setTimeout(() => {
        if (onSave) {
          onSave(config)
        }
      }, 1500)
    } catch (error) {
      setAlert({
        variant: "destructive",
        title: "Connection Failed",
        message:
          "Unable to connect to the Ludus server. Please check the IP and port.",
      })
    }

    setIsValidating(false)
  }

  const handleIpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIp(e.target.value)
  }

  const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPort(e.target.value)
  }

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(e.target.value)
  }

  const containerClasses = "flex min-h-svh items-center justify-center p-6"

  return (
    <>
      <LudusServerGuide open={showGuide} onOpenChange={setShowGuide} />

      <div
        className={`fixed right-6 bottom-6 z-50 w-80 transition-opacity duration-200 select-none ${
          alert ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <Alert variant={alert?.variant || "default"}>
          <AlertTitle>{alert?.title || ""}</AlertTitle>
          <AlertDescription>{alert?.message || ""}</AlertDescription>
        </Alert>
      </div>

      <div className={containerClasses}>
        <Card className="w-full max-w-sm select-none">
          <CardHeader>
            <CardTitle>Ludus API Server</CardTitle>
            <CardDescription>
              Enter your Ludus API server details to continue
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">IP Address</p>
              <Input
                id="ip"
                type="text"
                placeholder="e.g. 192.168.1.100"
                value={ip}
                onChange={handleIpChange}
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Port</p>
              <Input
                id="port"
                type="number"
                placeholder="8080"
                value={port}
                onChange={handlePortChange}
                min={1}
                max={65535}
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Ludus Api Key</p>
              <Input
                id="apiKey"
                type="text"
                placeholder="e.g. JD._7Gx2T5kTUSD%uTWZ*lFi=Os6MpFR^OrG+yT94Xt"
                value={apiKey}
                onChange={handleApiKeyChange}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Button
                onClick={handleSave}
                className="w-full"
                disabled={!ip.trim() || !port.trim() || isValidating}
              >
                {isValidating ? "Verifying..." : "Save"}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowGuide(true)}
              >
                Get Ludus Server
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
