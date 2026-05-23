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
  MessageCircle,
  Monitor,
  Terminal,
  FileType2,
  Braces,
} from "lucide-react"
import { useFocusedData } from "@/hooks/use-focused-data"
import { useEffect } from "react"

function capitalize(str: string) {
  return str.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

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
          <SelectItem value="non-preconfigured">Display non-preconfigured</SelectItem>
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

function TechniqueTree() {
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
  const allIds: string[] = []

  for (const cat of categories) {
    allIds.push(cat)
    const catTechs = techniques[cat] || {}
    for (const [tid, tech] of Object.entries(catTechs)) {
      allIds.push(tid)
      for (const ability of tech.abilities) {
        allIds.push(`${tid}-${ability.ability_id}`)
        if (tid === "T1003") {
          allIds.push(`${tid}-${ability.ability_id}-info`)
          allIds.push(`${tid}-${ability.ability_id}-ansible`)
        }
      }
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
            {categories.map((cat, catIdx) => {
              const catTechs = techniques[cat] || {}
              const techEntries = Object.entries(catTechs)
              const isLastCat = catIdx === categories.length - 1

              return (
                <TreeNode key={cat} isLast={isLastCat} nodeId={cat}>
                  <TreeNodeTrigger>
                    <TreeExpander hasChildren />
                    <TreeIcon hasChildren />
                    <TreeLabel>{capitalize(cat)}</TreeLabel>
                  </TreeNodeTrigger>
                  <TreeNodeContent hasChildren>
                    {techEntries.map(([tid, tech], techIdx) => {
                      const isLastTech = techIdx === techEntries.length - 1

                      return (
                        <TreeNode key={tid} isLast={isLastTech} level={1} nodeId={tid}>
                          <TreeNodeTrigger>
                            <TreeExpander hasChildren />
                            <TreeIcon hasChildren />
                            <TreeLabel>{tid} - {tech.technique_name}</TreeLabel>
                          </TreeNodeTrigger>
                          <TreeNodeContent hasChildren>
                            {tech.abilities.map((ability, abIdx) => {
                              const isLastAb = abIdx === tech.abilities.length - 1
                              const abilityId = `${tid}-${ability.ability_id}`
                              const isT1003 = tid === "T1003"

                              return (
                                <TreeNode key={abilityId} isLast={isLastAb} level={2} nodeId={abilityId}>
                                  <TreeNodeTrigger>
                                    <TreeExpander hasChildren />
                                    <TreeIcon hasChildren />
                                    <TreeLabel>{ability.name}</TreeLabel>
                                  </TreeNodeTrigger>
                                  <TreeNodeContent hasChildren>
                                    {isT1003 && (
                                      <>
                                        <TreeNode isLast={false} level={3} nodeId={`${abilityId}-info`}>
                                          <TreeNodeTrigger>
                                            <TreeExpander />
                                            <TreeIcon icon={<FileText className="h-4 w-4" />} />
                                            <TreeLabel>info.txt</TreeLabel>
                                          </TreeNodeTrigger>
                                        </TreeNode>
                                        <TreeNode isLast level={3} nodeId={`${abilityId}-ansible`}>
                                          <TreeNodeTrigger>
                                            <TreeExpander />
                                            <TreeIcon icon={<Braces className="h-4 w-4" />} />
                                            <TreeLabel>ansible.yml</TreeLabel>
                                          </TreeNodeTrigger>
                                        </TreeNode>
                                      </>
                                    )}
                                  </TreeNodeContent>
                                </TreeNode>
                              )
                            })}
                          </TreeNodeContent>
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
  return (
    <div className="h-full rounded-lg flex">
      <div className="w-[280px] shrink-0">
        <TechniqueTree />
      </div>
      <div className="flex-1 min-w-0">
        <Tabs defaultValue="code" className="flex h-full flex-col">
          <div className="flex shrink-0 items-center justify-center">
            <TabsList>
              <TabsTrigger value="code">
                <FileText className="size-4" />
              </TabsTrigger>
              <TabsTrigger value="chat">
                <MessageCircle className="size-4" />
              </TabsTrigger>
              <TabsTrigger value="rdp">
                <Monitor className="size-4" />
              </TabsTrigger>
              <TabsTrigger value="cli">
                <Terminal className="size-4" />
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="code" className="flex-1 flex items-center justify-center rounded-4xl bg-muted shadow-sm">
            Code panel content
          </TabsContent>
          <TabsContent value="chat" className="flex-1 flex items-center justify-center rounded-4xl bg-muted shadow-sm">
            Chat panel content
          </TabsContent>
          <TabsContent value="rdp" className="flex-1 flex items-center justify-center rounded-4xl bg-muted shadow-sm">
            RDP panel content
          </TabsContent>
          <TabsContent value="cli" className="flex-1 flex items-center justify-center rounded-4xl bg-muted shadow-sm">
            CLI panel content
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
