import { useRef, useEffect } from "react"
import { motion, AnimatePresence } from "motion/react"

type HorizontalTimelineProps<T extends { id: string | number }> = {
  items: T[]
  renderNode: (item: T, index: number, above: boolean) => React.ReactNode
  getItemStatus?: (item: T, index: number) => "running" | "success" | "error" | undefined
  maxWidth?: string
  autoScroll?: boolean
  className?: string
}

function Dot({ status }: { status?: string }) {
  if (status === "running") {
    return (
      <motion.div
        className="size-4 rounded-full border-2 border-primary bg-primary"
        animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
        transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
      />
    )
  }

  return <div className="size-4 rounded-full border-2 border-primary bg-primary" />
}

function Connector() {
  return <div className="h-0.5 w-16 shrink-0 self-center bg-border" />
}

export function HorizontalTimeline<T extends { id: string | number }>({
  items,
  renderNode,
  getItemStatus,
  maxWidth = "600px",
  autoScroll = true,
  className,
}: HorizontalTimelineProps<T>) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!autoScroll) return
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [items.length, autoScroll])

  return (
    <div
      className={className}
      style={{ width: maxWidth }}
    >
      <div className="flex h-full items-stretch pr-12 py-8">
        <AnimatePresence mode="popLayout">
          {items.map((item, i) => (
            <div key={item.id} className="flex items-stretch gap-1">
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="grid w-28"
                style={{ gridTemplateRows: "1fr auto 1fr" }}
              >
                <div className="flex items-end pb-2">
                  {i % 2 === 0 ? renderNode(item, i, true) : null}
                </div>
                <div className="flex justify-center">
                  <Dot status={getItemStatus?.(item, i)} />
                </div>
                <div className="flex items-start pt-2">
                  {i % 2 !== 0 ? renderNode(item, i, false) : null}
                </div>
              </motion.div>
              {i < items.length - 1 && (
                <>
                  <Connector />
                  <div className="w-1 shrink-0 self-center" />
                </>
              )}
            </div>
          ))}
        </AnimatePresence>
        <div ref={endRef} className="w-4 shrink-0" />
      </div>
    </div>
  )
}
