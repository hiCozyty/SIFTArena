import { RiBookLine } from "@remixicon/react"
import { TabContentCard } from "@/components/shared-ui-primitives/tab-content-card"
import { PlaybookTree, type PlaybookEntry } from "@/components/playbook/playbook-tree"
import { PlaybookTimelineTab } from "@/components/playbook/playbook-timeline-tab"
import { PlaybookChatTab } from "@/components/playbook/playbook-chat-tab"
import { PlaybookSettingsTab } from "@/components/playbook/playbook-settings-tab"
import { Button } from "@/components/ui/button"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { GitBranch, MessageCircle, Settings, CheckCircle2 } from "lucide-react"
import { useState } from "react"

export function PlaybookContent({
  onHasPlaybooks,
  onComplete,
}: {
  onHasPlaybooks: (hasPlaybooks: boolean) => void
  onComplete: () => void
}) {
  const [playbooks, setPlaybooks] = useState<PlaybookEntry[]>([])
  const [activeTab, setActiveTab] = useState("timeline")

  const handleAddPlaybook = () => {
    const next = [...playbooks, { id: `playbook-${Date.now()}`, name: "New Playbook", abilities: [] }]
    setPlaybooks(next)
    onHasPlaybooks(next.length > 0)
  }

  return (
    <TabContentCard className="p-6 flex flex-col min-h-0">
      <div className="mb-4 flex items-center gap-3 shrink-0">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
          <RiBookLine className="size-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Playbook</h3>
          <p className="text-muted-foreground text-sm">Signal to noise ratio analysis</p>
        </div>
      </div>
      <div className="mt-4 flex-1 min-h-0 rounded-lg flex outline outline-2 outline-yellow-400">
        <div className="w-[200px] shrink-0 overflow-hidden h-full outline outline-2 outline-white">
          <PlaybookTree playbooks={playbooks} onAddPlaybook={handleAddPlaybook} />
        </div>
        <div className="flex-1 min-w-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="timeline" className="flex h-full flex-col">
            <div className="flex shrink-0 items-center justify-between px-4 py-2">
              <TabsList>
                <TabsTrigger value="timeline">
                  <GitBranch className="size-4" />
                </TabsTrigger>
                <TabsTrigger value="chat">
                  <MessageCircle className="size-4" />
                </TabsTrigger>
                <TabsTrigger value="settings">
                  <Settings className="size-4" />
                </TabsTrigger>
              </TabsList>
              <Button onClick={onComplete}>
                <CheckCircle2 className="size-4" />
                Finish playbook configuration
              </Button>
            </div>
            <TabsContent value="timeline" className="flex-1 min-h-0 rounded-4xl bg-muted shadow-sm">
              <PlaybookTimelineTab />
            </TabsContent>
            <TabsContent value="chat" className="flex-1 min-h-0 rounded-4xl bg-muted shadow-sm">
              <PlaybookChatTab />
            </TabsContent>
            <TabsContent value="settings" className="flex-1 min-h-0 rounded-4xl bg-muted shadow-sm">
              <PlaybookSettingsTab />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </TabContentCard>
  )
}
