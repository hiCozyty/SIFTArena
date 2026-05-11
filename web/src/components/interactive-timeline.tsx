import { motion, useInView, AnimatePresence } from "motion/react"
import { useRef, useState, useEffect } from "react"

type TimelineItem = {
  id: string
  title: string
  description: string
  date?: string
}

type InteractiveTimelineProps = {
  items?: TimelineItem[]
  maxItems?: number
}

function TimelineItemComponent({
  item,
  index,
}: {
  item: TimelineItem
  index: number
}) {
  const itemRef = useRef<HTMLDivElement>(null)
  const itemInView = useInView(itemRef, {
    once: true,
    margin: "-100px",
  })

  return (
    <div ref={itemRef} className="flex gap-3 items-center">
      <div className="flex size-10 shrink-0 items-center justify-center">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={
            itemInView ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }
          }
          transition={{ delay: index * 0.2, duration: 0.3 }}
          className="z-10 size-4 rounded-full border-2 border-primary bg-primary"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={itemInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
        transition={{
          delay: index * 0.2 + 0.3,
          type: "spring",
          stiffness: 300,
          damping: 25,
        }}
      >
        <h3 className="text-sm font-semibold leading-tight">{item.title}</h3>
        <p className="text-xs text-muted-foreground leading-tight">{item.description}</p>
      </motion.div>
    </div>
  )
}

export function InteractiveTimeline({
  items = [
    { id: "1", title: "Started", description: "Project began", date: "2024" },
    {
      id: "2",
      title: "Development",
      description: "Active development phase",
      date: "2024",
    },
    { id: "3", title: "Launch", description: "Project launched", date: "2024" },
  ],
  maxItems,
}: InteractiveTimelineProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-50px" })
  const displayItems = maxItems ? items.slice(-maxItems) : items
  const [lineHeight, setLineHeight] = useState(0)

  useEffect(() => {
    if (!ref.current || !isInView) return
    setLineHeight(ref.current.offsetHeight)
  }, [isInView, displayItems.length])

  return (
    <div ref={ref} className="relative w-full max-w-2xl">
      <motion.div
        animate={{ height: lineHeight }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="absolute left-5 top-0 w-0.5 -translate-x-1/2 origin-top bg-border"
      />

      <div className="flex flex-col gap-3">
        <AnimatePresence mode="popLayout">
          {displayItems.map((item, index) => (
            <motion.div
              key={item.id}
              layout
              exit={{ opacity: 0, y: -12, scale: 0.95 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
            >
              <TimelineItemComponent item={item} index={index} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
