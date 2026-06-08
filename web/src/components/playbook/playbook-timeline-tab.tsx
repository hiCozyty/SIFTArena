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
import { Trash2 } from "lucide-react"
import { useNavigate } from "react-router-dom"

export function PlaybookTimelineTab({
  currentPlaybookData,
  scenarioItems,
  assignedNoises,
  onAddNoise,
  onRemoveNoise,
}: {
  currentPlaybookData?: PlaybookData | null
  scenarioItems: ScenarioItem[]
  assignedNoises?: Record<string, { name: string; command: string }>
  onAddNoise?: (slotKey: string) => void
  onRemoveNoise?: (slotKey: string) => void
}) {
  const renderNoiseSlot = (slotKey: string) => {
    const assigned = assignedNoises?.[slotKey]
    if (assigned) {
      return (
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{assigned.name}</p>
            <pre className="mt-1 rounded border border-input bg-background p-2 text-xs font-mono whitespace-pre-wrap">
              {assigned.command}
            </pre>
          </div>
          <button
            className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive transition-colors"
            onClick={() => onRemoveNoise?.(slotKey)}
            aria-label="Remove noise"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )
    }
    return (
      <Button variant="outline" size="sm" onClick={() => onAddNoise?.(slotKey)}>
        + Add noise
      </Button>
    )
  }
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
                  const rows = [
                    <TableRow key={`noise-${i}`}>
                      <TableCell>
                        {renderNoiseSlot(`timeline-${i}`)}
                      </TableCell>
                    </TableRow>,
                    <TableRow key={item.id}>
                      <TableCell>{item.name}</TableCell>
                    </TableRow>,
                  ]
                  if (i === scenarioItems.length - 1) {
                    rows.push(
                      <TableRow key={`noise-end`}>
                        <TableCell>
                          {renderNoiseSlot(`timeline-${i + 1}`)}
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
                    {renderNoiseSlot("pbg-0")}
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
