import { CalderaIcon } from "@/components/icons/caldera-icon"
import { Button } from "@/components/ui/button"
import { TabContentCard } from "@/components/shared-ui-primitives/tab-content-card"

export function AttackConfigurationContent({
  completed,
  onComplete,
}: {
  completed: boolean
  onComplete: () => void
}) {
  return (
    <TabContentCard className="p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
          <CalderaIcon className="size-6 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Attack Configuration</h3>
          <p className="text-muted-foreground text-sm">Configure attack parameters</p>
        </div>
      </div>
      <p className="text-muted-foreground text-sm">
        Content for <strong>Attack Configuration</strong> goes here.
      </p>
      <div className="mt-4">
        {completed ? (
          <p className="text-sm text-green-600">✓ Attack Configuration completed</p>
        ) : (
          <Button onClick={onComplete}>Complete Attack Configuration</Button>
        )}
      </div>
    </TabContentCard>
  )
}