import { BrandSpeedtestIcon } from "@/components/icons/tabler-brand-speedtest"
import { TabContentCard } from "@/components/shared-ui-primitives/tab-content-card"

export function BenchmarkContent() {
  return (
    <TabContentCard className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
          <BrandSpeedtestIcon className="size-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Run Benchmark</h3>
          <p className="text-muted-foreground text-sm">Execute performance benchmarks</p>
        </div>
      </div>
      <p className="text-muted-foreground text-sm">
        Content for <strong>Run Benchmark</strong> goes here.
      </p>
    </TabContentCard>
  )
}