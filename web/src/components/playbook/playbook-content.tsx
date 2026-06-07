import { RiBookLine } from "@remixicon/react"
import { TabContentCard } from "@/components/shared-ui-primitives/tab-content-card"
import { PlaybookTree } from "@/components/playbook/playbook-tree"

export function PlaybookContent() {
  return (
    <TabContentCard className="p-6 flex flex-col min-h-0">
      <div className="mb-4 flex items-center gap-3 shrink-0">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
          <RiBookLine className="size-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Playbook</h3>
          <p className="text-muted-foreground text-sm">Signal to noise ratio analysis</p>
        </div>
      </div>
      <div className="mt-4 flex-1 min-h-0 rounded-lg flex outline outline-2 outline-yellow-400">
        <div className="w-[280px] shrink-0 overflow-hidden h-full">
          <PlaybookTree />
        </div>
        <div className="flex-1 min-w-0 flex items-center justify-center text-muted-foreground text-sm">
          placeholder content
        </div>
      </div>
    </TabContentCard>
  )
}