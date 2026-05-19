import { MeshNetworkIcon } from "@/components/icons/game-icons-mesh-network"
import { TabContentCard } from "@/components/shared-ui-primitives/tab-content-card"

export function KnowledgeGraphContent() {
  return (
    <TabContentCard className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
          <MeshNetworkIcon className="size-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Knowledge Graph</h3>
          <p className="text-muted-foreground text-sm">
            Knowledge graph visualization and exploration
          </p>
        </div>
      </div>
      <p className="text-muted-foreground text-sm">
        Content for <strong>Knowledge Graph</strong> goes here.
      </p>
    </TabContentCard>
  )
}