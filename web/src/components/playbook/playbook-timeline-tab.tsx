import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import type { PlaybookData } from "@/components/playbook/playbook-content"
import type { ScenarioItem } from "@/components/attack-configuration/scenario-tab"
import { useNavigate } from "react-router-dom"

export function PlaybookTimelineTab({
  currentPlaybookData,
  scenarioItems,
  onAddNoise,
}: {
  currentPlaybookData?: PlaybookData | null
  scenarioItems: ScenarioItem[]
  onAddNoise?: () => void
}) {
  const navigate = useNavigate()

  if (!currentPlaybookData) {
    if (scenarioItems.length > 0) {
      return (
        <div className="flex h-full gap-4 p-4">
          <div className="flex-1 min-w-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timeline Events</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scenarioItems.flatMap((item, i) => {
                  const rows = []
                  rows.push(
                    <TableRow key={`noise-before-${item.id}`}>
                      <TableCell>
                        <Button variant="outline" size="sm" onClick={onAddNoise}>
                          + Add noise
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                  rows.push(
                    <TableRow key={item.id}>
                      <TableCell>{item.name}</TableCell>
                    </TableRow>
                  )
                  if (i === scenarioItems.length - 1) {
                    rows.push(
                      <TableRow key={`noise-after-${item.id}`}>
                        <TableCell>
                          <Button variant="outline" size="sm" onClick={onAddNoise}>
                            + Add noise
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  }
                  return rows
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex-1 min-w-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Persistent Background Events</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={onAddNoise}>
                      + Add noise
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      )
    }

    return (
      <div className="flex flex-col h-full items-center justify-center text-muted-foreground text-sm text-center gap-2">
        <div>please select a playbook from the left tree menu</div>
        <div>OR</div>
        <Button onClick={() => navigate("/attack-configuration?tab=scenario", { replace: true })}>
          configure a scenario in the <span className="font-bold">attack-configuration</span> tab
        </Button>
      </div>
    )
  }

  const timelineAbilities = currentPlaybookData.timelineEvents.filter((e) => "id" in e && e.id)
  const persistentBgItems = currentPlaybookData.persistentBgCommands.filter((e) => "id" in e && e.id)

  return (
    <div className="flex h-full gap-4 p-4">
      <div className="flex-1 min-w-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timeline Events</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {timelineAbilities.length === 0 ? (
              <TableRow>
                <TableCell className="text-muted-foreground text-sm">No timeline events</TableCell>
              </TableRow>
            ) : (
              timelineAbilities.map((e: Record<string, unknown>) => (
                <TableRow key={String(e.id)}>
                  <TableCell>{String(e.name)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex-1 min-w-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Persistent Background Events</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {persistentBgItems.length === 0 ? (
              <TableRow>
                <TableCell className="text-muted-foreground text-sm">No persistent background events</TableCell>
              </TableRow>
            ) : (
              persistentBgItems.map((e: Record<string, unknown>) => (
                <TableRow key={String(e.id)}>
                  <TableCell>{String(e.name)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
