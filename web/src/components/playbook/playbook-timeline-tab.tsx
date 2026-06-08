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
import { Trash2, CircleAlert } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export function PlaybookTimelineTab({
  currentPlaybookData,
  scenarioItems,
  assignedNoises,
  onAddNoise,
  onRemoveNoise,
  noises,
}: {
  currentPlaybookData?: PlaybookData | null
  scenarioItems: ScenarioItem[]
  assignedNoises?: Record<string, { name: string; command: string }>
  onAddNoise?: (slotKey: string) => void
  onRemoveNoise?: (slotKey: string) => void
  noises: Array<{ name: string; command: string; description: string }>
}) {
  const getNoiseDescription = (name: string) => noises.find(n => n.name === name)?.description
  const renderNoiseSlot = (slotKey: string) => {
    const assigned = assignedNoises?.[slotKey]
    if (assigned) {
      const description = getNoiseDescription(assigned.name)
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-1.5">
            <p className="text-sm font-semibold break-words">{assigned.name}</p>
            {description && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <CircleAlert className="size-3.5 text-muted-foreground shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent>
                    {description}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <div className="flex items-center gap-2">
            <pre className="flex-1 rounded border border-input bg-background p-2 text-xs font-mono whitespace-pre-wrap break-all">
              {assigned.command}
            </pre>
            <button
              className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
              onClick={() => onRemoveNoise?.(slotKey)}
              aria-label="Remove noise"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
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
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-normal break-words">Timeline Events</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scenarioItems.flatMap((item, i) => {
                  const rows = [
                    <TableRow key={`noise-${i}`}>
                      <TableCell className="whitespace-normal break-words">
                        {renderNoiseSlot(`timeline-${i}`)}
                      </TableCell>
                    </TableRow>,
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-normal break-words">
                        <div className="flex items-center gap-1.5">
                          <span>{item.name}</span>
                          {item.description && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <CircleAlert className="size-3.5 text-muted-foreground shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  {item.description}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>,
                  ]
                  if (i === scenarioItems.length - 1) {
                    rows.push(
                      <TableRow key={`noise-end`}>
                        <TableCell className="whitespace-normal break-words">
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
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-normal break-words">Persistent Background Events</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(() => {
                  const pbgKeys = Object.keys(assignedNoises ?? {})
                    .filter(k => k.startsWith("pbg-"))
                    .sort((a, b) => parseInt(a.replace("pbg-", ""), 10) - parseInt(b.replace("pbg-", ""), 10))
                  const nextIndex = pbgKeys.length > 0
                    ? Math.max(...pbgKeys.map(k => parseInt(k.replace("pbg-", ""), 10))) + 1
                    : 0
                  return (
                    <>
                      {pbgKeys.map(key => (
                        <TableRow key={key}>
                          <TableCell className="whitespace-normal break-words">
                            {renderNoiseSlot(key)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell className="whitespace-normal break-words">
                          {renderNoiseSlot(`pbg-${nextIndex}`)}
                        </TableCell>
                      </TableRow>
                    </>
                  )
                })()}
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

  const nonEmpty = (e: Record<string, unknown>) => Object.keys(e).length > 0

  return (
    <div className="flex h-full gap-4 p-4">
      <div className="flex-1 min-w-0">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-normal break-words">Timeline Events</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentPlaybookData.timelineEvents.filter(nonEmpty).length === 0 ? (
              <TableRow>
                <TableCell className="whitespace-normal break-words text-muted-foreground text-sm">No timeline events</TableCell>
              </TableRow>
            ) : (
              currentPlaybookData.timelineEvents.map((e, i) => {
                if (Object.keys(e).length === 0) return null
                if ("id" in e && e.id) {
                  return (
                    <TableRow key={String(e.id)}>
                      <TableCell className="whitespace-normal break-words">
                        <div className="flex items-center gap-1.5">
                          <span>{String(e.name)}</span>
                          {e.description && String(e.description) && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <CircleAlert className="size-3.5 text-muted-foreground shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  {String(e.description)}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                }
                return (
                  <TableRow key={`noise-${i}`}>
                    <TableCell className="whitespace-normal break-words">
                      <div>
                        <div className="flex items-center justify-between gap-1.5">
                          <p className="text-sm font-semibold text-muted-foreground break-words">
                            Noise: {String(e.name ?? "")}
                          </p>
                          {e.name && getNoiseDescription(String(e.name)) && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <CircleAlert className="size-3.5 text-muted-foreground shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  {getNoiseDescription(String(e.name))}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <pre className="mt-1 rounded border border-input bg-background p-2 text-xs font-mono whitespace-pre-wrap break-all">
                          {String(e.command ?? "")}
                        </pre>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex-1 min-w-0">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-normal break-words">Persistent Background Events</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentPlaybookData.persistentBgCommands.filter(nonEmpty).length === 0 ? (
              <TableRow>
                <TableCell className="whitespace-normal break-words text-muted-foreground text-sm">No persistent background events</TableCell>
              </TableRow>
            ) : (
              currentPlaybookData.persistentBgCommands.map((e, i) => {
                if (Object.keys(e).length === 0) return null
                return (
                  <TableRow key={`pbg-${i}`}>
                    <TableCell className="whitespace-normal break-words">
                      <div>
                        <div className="flex items-center justify-between gap-1.5">
                          <p className="text-sm font-semibold text-muted-foreground break-words">
                            Noise: {String(e.name ?? "")}
                          </p>
                          {e.name && getNoiseDescription(String(e.name)) && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <CircleAlert className="size-3.5 text-muted-foreground shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  {getNoiseDescription(String(e.name))}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <pre className="mt-1 rounded border border-input bg-background p-2 text-xs font-mono whitespace-pre-wrap break-all">
                          {String(e.command ?? "")}
                        </pre>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
