import { RiVoiceprintLine } from "@remixicon/react"
import { TabContentCard } from "@/components/shared-ui-primitives/tab-content-card"

export function SnrContent() {
  return (
    <TabContentCard className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
          <RiVoiceprintLine className="size-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">SnR</h3>
          <p className="text-muted-foreground text-sm">Signal to noise ratio analysis</p>
        </div>
      </div>
      <p className="text-muted-foreground text-sm">
        Content for <strong>SnR</strong> goes here.
      </p>
    </TabContentCard>
  )
}