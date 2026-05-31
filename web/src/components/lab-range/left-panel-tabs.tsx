import { useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Category } from "@/components/ui/tabs-fancy"

interface LeftPanelTabsProps {
  tabs: Category[]
  className?: string
  activeTab?: Category["id"]
  onTabChange?: (id: Category["id"]) => void
}

export function LeftPanelTabs({ tabs, className, activeTab: controlledTab, onTabChange }: LeftPanelTabsProps) {
  const [internalTab, setInternalTab] = useState<Category["id"]>(tabs[0]?.id ?? "")

  const activeTab = controlledTab ?? internalTab

  const activeTabData = tabs.find((t) => t.id === activeTab)

  if (!tabs.length) return null

  return (
    <div className={className}>
      <div className="flex flex-col h-full min-h-0">
        <div className="flex justify-center">
          <Tabs value={String(activeTab)} onValueChange={(v) => {
            const id = typeof tabs[0]?.id === "number" ? Number(v) : v
            if (controlledTab === undefined) {
              setInternalTab(id as Category["id"])
            }
            onTabChange?.(id as Category["id"])
          }}>
            <TabsList className="h-8 w-fit">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={String(tab.id)} className="px-2 py-0.5 text-xs">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 mt-3 min-h-0 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {activeTabData?.content}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
