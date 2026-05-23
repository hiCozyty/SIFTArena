import { CalderaIcon } from "@/components/icons/caldera-icon"
import { Button } from "@/components/ui/button"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog"
import { TabContentCard } from "@/components/shared-ui-primitives/tab-content-card"
import { AttackerConfigurationUi } from "@/components/attack-configuration/attacker-configuration-ui"

export function AttackConfigurationContent({
  completed,
  onComplete,
  selectedAttackName,
}: {
  completed: boolean
  onComplete: () => void
  selectedAttackName?: string
}) {
  return (
    <TabContentCard className="p-6 flex flex-col min-h-0">
      <div className="mb-4 flex items-center gap-3 shrink-0">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
          <CalderaIcon className="size-6 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Attack Configuration</h3>
          <p className="text-muted-foreground text-sm">Select preconfigured attack or create your custom configuration</p>
        </div>
      </div>
      <p className="text-muted-foreground text-sm shrink-0">
        {selectedAttackName
          ? <>Currently selected Attack: <strong>{selectedAttackName}</strong></>
          : "Please select an attack.."
        }
        {!selectedAttackName && (
          <Dialog>
            <DialogTrigger asChild>
              <button className="ml-1 underline cursor-pointer">click here for help</button>
            </DialogTrigger>
            <DialogContent className="bg-transparent border-0 shadow-none">
              <Carousel className="w-full max-w-sm mx-auto">
                <CarouselContent>
                  <CarouselItem>
                    <div className="rounded-4xl bg-muted p-4 text-center shadow-sm">
                      <h4 className="mb-1 font-semibold">Select an Attack</h4>
                      <p className="text-sm text-muted-foreground">
                        Choose a preconfigured attack from the tree on the left, or
                        build your own using the tabs on the right.
                      </p>
                    </div>
                  </CarouselItem>
                  <CarouselItem>
                    <div className="rounded-4xl bg-muted p-4 text-center shadow-sm">
                      <h4 className="mb-1 font-semibold">Database Attacks</h4>
                      <p className="text-sm text-muted-foreground">
                        Target user tables, roles, and credentials. Configure SQL
                        injection, privilege escalation, and more.
                      </p>
                    </div>
                  </CarouselItem>
                  <CarouselItem>
                    <div className="rounded-4xl bg-muted p-4 text-center shadow-sm">
                      <h4 className="mb-1 font-semibold">API Attacks</h4>
                      <p className="text-sm text-muted-foreground">
                        Target authentication endpoints, user management APIs, and
                        other RESTful services.
                      </p>
                    </div>
                  </CarouselItem>
                </CarouselContent>
                <CarouselPrevious className="hidden sm:inline-flex" />
                <CarouselNext className="hidden sm:inline-flex" />
              </Carousel>
            </DialogContent>
          </Dialog>
        )}
      </p>
      <div className="mt-4 flex-1 min-h-0">
        <AttackerConfigurationUi />
      </div>
      <div className="mt-4 shrink-0">
        {completed ? (
          <p className="text-sm text-green-600">✓ Attack Configuration completed</p>
        ) : (
          <Button onClick={onComplete}>Complete Attack Configuration</Button>
        )}
      </div>
    </TabContentCard>
  )
}