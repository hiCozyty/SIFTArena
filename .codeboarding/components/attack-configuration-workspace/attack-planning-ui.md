---
component_id: 6.3
component_name: Attack Planning UI
---

# Attack Planning UI

## Component Description

Visual attack configuration surface — ability detail panel with copy-to-execute commands, MITRE ATT&CK technique tree browser, and selected-attack state management.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/web/src/components/attack-configuration/ability-info-tab.tsx (lines 41-89)
```
export function AbilityInfoTab({ content }: AbilityInfoTabProps) {
  if (content === null) {
    return (
      <div className="flex h-full items-center justify-center p-4 font-mono text-sm text-muted-foreground">
        Please select an ability.
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col p-4 font-mono text-sm overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="mb-4">
        <span className="font-bold">Name:</span> {content.name}
      </div>
      {content.abilityId && (
        <div className="mb-4">
          <span className="font-bold">Ability ID:</span> {content.abilityId}
        </div>
      )}
      <div className="mb-4">
        <span className="font-bold">Description:</span> {content.description}
      </div>
      <div className="mb-4">
        <span className="font-bold">Command:</span> {content.command}
      </div>
      {content.downloadInstructions && (
        <div className="mt-6 border-t pt-4">
          {(() => {
            const lines = content.downloadInstructions.split("\n")
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
                    <CopyCommandBlock commands={commands} />
                  </div>
                )}
              </>
            )
          })()}
```

### /home/cozyty/Projects/shadowProtocol/web/src/components/attack-configuration/technique-tree.tsx (lines 58-111)
```
function TechniqueTreeContent({ onSelect, allTechniques }: { onSelect: (item: SelectedItem) => void; allTechniques: { tid: string; tech: Technique }[] }) {
  const { selectedIds } = useTree()

  useEffect(() => {
    if (selectedIds.length === 0) {
      onSelect({ type: "none" })
    }
  }, [selectedIds, onSelect])

  const allIds: string[] = []
  for (const { tid, tech } of allTechniques) {
    allIds.push(tid)
    for (const ability of tech.abilities) {
      allIds.push(`${tid}-${ability.ability_id}`)
    }
  }

  return (
    <div className="min-h-0 min-w-0 flex-1 max-w-full">
      <TreeView className="pl-0 rounded-lg m-2 -ml-[5px] h-[415px] overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
```


