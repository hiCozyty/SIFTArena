import { useState, useCallback } from "react"
import { motion, AnimatePresence } from "motion/react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"

import { cn } from "@/lib/utils"

type DeploymentStatus = "Not Deployed" | "Deploying" | "Resetting" | "Deployed" | "Deployed (stale)"

interface Category {
  id: string | number
  label: string
  content?: React.ReactNode
}

interface Item {
  id: string | number
  label: string
  icon?: string
  subText?: string
}

interface TabsFancyProps {
  categories: Category[]
  items?: Item[]
  defaultCategory?: Category["id"]
  activeCategory?: Category["id"]
  onCategoryChange?: (id: Category["id"]) => void
  onAddItem?: () => void
  className?: string
  cpuUsage?: string
  memoryUsage?: string
  deploymentStatus?: DeploymentStatus
  isDeploying?: boolean
  onReset?: () => void
  onDeploy?: () => void
  hideSidebar?: boolean
  isDeployable?: boolean
}

function StatusLabel({ status }: { status: DeploymentStatus }) {
  if (status === "Deployed (stale)") {
    return (
      <div className="flex flex-col leading-tight">
        <span className="text-[10px] text-muted-foreground/50">Status</span>
        <span>Deployed <span className="text-amber-500">(stale)</span></span>
      </div>
    )
  }
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[10px] text-muted-foreground/50">Status</span>
      <span>{status}</span>
    </div>
  )
}

function TabsFancy({
  categories,
  items = [],
  defaultCategory,
  activeCategory: controlledCategory,
  onCategoryChange,
  onAddItem,
  className,
  cpuUsage,
  memoryUsage,
  deploymentStatus,
  isDeploying,
  onReset,
  onDeploy,
  hideSidebar,
  isDeployable,
}: TabsFancyProps) {
  const [selectedItemId, setSelectedItemId] = useState<Item["id"] | null>(null)
  const [addTemplateOpen, setAddTemplateOpen] = useState(false)

  const [internalCategory, setInternalCategory] = useState<Category["id"]>(
    defaultCategory ?? categories[0]?.id
  )

  const isControlled = controlledCategory !== undefined
  const activeCategoryId = isControlled ? controlledCategory : internalCategory

  const hasNumericIds = categories.some((c) => typeof c.id === "number")

  const handleCategoryChange = useCallback(
    (value: string) => {
      const id = hasNumericIds ? Number(value) : value
      if (!isControlled) {
        setInternalCategory(id as Category["id"])
      }
      onCategoryChange?.(id as Category["id"])
    },
    [isControlled, onCategoryChange, hasNumericIds]
  )

  const handleDragStart = useCallback(
    (e: React.DragEvent, item: Item) => {
      e.dataTransfer.setData("application/json", JSON.stringify(item))
      e.dataTransfer.effectAllowed = "move"
    },
    []
  )

  const activeCategoryData = categories.find((c) => c.id === activeCategoryId)

  if (!categories.length) return null

  return (
    <div className={cn("w-full", className)}>
      <div className="flex flex-row gap-6 overflow-hidden h-full min-h-0">
        {!hideSidebar && (
          <div className="w-56 flex flex-col rounded-4xl bg-muted p-3 min-h-0 overflow-hidden">
            <div className="shrink-0" style={{ minHeight: "40px" }} />
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {items.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item)}
                  onClick={(e) => { e.stopPropagation(); setSelectedItemId(selectedItemId === item.id ? null : item.id) }}
                  className={cn(
                    "group flex items-center w-full px-3 py-2 rounded-4xl transition-colors cursor-grab active:cursor-grabbing shrink-0",
                    selectedItemId === item.id
                      ? "bg-primary/10"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {item.icon && <span className="text-lg">{item.icon}</span>}
                    <div className="flex flex-col">
                      <span className="font-medium text-sm leading-tight">{item.label}</span>
                      {item.subText && (
                        <span className="text-[11px] text-muted-foreground/70 leading-tight">{item.subText}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {onAddItem && (
              <AlertDialog open={addTemplateOpen} onOpenChange={setAddTemplateOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full mt-3 border-dashed border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/60 hover:text-foreground">
                    <span className="text-base leading-none">+</span>
                    Add a Template
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Coming Soon</AlertDialogTitle>
                    <AlertDialogDescription>
                      This feature will be added at a later time.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogAction onClick={() => setAddTemplateOpen(false)}>OK</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0 pt-0 pb-0 rounded-none">
          <div className="shrink-0 grid grid-cols-[1fr_auto_1fr] items-start gap-3 min-h-[40px] px-1">
            <div className="flex items-center gap-6 text-xs text-muted-foreground">
              {cpuUsage && (
                <div className="flex flex-col leading-tight">
                  <span className="text-[10px] text-muted-foreground/50">CPU</span>
                  <span>{cpuUsage} cores</span>
                </div>
              )}
              {memoryUsage && (
                <div className="flex flex-col leading-tight">
                  <span className="text-[10px] text-muted-foreground/50">Memory</span>
                  <span>{memoryUsage} GB</span>
                </div>
              )}
              {deploymentStatus && <StatusLabel status={deploymentStatus} />}
            </div>
            <Tabs
              value={String(activeCategoryId ?? "")}
              onValueChange={handleCategoryChange}
            >
              <TabsList className="h-8">
                {categories.map((category) => (
                  <TabsTrigger key={category.id} value={String(category.id)} className="px-2.5 py-0.5 text-xs">
                    {category.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-3 justify-self-end">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" className="active:translate-y-px" disabled={isDeploying}>Reset</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset Configuration</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove existing VMs and redeploy the baseline range. Continue?
                    </AlertDialogDescription>
                    <p className="text-sm font-semibold text-destructive mt-2">
                      NOT RECOMMENDED UNLESS THERE IS A BUG IN THE RANGE
                    </p>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={onReset}>Reset</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" className="active:translate-y-px" disabled={isDeploying || !isDeployable}>Deploy</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Deploy Changes</AlertDialogTitle>
                    <AlertDialogDescription>
                      <span className="text-destructive font-bold">NOT RECOMMENDED.</span>
                      <br /><br />
                      For this VM to function properly you need to manually run your own Ansible script for staging the VM and keep track of your own snapshotting logic.
                      <br /><br />
                      For this lab to work, the 4 initially deployed VMs are sufficient.
                      <br /><br />
                      <span className="font-bold">ARE YOU SURE you want to proceed?</span>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onDeploy}>Deploy</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
          <div className="flex-1 mt-1 rounded-4xl bg-muted border shadow-sm overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeCategoryId}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.3 }}
                className="h-full"
              >
                {activeCategoryData?.content}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}

export { TabsFancy, type Category, type Item, type DeploymentStatus }