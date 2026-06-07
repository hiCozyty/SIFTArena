import {
  TreeExpander,
  TreeIcon,
  TreeLabel,
  TreeNode,
  TreeNodeContent,
  TreeNodeTrigger,
  TreeProvider,
  TreeView,
} from "@/components/kibo-ui/tree"
import { FileText } from "lucide-react"
import { useState } from "react"

type PlaybookEntry = {
  id: string
  name: string
  abilities: { id: string; name: string }[]
}

const PLACEHOLDER_PLAYBOOKS: PlaybookEntry[] = [
  {
    id: "discovery",
    name: "Discovery",
    abilities: [
      { id: "discovery-network-scan", name: "Network Scan" },
      { id: "discovery-service-enum", name: "Service Enumeration" },
    ],
  },
  {
    id: "privilege-escalation",
    name: "Privilege Escalation",
    abilities: [
      { id: "pe-linux", name: "Linux PE Suite" },
      { id: "pe-windows", name: "Windows PE Suite" },
    ],
  },
  {
    id: "credential-access",
    name: "Credential Access",
    abilities: [
      { id: "cred-dump-hashes", name: "Dump Hashes" },
      { id: "cred-keylogger", name: "Keylogger" },
    ],
  },
  {
    id: "lateral-movement",
    name: "Lateral Movement",
    abilities: [
      { id: "lm-psexec", name: "PSEXEC" },
      { id: "lm-wmi", name: "WMI" },
    ],
  },
  {
    id: "exfiltration",
    name: "Exfiltration",
    abilities: [
      { id: "exfil-http", name: "HTTP POST" },
    ],
  },
]

export function PlaybookTree() {
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const allIds = PLACEHOLDER_PLAYBOOKS.flatMap((pb) => [
    pb.id,
    ...pb.abilities.map((a) => `${pb.id}-${a.id}`),
  ])

  return (
    <TreeProvider selectedIds={selectedIds} onSelectionChange={setSelectedIds} defaultExpandedIds={allIds} className="h-full">
      <div className="flex h-full flex-col">
        <div className="min-h-0 min-w-0 flex-1 max-w-full flex flex-col">
          <TreeView className="pl-0 rounded-lg m-2 -ml-[5px] flex-1 overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {PLACEHOLDER_PLAYBOOKS.map((pb, pbIdx) => {
              const isLastPb = pbIdx === PLACEHOLDER_PLAYBOOKS.length - 1

              return (
                <TreeNode key={pb.id} isLast={isLastPb} nodeId={pb.id}>
                  <TreeNodeTrigger>
                    <TreeExpander hasChildren />
                    <TreeIcon hasChildren />
                    <TreeLabel className="whitespace-normal break-words">{pb.name}</TreeLabel>
                  </TreeNodeTrigger>
                  <TreeNodeContent hasChildren>
                    {pb.abilities.map((ability, abIdx) => {
                      const isLastAb = abIdx === pb.abilities.length - 1
                      const abilityId = `${pb.id}-${ability.id}`

                      return (
                        <TreeNode key={abilityId} isLast={isLastAb} level={1} nodeId={abilityId}>
                          <TreeNodeTrigger>
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
