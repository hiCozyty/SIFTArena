import {
  Layers,
  Workflow,
  ListOrdered,
  Clapperboard,
  PlaySquare,
  GitBranch,
  Network,
  CircuitBoard,
  ListChecks,
  StepForward,
  ArrowRight,
  Timer,
} from "lucide-react"

const scenarioIcons = [
  { name: "Layers", icon: Layers, description: "Grouping/collection of abilities" },
  { name: "Workflow", icon: Workflow, description: "Sequential flow execution" },
  { name: "ListOrdered", icon: ListOrdered, description: "Ordered/sequential steps" },
  { name: "Clapperboard", icon: Clapperboard, description: "Literal scenario icon" },
  { name: "PlaySquare", icon: PlaySquare, description: "Run/execute scenario" },
  { name: "GitBranch", icon: GitBranch, description: "Scenario branch" },
  { name: "Network", icon: Network, description: "Connected abilities" },
  { name: "CircuitBoard", icon: CircuitBoard, description: "Connected system" },
  { name: "ListChecks", icon: ListChecks, description: "Checklist execution" },
  { name: "StepForward", icon: StepForward, description: "Step-by-step sequential" },
  { name: "ArrowRight", icon: ArrowRight, description: "Flow/progression" },
  { name: "Timer", icon: Timer, description: "Timed execution" },
]

export function PreviewUI() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="mb-8 text-2xl font-bold">Scenario Icon Options</h1>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4">
        {scenarioIcons.map(({ name, icon: Icon, description }) => (
          <div key={name} className="flex flex-col items-center gap-2 rounded-lg border p-6">
            <Icon className="size-8" />
            <span className="text-sm font-medium">{name}</span>
            <span className="text-xs text-muted-foreground">{description}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
