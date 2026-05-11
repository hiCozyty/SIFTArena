import { Switch } from "@/components/ui/switch"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { useTheme } from "@/components/theme-provider"

export function SettingsPage() {
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
          </div>
        </div>
      </div>
    </div>
  )
}
