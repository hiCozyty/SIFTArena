import type { SnapshotInfo } from "@/components/lab-range/use-lab-range-state"
import { SnapshotTreeContent } from "./snapshot-tree-content"

export function SnapshotListContent({ snapshotData }: { snapshotData: Record<string, SnapshotInfo> }) {
  return <SnapshotTreeContent snapshotData={snapshotData} />
}
