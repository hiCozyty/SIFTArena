import { CalderaIcon } from "@/components/icons/caldera-icon"
import { Button } from "@/components/ui/button"
import { TabContentCard } from "@/components/shared-ui-primitives/tab-content-card"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { FileText, MessageCircle, ListChecks, Trash2, ListPlus, Terminal } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { TechniqueTree, type SelectedItem } from "@/components/attack-configuration/technique-tree"
import { AbilityInfoTab } from "@/components/attack-configuration/ability-info-tab"
import { AiChatTab } from "@/components/attack-configuration/ai-chat-tab"
import { useOpencodeChat } from "@/hooks/use-opencode-chat"
import { Item, ItemContent, ItemMedia, ItemTitle, ItemDescription, ItemActions, ItemGroup } from "@/components/ui/item"

type ScenarioItem = {
  id: string
  name: string
  description: string
}

function AttackerConfigurationUi() {
  const [selected, setSelected] = useState<SelectedItem>({ type: "none" })
  const [activeTab, setActiveTab] = useState("ability")

  useEffect(() => {
    if (selected.type === "create-ability") {
      setActiveTab("ability")
    }
  }, [selected])
  const [scenarioItems, setScenarioItems] = useState<ScenarioItem[]>([])
  const chat = useOpencodeChat()

  const handleClearChat = useCallback(async () => {
    await chat.resetSession()
  }, [chat])

  const handleAddToScenario = useCallback(() => {
    if (selected.type !== "ability" && selected.type !== "negative-control") return
    setScenarioItems((prev) => [
      ...prev,
      { id: `${selected.type === "ability" ? selected.abilityId : "negative-control"}-${Date.now()}`, name: selected.type === "ability" ? selected.name : "Negative Control", description: selected.type === "ability" ? (selected.description ?? "(no description)") : "An empty ability that does nothing." },
    ])
  }, [selected])

  const displayContent = (() => {
    if (selected.type === "none") {
      return null
    }
    if (selected.type === "negative-control") {
      return { name: "Negative Control", abilityId: "", description: "An empty ability that does nothing.", command: "(none)", kaliPrereq: "", winPrereq: "" }
    }
    if (selected.type === "technique" || selected.type === "create-ability") {
      return null
    }
    return { name: selected.name, abilityId: selected.abilityId, description: selected.description ?? "(no description)", command: selected.command, kaliPrereq: selected.kaliPrereq, winPrereq: selected.winPrereq }
  })()

  const variantMessage = (() => {
    if (selected.type === "ability") {
      return `create an existing ability variant for "${selected.name}"\nDescription: ${selected.description ?? "(no description)"}\nCommand: ${selected.command}\nKali prerequisites: ${selected.kaliPrereq || "(none)"}\nWindows prerequisites: ${selected.winPrereq || "(none)"}`
    }
    if (selected.type === "create-ability") {
      return "Create a new ability"
    }
    return ""
  })()

  return (
    <div className="h-full rounded-lg flex">
      <div className="w-[280px] shrink-0 overflow-hidden h-full">
        <TechniqueTree onSelect={setSelected} />
      </div>
      <div className="w-[500px] min-w-0">
        <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="ability" className="flex h-full flex-col">
          <div className="flex shrink-0 items-center justify-between px-4 py-2">
            <TabsList>
              <TabsTrigger value="ability">
                <FileText className="size-4" />
              </TabsTrigger>
              <TabsTrigger value="chat">
                <MessageCircle className="size-4" />
              </TabsTrigger>
              <TabsTrigger value="scenario">
                <ListChecks className="size-4" />
              </TabsTrigger>
            </TabsList>
            {activeTab === "chat" ? (
              <Button onClick={handleClearChat}>Clear Chat Session</Button>
            ) : activeTab === "scenario" ? (
              <div className="flex items-center gap-2">
                <Button onClick={() => setScenarioItems([])}>Clear Scenario</Button>
                <Button disabled={selected.type === "technique" || selected.type === "none" || selected.type === "create-ability"} onClick={handleAddToScenario}>Add to Scenario</Button>
              </div>
            ) : (
              <Button disabled={selected.type === "technique" || selected.type === "none" || selected.type === "create-ability"} onClick={handleAddToScenario}>Add to Scenario</Button>
            )}
          </div>
          <TabsContent value="ability" className="flex-1 min-h-0 rounded-4xl bg-muted shadow-sm">
            <AbilityInfoTab content={displayContent} mode={selected.type === "create-ability" ? "write" : "read"} />
          </TabsContent>
          <TabsContent value="chat" className="flex-1 min-h-0 rounded-4xl bg-muted shadow-sm">
            <AiChatTab variantMessage={variantMessage} variantLabel={selected.type === "ability" ? selected.name : undefined} {...chat} />
          </TabsContent>
          <TabsContent value="scenario" className="flex-1 min-h-0 flex flex-col rounded-4xl bg-muted shadow-sm p-4">
            {scenarioItems.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <ListPlus className="size-12 opacity-50" />
                <p className="text-sm">Please select an ability on the left and add to scenario</p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <ItemGroup>
                  {scenarioItems.map((item) => (
                    <Item key={item.id}>
                      <ItemMedia>
                        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          <Terminal className="size-5 text-primary" />
                        </div>
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>{item.name}</ItemTitle>
                        <ItemDescription>{item.description}</ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <Button variant="ghost" size="icon" onClick={() => setScenarioItems((prev) => prev.filter((i) => i.id !== item.id))}>
                          <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </ItemActions>
                    </Item>
                  ))}
                </ItemGroup>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

export function AttackConfiguration({
  completed,
  onComplete,
}: {
  completed: boolean
  onComplete: () => void
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
