import { SiftAgentIcon } from "@/components/icons/sift-agent-icon"
import { Button } from "@/components/ui/button"
import { TabContentCard } from "@/components/shared-ui-primitives/tab-content-card"

export function SiftAgentContent({
  configured,
  onConfigured,
}: {
  configured: boolean
  onConfigured: () => void
}) {
  return (
    <TabContentCard className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
          <SiftAgentIcon className="size-[1.375rem] text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">SIFT Agent</h3>
          <p className="text-muted-foreground text-sm">Select deployed SIFT agents</p>
        </div>
      </div>
      <p className="text-muted-foreground text-sm">
        Content for <strong>SIFT Agent</strong> goes here.
      </p>
      <div className="mt-4">
        {configured ? (
          <p className="text-sm text-green-600">✓ SIFT Agent configured</p>
        ) : (
          <Button onClick={onConfigured}>Configure SIFT Agent</Button>
        )}
      </div>
    </TabContentCard>
  )
}