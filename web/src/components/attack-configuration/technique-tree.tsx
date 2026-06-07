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
import { FileText, ChevronsUpDown, Plus, Trash2 } from "lucide-react"
import { type Technique, type AtomicAbility, type FocusedDataStatus } from "@/hooks/use-focused-data"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

export type SelectedItem =
  | { type: "ability"; tid: string; abilityId: string; name: string; description: string | undefined; command: string; winPrereq: string }
  | { type: "negative-control" }
  | { type: "technique"; tid: string; name: string }
  | { type: "create-ability" }
  | { type: "none" }

function TreeControls({ allIds, filterMode, onFilterChange }: { allIds: string[]; filterMode: string; onFilterChange: (v: string) => void }) {
  const { expandedIds, setExpandedIds } = useTree()
  const isAllExpanded = allIds.every((id) => expandedIds.has(id))

  return (
    <div className="flex items-center gap-2">
      <Select value={filterMode} onValueChange={onFilterChange}>
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

function TechniqueTreeContent({ onSelect, onCreate, onDelete, allTechniques }: { onSelect: (item: SelectedItem) => void; onCreate: () => void; onDelete?: (abilityId: string) => void; allTechniques: { tid: string; tech: Technique }[] }) {
  return (
    <div className="min-h-0 min-w-0 flex-1 max-w-full flex flex-col">
      <TreeView className="pl-0 rounded-lg m-2 -ml-[5px] flex-1 overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                {tech.abilities.map((ability: AtomicAbility, abIdx: number) => {
                  const isLastAb = abIdx === tech.abilities.length - 1
                  const abilityId = `${tid}-${ability.ability_id}`

                  return (
                    <TreeNode key={abilityId} isLast={isLastAb} level={1} nodeId={abilityId}>
                      <TreeNodeTrigger onClick={() => onSelect({ type: "ability", tid, abilityId: ability.ability_id, name: ability.name, description: ability.description, command: ability.command ?? "(no command)", winPrereq: ability.win_prereq ?? "" })}>
                        <TreeIcon icon={<FileText className="h-4 w-4" />} />
                        <TreeLabel className="whitespace-normal break-words">{ability.name}</TreeLabel>
                        {ability.custom && onDelete && (
                          <button
                            type="button"
                            className="ml-auto flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={(e) => { e.stopPropagation(); onDelete(ability.ability_id) }}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </TreeNodeTrigger>
                    </TreeNode>
                  )
                })}
              </TreeNodeContent>
            </TreeNode>
          )
        })}
      </TreeView>
      <div className="shrink-0 p-2">
        <Button className="w-full" onClick={onCreate}>
          <Plus className="size-4" />
          Create an ability
        </Button>
      </div>
    </div>
  )
}

export function TechniqueTree({ onSelect, onDelete, status }: { onSelect: (item: SelectedItem) => void; onDelete?: (abilityId: string) => void; status: FocusedDataStatus }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [filterMode, setFilterMode] = useState("all")
  const suppressNoneRef = useRef(false)

  useEffect(() => {
    if (selectedIds.length === 0 && !suppressNoneRef.current) {
      onSelect({ type: "none" })
    }
    suppressNoneRef.current = false
  }, [selectedIds, onSelect])

  const handleCreate = useCallback(() => {
    suppressNoneRef.current = true
    setSelectedIds([])
    onSelect({ type: "create-ability" })
  }, [onSelect])

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

  const filtered =
    filterMode === "all"
      ? allTechniques
      : allTechniques
          .map(({ tid, tech }) => ({
            tid,
            tech: { ...tech, abilities: tech.abilities.filter(a => a.custom === (filterMode === "non-preconfigured")) },
          }))
          .filter(({ tech }) => tech.abilities.length > 0)

  const allIds: string[] = []
  for (const { tid, tech } of filtered) {
    allIds.push(tid)
    for (const ability of tech.abilities) {
      allIds.push(`${tid}-${ability.ability_id}`)
    }
  }

  return (
    <TreeProvider key={filterMode} selectedIds={selectedIds} onSelectionChange={setSelectedIds} defaultExpandedIds={allIds} className="h-full">
      <div className="flex h-full flex-col">
        <div className="shrink-0">
          <TreeControls allIds={allIds} filterMode={filterMode} onFilterChange={setFilterMode} />
        </div>
        <TechniqueTreeContent onSelect={onSelect} onCreate={handleCreate} onDelete={onDelete} allTechniques={filtered} />
      </div>
    </TreeProvider>
  )
}
