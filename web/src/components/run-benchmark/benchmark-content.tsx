import { useRef, useEffect, useState } from "react"
import { BrandSpeedtestIcon } from "@/components/icons/tabler-brand-speedtest"
import { TabContentCard } from "@/components/shared-ui-primitives/tab-content-card"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { SiftAgentTree } from "@/components/sift-agent/sift-agent-tree"

const LOGS = [
  "Initializing environment...",
  "Loading LSASS dump module...",
  "Executing attack chain...",
  "Collecting evidence artifacts...",
  "Processing memory snapshot...",
  "Analyzing network captures...",
  "Generating timeline...",
]

export function BenchmarkContent() {
  const logRef = useRef<HTMLDivElement>(null)
  const [playbookFinished, setPlaybookFinished] = useState(false)

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [])

  return (
    <TabContentCard className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
          <BrandSpeedtestIcon className="size-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Run Benchmark</h3>
          <p className="text-muted-foreground text-sm">Execute performance benchmarks</p>
        </div>
      </div>
      <Accordion type="single" collapsible defaultValue="playbook-settings">
        <AccordionItem value="playbook-settings">
          <AccordionTrigger>Playbook Settings</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">Select Model:</span>
                <Select defaultValue="gpt-4">
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gpt-4">GPT-4</SelectItem>
                    <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                    <SelectItem value="claude-3.5">Claude 3.5 Sonnet</SelectItem>
                    <SelectItem value="claude-3-opus">Claude 3 Opus</SelectItem>
                    <SelectItem value="gemini-1.5">Gemini 1.5 Pro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">Current Playbook Selected:</span>
                <span className="text-muted-foreground text-sm">T1003.001 LSASS Dump</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">Current Workflow Selected:</span>
                <span className="text-muted-foreground text-sm">Full Attack Chain</span>
              </div>
              <Button>Run playbook</Button>
              <div className="flex items-center gap-2">
                <Progress value={45} className="w-48" />
                <span className="text-muted-foreground text-xs">45%</span>
              </div>
              <div
                ref={logRef}
                className="max-h-16 overflow-y-auto rounded-2xl bg-muted/50 p-2 font-mono text-xs text-muted-foreground"
              >
                {LOGS.map((log, i) => (
                  <p key={i}>{log}</p>
                ))}
              </div>
              <Button
                variant="secondary"
                onClick={() => setPlaybookFinished(true)}
              >
                Finish playbook
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="evidence-collection" disabled={!playbookFinished}>
          <AccordionTrigger>
            Evidence Collection
            {!playbookFinished && (
              <span className="ml-1 text-muted-foreground font-normal">(Run Playbook First)</span>
            )}
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid gap-4 rounded-xl p-1 h-[440px]" style={{ gridTemplateColumns: "220px 1fr" }}>
              <div className="rounded-xl border bg-muted/30 p-3">
                <SiftAgentTree
                  workflows={[]}
                  selectedNodeId={null}
                />
              </div>
              <div className="overflow-auto rounded-xl border bg-zinc-950 p-3">
                <pre className="font-mono text-xs text-zinc-300">
                  <code>{`{
  "artifact": "lsass.dmp",
  "size": "42 MB",
  "hash": "sha256:a1b2c3...",
  "tags": ["credential", "memory"]
}`}</code>
                </pre>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="timeline-analysis" disabled>
          <AccordionTrigger>
            Timeline and Analysis
            <span className="ml-1 text-muted-foreground font-normal">(Run Evidence Collection First)</span>
          </AccordionTrigger>
          <AccordionContent>
            <p className="text-muted-foreground text-sm">
              Content for <strong>Timeline and Analysis</strong> goes here.
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </TabContentCard>
  )
}