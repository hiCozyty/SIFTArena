import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { getApiKey } from "@/components/api-key-card"
import { getLudusApiConfig } from "@/components/ludus-api-card"
import { useTheme } from "@/components/theme-provider"

export function SettingsPage() {
  const currentKey = getApiKey()
  const ludusConfig = getLudusApiConfig()
  const { theme, setTheme } = useTheme()

  const isDark = theme === "dark"

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark")
  }

  return (
    <div className="flex min-h-svh flex-col select-none">
      <div className="flex-1">
        <div className="container mx-auto py-8">
          <div className="mx-auto max-w-2xl">
            <div className="mb-8">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbPage>Settings</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>

            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <p className="font-medium">Dark Mode</p>
                <p className="text-smaller text-muted-foreground">
                  Toggle between light and dark themes
                </p>
              </div>
              <Switch checked={isDark} onCheckedChange={toggleTheme} />
            </div>

            <div className="flex items-center justify-between border-b py-4">
              <div>
                <p className="font-medium">NVIDIA API Key</p>
                <p className="text-smaller text-muted-foreground">
                  {currentKey
                    ? `nvapi-${"*".repeat(20)}`
                    : "No API key configured"}
                </p>
              </div>
              <Link to="/edit-api-key">
                <Button>Edit</Button>
              </Link>
            </div>

            <div className="flex items-center justify-between py-4">
              <div>
                <p className="font-medium">Ludus API Server</p>
                <p className="text-smaller text-muted-foreground">
                  {ludusConfig
                    ? `${ludusConfig.ip}:${ludusConfig.port}`
                    : "No server configured"}
                </p>
              </div>
              <Link to="/edit-ludus-api-server">
                <Button>Edit</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
