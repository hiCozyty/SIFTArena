import { cn } from "@/lib/utils"

export function TabContentCard({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "rounded-4xl border bg-card text-card-foreground shadow-sm h-[80vh]",
        className,
      )}
    >
      {children}
    </div>
  )
}