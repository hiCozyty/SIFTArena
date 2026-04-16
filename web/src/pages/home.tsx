import { ApiKeyCard, getApiKey, saveApiKey } from "@/components/api-key-card"
import {
  LudusApiCard,
  getLudusApiConfig,
  saveLudusApiConfig,
} from "@/components/ludus-api-card"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { IconFolderCode } from "@tabler/icons-react"
import { useState, useEffect } from "react"

export function HomePage() {
  const [hasApiKey, setHasApiKey] = useState<string | null>(() => getApiKey())
  const [hasLudusConfig, setHasLudusConfig] = useState<{
    ip: string
    port: string
    apiKey: string
  } | null>(() => getLudusApiConfig())

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "nvidia_api_key") {
        setHasApiKey(localStorage.getItem("nvidia_api_key"))
      }
      if (e.key === "local_ludus_config") {
        setHasLudusConfig(
          JSON.parse(localStorage.getItem("local_ludus_config") || "null")
        )
      }
    }

    window.addEventListener("storage", handleStorageChange)
    return () => window.removeEventListener("storage", handleStorageChange)
  }, [])

  const handleApiKeySave = (key: string) => {
    saveApiKey(key)
    setHasApiKey(() => key)
  }

  const handleLudusConfigSave = (config: {
    ip: string
    port: string
    apiKey: string
  }) => {
    saveLudusApiConfig(config)
    setHasLudusConfig(() => config)
  }

  if (!hasApiKey) {
    return <ApiKeyCard onSave={handleApiKeySave} />
  }

  if (!hasLudusConfig) {
    return <LudusApiCard onSave={handleLudusConfigSave} />
  }

  return (
    <div className="flex min-h-svh flex-col select-none">
      <div className="flex flex-1 items-center justify-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconFolderCode />
            </EmptyMedia>
            <EmptyTitle>No Projects Yet</EmptyTitle>
            <EmptyDescription>
              You haven&apos;t created any projects yet. Get started by creating
              your first project.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center gap-2">
            <Button>Create Project</Button>
            <Button variant="outline">Import Project</Button>
          </EmptyContent>
        </Empty>
      </div>
    </div>
  )
}
