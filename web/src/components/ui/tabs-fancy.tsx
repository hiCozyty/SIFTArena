import { useState, useCallback } from "react"
import { motion, AnimatePresence } from "motion/react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { cn } from "@/lib/utils"

interface Category {
  id: string | number
  label: string
  content?: React.ReactNode
}

interface Item {
  id: string | number
  label: string
  icon?: string
}

interface TabsFancyProps {
  categories: Category[]
  items: Item[]
  defaultCategory?: Category["id"]
  activeCategory?: Category["id"]
  onCategoryChange?: (id: Category["id"]) => void
  className?: string
}

function TabsFancy({
  categories,
  items,
  defaultCategory,
  activeCategory: controlledCategory,
  onCategoryChange,
  className,
}: TabsFancyProps) {
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
      <div className="flex flex-row gap-6 rounded-xl overflow-hidden">
        <div className="w-56 flex flex-col gap-4 rounded-xl bg-muted p-3">
          <Tabs
            value={String(activeCategoryId ?? "")}
            onValueChange={handleCategoryChange}
            className="w-full"
          >
            <TabsList className="w-full">
              {categories.map((category) => (
                <TabsTrigger key={category.id} value={String(category.id)}>
                  {category.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex flex-col gap-0.5">
            {items.map((item) => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => handleDragStart(e, item)}
                className="group flex items-center w-full px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-grab active:cursor-grabbing"
              >
                <div className="flex items-center gap-3">
                  {item.icon && <span className="text-lg">{item.icon}</span>}
                  <span className="font-medium text-sm">{item.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 rounded-xl bg-card border shadow-sm overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeCategoryId}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.3 }}
              className="p-6"
            >
              {activeCategoryData?.content}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

export { TabsFancy, type Category, type Item }
