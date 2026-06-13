import { useState } from "react"
import { Button } from "@/components/ui/button"
import { HorizontalTimeline } from "@/components/ui/horizontal-timeline"
import { Plus } from "lucide-react"

type TimelineItem = {
  id: number
  title: string
  description: string
  time: string
}

const EVENTS = [
  { title: "Event Detected", description: "Anomalous network activity observed." },
  { title: "Alert Triggered", description: "Threshold exceeded on sensor." },
  { title: "Investigation Started", description: "Forensic agent deployed to host." },
  { title: "Evidence Collected", description: "Memory dump and disk image captured." },
  { title: "Analysis Complete", description: "Correlation with known TTPs confirmed." },
  { title: "Report Generated", description: "Executive summary delivered to SOC." },
]

let cursor = 0
function makeItem(): TimelineItem {
  const e = EVENTS[cursor++ % EVENTS.length]
  return {
    id: Date.now(),
    time: new Date().toLocaleTimeString(),
    title: e.title,
    description: e.description,
  }
}

export function PrototypeUI5() {
  const [items, setItems] = useState<TimelineItem[]>(() => {
    const initial: TimelineItem[] = []
    for (let i = 0; i < 10; i++) initial.push(makeItem())
    return initial
  })

  return (
    <div className="flex h-screen flex-col">
      <div className="flex shrink-0 items-center gap-4 border-b px-6 py-3">
        <span className="text-sm font-medium">Horizontal Timeline</span>
        <span className="text-xs text-muted-foreground">
          {items.length} event{items.length !== 1 ? "s" : ""}
        </span>
        <div className="ml-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setItems((p) => [...p, makeItem()])}
          >
            <Plus className="size-3.5" />
            Add Event
          </Button>
        </div>
      </div>

      <div className="flex-1 p-8">
        <div className="h-full w-[600px] overflow-x-auto rounded-lg border border-border">
          <HorizontalTimeline
            items={items}
            renderNode={(item, _index, _above) => (
              <div className="w-56">
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span className="shrink-0 text-xs text-muted-foreground">{item.time}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">—</span>
                  <h3 className="min-w-0 truncate text-sm font-semibold">{item.title}</h3>
                </div>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
            )}
          />
        </div>
      </div>
    </div>
  )
}
