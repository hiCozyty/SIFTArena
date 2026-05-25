import { Button } from "@/components/ui/button"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  TreeExpander,
  TreeIcon,
  TreeLabel,
  TreeNode,
  TreeNodeContent,
  TreeNodeTrigger,
  TreeProvider,
  TreeView,
  useTree,
} from "@/components/kibo-ui/tree"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ChevronsUpDown,
  FileText,
  ListChecks,
  MessageCircle,
} from "lucide-react"
import { useFocusedData } from "@/hooks/use-focused-data"
import { useEffect, useState } from "react"

type SelectedItem =
  | { type: "ability"; tid: string; abilityId: string; name: string; description: string | undefined; command: string; downloadInstructions: string }
  | { type: "negative-control" }
  | { type: "technique"; tid: string; name: string }

function TreeControls({ allIds }: { allIds: string[] }) {
  const { expandedIds, setExpandedIds } = useTree()
  const isAllExpanded = allIds.every((id) => expandedIds.has(id))

  return (
    <div className="flex items-center gap-2">
      <Select defaultValue="all">
        <SelectTrigger size="sm" className="w-[180px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Display all (default)</SelectItem>
          <SelectItem value="preconfigured">Display preconfigured</SelectItem>
          <SelectItem value="non-preconfigured">Display custom</SelectItem>
        </SelectContent>
      </Select>
      <button
        type="button"
        onClick={() =>
          setExpandedIds(isAllExpanded ? new Set() : new Set(allIds))
        }
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      >
        <ChevronsUpDown className="size-4" />
      </button>
    </div>
  )
}

function TechniqueTree({ onSelect }: { onSelect: (item: SelectedItem) => void }) {
  const { status, fetch } = useFocusedData()

  useEffect(() => {
    fetch()
  }, [fetch])

  if (status.type === "loading") {
    return <div className="p-4 text-sm text-muted-foreground">Loading...</div>
  }

  if (status.type === "error") {
    return <div className="p-4 text-sm text-destructive">Error: {status.message}</div>
  }

  if (status.type !== "success") {
    return null
  }

  const { categories, techniques } = status.data

  const allTechniques: { tid: string; tech: typeof techniques[string][string] }[] = []
  for (const cat of categories) {
    const catTechs = techniques[cat] || {}
    for (const [tid, tech] of Object.entries(catTechs)) {
      allTechniques.push({ tid, tech })
    }
  }

  const allIds: string[] = []
  for (const { tid, tech } of allTechniques) {
    allIds.push(tid)
    for (const ability of tech.abilities) {
      allIds.push(`${tid}-${ability.ability_id}`)
    }
  }

  return (
    <TreeProvider defaultExpandedIds={allIds}>
      <div className="flex h-full flex-col">
        <div className="shrink-0">
          <TreeControls allIds={allIds} />
        </div>
        <div className="min-h-0 min-w-0 flex-1 max-w-full">
          <TreeView className="pl-0 rounded-lg m-2 -ml-[5px] h-[450px] overflow-auto">
            <TreeNode key="negative-control" isLast={allTechniques.length === 0} nodeId="negative-control">
              <TreeNodeTrigger onClick={() => onSelect({ type: "negative-control" })}>
                <TreeIcon icon={<FileText className="h-4 w-4" />} />
                <TreeLabel className="whitespace-normal break-words">Negative Control</TreeLabel>
              </TreeNodeTrigger>
            </TreeNode>
            {allTechniques.map(({ tid, tech }, techIdx) => {
              const isLastTech = techIdx === allTechniques.length - 1

              return (
                <TreeNode key={tid} isLast={isLastTech} nodeId={tid}>
                  <TreeNodeTrigger onClick={() => onSelect({ type: "technique", tid, name: tech.technique_name })}>
                    <TreeExpander hasChildren />
                    <TreeIcon hasChildren />
                    <TreeLabel className="whitespace-normal break-words">{tid} - {tech.technique_name}</TreeLabel>
                  </TreeNodeTrigger>
                  <TreeNodeContent hasChildren>
                    {tech.abilities.map((ability, abIdx) => {
                      const isLastAb = abIdx === tech.abilities.length - 1
                      const abilityId = `${tid}-${ability.ability_id}`

                      return (
                        <TreeNode key={abilityId} isLast={isLastAb} level={1} nodeId={abilityId}>
                          <TreeNodeTrigger onClick={() => onSelect({ type: "ability", tid, abilityId: ability.ability_id, name: ability.name, description: ability.description, command: ability.executors[0]?.command ?? "(no command)", downloadInstructions: ability.download_instructions ?? "" })}>
                            <TreeIcon icon={<FileText className="h-4 w-4" />} />
                            <TreeLabel className="whitespace-normal break-words">{ability.name}</TreeLabel>
                          </TreeNodeTrigger>
                        </TreeNode>
                      )
                    })}
                  </TreeNodeContent>
                </TreeNode>
              )
            })}
          </TreeView>
        </div>
      </div>
    </TreeProvider>
  )
}

export function AttackerConfigurationUi() {
  const [selected, setSelected] = useState<SelectedItem>({ type: "negative-control" })

  const displayContent = (() => {
    if (selected.type === "negative-control") {
      return { name: "Negative Control", abilityId: "", description: "An empty ability that does nothing.", command: "(none)", downloadInstructions: "" }
    }
    if (selected.type === "technique") {
      return null
    }
    return { name: selected.name, abilityId: selected.abilityId, description: selected.description ?? "(no description)", command: selected.command, downloadInstructions: selected.downloadInstructions }
  })()

  return (
    <div className="h-full rounded-lg flex">
      <div className="w-[280px] shrink-0">
        <TechniqueTree onSelect={setSelected} />
      </div>
      <div className="flex-1 min-w-0">
        <Tabs defaultValue="code" className="flex h-full flex-col">
          <div className="flex shrink-0 items-center justify-between px-4 py-2">
            <TabsList>
              <TabsTrigger value="code">
                <FileText className="size-4" />
              </TabsTrigger>
              <TabsTrigger value="chat">
                <MessageCircle className="size-4" />
              </TabsTrigger>
              <TabsTrigger value="scenario">
                <ListChecks className="size-4" />
              </TabsTrigger>
            </TabsList>
            <Button disabled={selected.type === "technique"}>Add to Scenario</Button>
          </div>
          <TabsContent value="code" className="flex-1 min-h-0 rounded-4xl bg-muted shadow-sm">
            {displayContent === null ? (
              <div className="flex h-full items-center justify-center p-4 font-mono text-sm text-muted-foreground">
                Please select an ability.
              </div>
            ) : (
              <div className="flex h-full flex-col p-4 font-mono text-sm overflow-auto">
                <div className="mb-4">
                  <span className="font-bold">Name:</span> {displayContent.name}
                </div>
                {displayContent.abilityId && (
                  <div className="mb-4">
                    <span className="font-bold">Ability ID:</span> {displayContent.abilityId}
                  </div>
                )}
                <div className="mb-4">
                  <span className="font-bold">Description:</span> {displayContent.description}
                </div>
                <div className="mb-4">
                  <span className="font-bold">Command:</span> {displayContent.command}
                </div>
                {displayContent.downloadInstructions && (
                  <div className="mt-6 border-t pt-4">
                    {(() => {
                      const lines = displayContent.downloadInstructions.split("\n")
                      const titleIndex = lines.findIndex(l => l.includes("Prerequisites (Manual Step Required)"))
                      const payloadIndex = lines.findIndex(l => l.startsWith("Payload:"))

                      const warningLines = lines.slice(titleIndex + 1, payloadIndex >= 0 ? payloadIndex : undefined).join("\n").trim()
                      const payloadLine = payloadIndex >= 0 ? lines[payloadIndex] : ""
                      const commands = payloadIndex >= 0 ? lines.slice(payloadIndex + 1).join("\n").trim() : ""

                      return (
                        <>
                          <div className="mb-2 font-bold">Prerequisites (Manual Step Required)</div>
                          <p className="mb-3 text-muted-foreground whitespace-pre-wrap">{warningLines}</p>
                          {payloadLine && <p className="mb-2 font-medium">{payloadLine}</p>}
                          {commands && (
                            <div className="relative mt-3">
                              <pre className="bg-background/50 p-3 rounded text-xs overflow-x-auto">
                                <code>{commands}</code>
                              </pre>
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}
          </TabsContent>
          <TabsContent value="chat" className="flex-1 flex items-center justify-center rounded-4xl bg-muted shadow-sm">
            Chat panel content
          </TabsContent>
          <TabsContent value="scenario" className="flex-1 flex items-center justify-center rounded-4xl bg-muted shadow-sm">
            Scenario panel content
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
