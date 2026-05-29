---
component_id: 7.6
component_name: Range Visual Components
---

# Range Visual Components

## Component Description

Interactive visual UI for lab range topology — YAML code editor with syntax highlighting, deployment progress timeline with step-by-step status, and xyflow VM network topology graph.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/web/src/components/lab-range/yaml-topology-gui.tsx (lines 114-151)
```
export function YamlTopologyGui({
  items = [],
  className,
  cpuUsage,
  memoryUsage,
  deploymentStatus,
  isDeploying,
  yamlContent,
  onYamlChange,
  onSave,
  onRevert,
  onDeploy,
  onReset,
  saveDisabled,
  yamlErrors,
  yamlLoading,
  saveStatus,
  revertStatus,
}: YamlTopologyGuiProps) {
  const categories: Category[] = [
    {
      id: "yaml",
      label: "config.yaml",
      content: (
        <YamlCodeEditor
          yamlContent={yamlContent}
          onYamlChange={onYamlChange}
          onSave={onSave}
          onRevert={onRevert}
          saveDisabled={saveDisabled}
          yamlErrors={yamlErrors}
          yamlLoading={yamlLoading}
          saveStatus={saveStatus}
          revertStatus={revertStatus}
          isDeploying={isDeploying}
        />
      ),
    },
```

### /home/cozyty/Projects/shadowProtocol/web/src/components/lab-range/interactive-timeline.tsx (lines 89-121)
```
export function InteractiveTimeline({
  items = [
    { id: "1", title: "Started", description: "Project began", date: "2024" },
    {
      id: "2",
      title: "Development",
      description: "Active development phase",
      date: "2024",
    },
    { id: "3", title: "Launch", description: "Project launched", date: "2024" },
  ],
  maxItems,
}: InteractiveTimelineProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-50px" })
  const displayItems = maxItems ? items.slice(-maxItems) : items
  const [lineHeight, setLineHeight] = useState(0)

  useEffect(() => {
    if (!ref.current || !isInView) return
    setLineHeight(ref.current.offsetHeight)
    const observer = new ResizeObserver(() => {
      if (ref.current) setLineHeight(ref.current.offsetHeight)
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [isInView])

  return (
    <div ref={ref} className="relative w-full">
      <motion.div
        animate={{ height: lineHeight }}
        transition={{ duration: 0.5, ease: "easeOut" }}
```

### /home/cozyty/Projects/shadowProtocol/web/src/components/lab-range/vm-topology.tsx (lines 113-147)
```
export function VmTopology({ yamlContent }: { yamlContent?: string }) {
  const parsed = useMemo(() => {
    if (!yamlContent) return null
    return parseTopology(yamlContent)
  }, [yamlContent])

  const [lastValid, setLastValid] = useState<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] })

  useEffect(() => {
    if (parsed) setLastValid(parsed)
  }, [parsed])

  const nodes = parsed?.nodes ?? lastValid.nodes
  const edges = parsed?.edges ?? lastValid.edges

  return (
    <div className="h-full w-full relative">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="absolute top-3 left-3 z-10 rounded-full bg-background/60 p-1.5 backdrop-blur-sm transition-colors hover:bg-background/80">
              <Info className="size-4 text-muted-foreground" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>This topology graph is read-only. Drag-and-drop features will be added at a later time.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
```


## Source Files:

- `web/src/components/icons/ludus-icon.tsx`
- `web/src/components/lab-range/interactive-timeline.tsx`
- `web/src/components/lab-range/timeline-content.tsx`
- `web/src/components/lab-range/vm-topology.tsx`
- `web/src/components/lab-range/yaml-topology-content.tsx`
- `web/src/components/lab-range/yaml-topology-gui.tsx`

