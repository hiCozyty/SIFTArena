import { useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type TemplateItem = {
  id: number
  label: string
  subText: string
  icon: string
}

interface TemplateListContentProps {
  items: TemplateItem[]
}

export function TemplateListContent({ items }: TemplateListContentProps) {
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex-1 flex flex-col gap-0.5 overflow-y-auto" onClick={() => setSelectedItemId(null)}>
        {items.map((item) => (
          <div
            key={item.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/json", JSON.stringify(item))
              e.dataTransfer.effectAllowed = "move"
            }}
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

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full border-dashed border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/60 hover:text-foreground">
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
            <AlertDialogAction>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
