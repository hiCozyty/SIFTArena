# Plan: Restrure Range Tree to Show Deployed/Non-Deployed VMs

## Goal
Replace placeholder tree data in `RangeTreeContent` with dynamic VM data from backend, organized into two folders:
1. **Deployed VMs** - shows all VMs from `vmDefs` (3 default + dynamic)
2. **Non Deployed VMs** - empty folder

## Changes

### 1. `web/src/components/lab-range/range-tree-content.tsx`
- Replace `PLACEHOLDER_RANGE` with `buildTreeFromVmDefs(vmDefs)` function
- Add `vmDefs` prop: `{ vmDefs?: Record<string, Record<string, unknown>> | null }`
- Remove placeholder nodes ("Core Switch", "Network Infrastructure", etc.)
- Use `FolderOpen` icon for folders, keep VM-specific icons (Globe for router, Shield for kali, Monitor for others)
- Show VM labels from `vm_name` or `hostname` field

### 2. `web/src/components/lab-range/yaml-topology-gui.tsx`
- Pass `vmDefs={enrichedVmDefs}` to `<RangeTreeContent />`
- Line 53: `<RangeTreeContent vmDefs={enrichedVmDefs} />`

## Implementation Details

### range-tree-content.tsx (new structure)
```tsx
function buildTreeFromVmDefs(vmDefs: Record<string, Record<string, unknown>> | null): RangeNode[] {
  if (!vmDefs) return []
  const deployedChildren: RangeNode[] = []
  for (const [key, def] of Object.entries(vmDefs)) {
    const label = (def.vm_name as string) || (def.hostname as string) || key
    deployedChildren.push({
      id: key,
      label,
      icon: getVmIcon(key),
    })
  }
  return [
    {
      id: "deployed",
      label: "Deployed VMs",
      icon: <FolderOpen className="h-4 w-4" />,
      children: deployedChildren,
    },
    {
      id: "non-deployed",
      label: "Non Deployed VMs",
      icon: <FolderOpen className="h-4 w-4" />,
      children: [],
    },
  ]
}
```

### yaml-topology-gui.tsx (line 53)
```tsx
content: <RangeTreeContent vmDefs={enrichedVmDefs} />,
```

## Notes
- `enrichedVmDefs` already combines static + dynamic VMs from `use-lab-range-state.ts`
- When `vmDefs` is null/empty, tree will show empty folders
- No changes needed to `use-lab-range-state.ts` - data flow already exists
