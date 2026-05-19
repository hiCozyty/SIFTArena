import { LudusIcon } from "@/components/icons/ludus-icon"
import { InteractiveTimeline } from "@/components/lab-range/interactive-timeline"
import type { TimelineItem } from "@/components/lab-range/use-lab-range-state"

export function TimelineContent({ items }: { items: TimelineItem[] }) {
  return (
    <>
      <div className="mb-4 flex shrink-0 items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
          <LudusIcon className="size-6 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Ludus Lab Range</h3>
          <p className="text-muted-foreground text-sm">Lab provisioning and management</p>
        </div>
      </div>
      <div className="shrink-0">
        <InteractiveTimeline items={items} maxItems={3} />
      </div>
    </>
  )
}