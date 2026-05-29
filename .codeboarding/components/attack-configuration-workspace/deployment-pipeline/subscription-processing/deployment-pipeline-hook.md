---
component_id: 6.8.2.1
component_name: Deployment Pipeline Hook
---

# Deployment Pipeline Hook

## Component Description

Central useDeploymentPipeline hook — subscribes to backend WebSocket for Ansible play recap data, parses per-VM status using parsePlayRecap, computes timelineItems via setTimelineItemsLocal, manages debounced timeouts for state stability, and exposes isVmPresent helper.

---

## Source Files:

- `web/src/components/attack-configuration/technique-tree.tsx`

