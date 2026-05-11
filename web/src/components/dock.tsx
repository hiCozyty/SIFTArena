"use client"

import { useState } from "react"
import { Home, Settings } from "lucide-react"
import { AppleDock, AppleDockIcon } from "@/components/shadcn-space/apple-dock/apple-dock-01"
import { useTheme } from "@/components/theme-provider"
import { Switch } from "@/components/ui/switch"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"

export default function BottomDock() {
  const { theme, setTheme } = useTheme()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const isDark = theme === "dark"

  return (
    <>
      <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
        <AppleDock
          direction="middle"
          className="border-border/20 bg-background/60 backdrop-blur-xl"
        >
          <AppleDockIcon
            className="bg-transparent text-primary"
            onClick={() => setSettingsOpen(false)}
          >
            <Home className="size-5" />
          </AppleDockIcon>
          <AppleDockIcon
            className="bg-transparent text-muted-foreground hover:text-primary"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="size-5" />
          </AppleDockIcon>
        </AppleDock>
      </div>

      {settingsOpen && (
        <div className="fixed inset-0 z-40 flex min-h-svh flex-col bg-background">
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
                    <p className="text-sm text-muted-foreground">
                      Toggle between light and dark themes
                    </p>
                  </div>
                  <Switch
                    checked={isDark}
                    onCheckedChange={() => setTheme(isDark ? "light" : "dark")}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
