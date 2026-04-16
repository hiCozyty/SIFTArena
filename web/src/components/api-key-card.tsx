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
import { checkNVIDIAApiKey } from "@/lib/utils"

const API_KEY_STORAGE_KEY = "nvidia_api_key"

export const getApiKey = (): string | null => {
  return localStorage.getItem(API_KEY_STORAGE_KEY)
}

export const saveApiKey = (key: string): void => {
  localStorage.setItem(API_KEY_STORAGE_KEY, key)
}

interface ApiKeyCardProps {
  currentKey?: string
  onSave?: (key: string) => void
}

export function ApiKeyCard({ currentKey, onSave }: ApiKeyCardProps) {
  const [apiKey, setApiKey] = useState(currentKey || "")
  const [isValidating, setIsValidating] = useState(false)
  const [alert, setAlert] = useState<{
    variant: "default" | "destructive"
    title: string
    message: string
  } | null>(null)

  const handleSave = async () => {
    const trimmedKey = apiKey.trim()
    if (!trimmedKey) return

    if (!trimmedKey.startsWith("nvapi-")) {
      setAlert({
        variant: "destructive",
        title: "Invalid API Key Format",
        message: "API key must start with 'nvapi-'.",
      })
      return
    }

    setIsValidating(true)
    setAlert(null)

    const isValid = await checkNVIDIAApiKey(trimmedKey)

    if (isValid) {
      setAlert({
        variant: "default",
        title: "Success",
        message: "API key verified successfully!",
      })
      setTimeout(() => {
        saveApiKey(trimmedKey)
        if (onSave) {
          onSave(trimmedKey)
        }
      }, 1500)
    } else {
      setAlert({
        variant: "destructive",
        title: "Invalid API Key",
        message:
          "The provided API key is not valid. Please check and try again.",
      })
    }

    setIsValidating(false)
  }

  const handleGetApiKey = () => {
    window.open("https://build.nvidia.com", "_blank")
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(e.target.value)
  }

  const containerClasses = "flex min-h-svh items-center justify-center p-6"

  return (
    <>
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
            <CardTitle>NVIDIA API Key</CardTitle>
            <CardDescription>
              Enter your NVIDIA API key to continue
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="password"
              placeholder="Enter your API key"
              value={apiKey}
              onChange={handleInputChange}
            />

            <div className="flex flex-col gap-2">
              <Button
                onClick={handleSave}
                className="w-full"
                disabled={!apiKey.trim() || isValidating}
              >
                {isValidating ? "Verifying..." : "Save"}
              </Button>
              <Button
                onClick={handleGetApiKey}
                variant="outline"
                className="w-full"
              >
                Get API Key
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
