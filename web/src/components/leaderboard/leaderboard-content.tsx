import { Lock } from "lucide-react"
import { RiTrophyLine } from "@remixicon/react"
import { TabContentCard } from "@/components/shared-ui-primitives/tab-content-card"

export function LeaderboardContent() {
  return (
    <TabContentCard className="p-6 flex flex-col">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
          <RiTrophyLine className="size-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Leaderboard</h3>
          <p className="text-muted-foreground text-sm">Ranked player/team scores</p>
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center">
        <Lock className="mb-4 size-12 text-primary" />
        <h3 className="mb-2 text-lg font-semibold">Work in Progress</h3>
        <p className="text-sm text-muted-foreground text-center max-w-sm">
          Benchmark scoring methodology is currently being worked on.
        </p>
      </div>
    </TabContentCard>
  )
}