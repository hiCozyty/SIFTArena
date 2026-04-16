"use client"

import {
  AppleDock,
  AppleDockIcon,
} from "@/components/shadcn-space/apple-dock/apple-dock-01"
import { Home, Settings } from "lucide-react"
import { Link, useLocation } from "react-router-dom"

export default function BottomDock() {
  const location = useLocation()
  const isHomeActive = location.pathname === "/"
  const isSettingsActive = location.pathname === "/settings"

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
      <AppleDock
        direction="middle"
        className="border-border/20 bg-background/60 backdrop-blur-xl"
      >
        <Link to="/">
          <AppleDockIcon
            className={
              isHomeActive
                ? "bg-transparent text-primary"
                : "bg-transparent text-muted-foreground hover:text-primary"
            }
          >
            <Home className="h-5 w-5" />
          </AppleDockIcon>
        </Link>
        <Link to="/settings">
          <AppleDockIcon
            className={
              isSettingsActive
                ? "bg-transparent text-primary"
                : "bg-transparent text-muted-foreground hover:text-primary"
            }
          >
            <Settings className="h-5 w-5" />
          </AppleDockIcon>
        </Link>
      </AppleDock>
    </div>
  )
}
