import { Button } from "@/components/ui/button"
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table"
import { Trash2, ListPlus } from "lucide-react"

export type ScenarioItem = {
  id: string
  name: string
  description: string
}

type ScenarioTabProps = {
  scenarioItems: ScenarioItem[]
  setScenarioItems: React.Dispatch<React.SetStateAction<ScenarioItem[]>>
}

export function ScenarioTab({ scenarioItems, setScenarioItems }: ScenarioTabProps) {
  if (scenarioItems.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <ListPlus className="size-12 opacity-50" />
        <p className="text-sm">Please select an ability on the left and add to scenario</p>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ability</TableHead>
            <TableHead className="w-0" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {scenarioItems.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.name}</TableCell>
              <TableCell className="w-0">
                <Button variant="ghost" size="icon" onClick={() => setScenarioItems((prev) => prev.filter((i) => i.id !== item.id))}>
                  <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
