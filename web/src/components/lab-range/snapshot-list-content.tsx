import type { SnapshotInfo } from "@/components/lab-range/use-lab-range-state"
import { SnapshotTreeContent } from "./snapshot-tree-content"

export function SnapshotListContent({ snapshotData, selectedIds, onSelectionChange }: { snapshotData: Record<string, SnapshotInfo>; selectedIds?: string[]; onSelectionChange?: (selectedIds: string[]) => void }) {
  return <SnapshotTreeContent snapshotData={snapshotData} selectedIds={selectedIds} onSelectionChange={onSelectionChange} />
}
