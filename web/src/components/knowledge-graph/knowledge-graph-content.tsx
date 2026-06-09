import { Lock } from "lucide-react"
import { TabContentCard } from "@/components/shared-ui-primitives/tab-content-card"

export function KnowledgeGraphContent() {
  return (
    <TabContentCard className="py-16 flex flex-col items-center justify-center">
      <Lock className="mb-4 size-12 text-muted-foreground" />
      <h3 className="mb-2 text-lg font-semibold">Knowledge Graph is locked</h3>
      <p className="text-sm text-muted-foreground">
        This functionality is currently being worked on. Please check back later.
      </p>
    </TabContentCard>
  )
}