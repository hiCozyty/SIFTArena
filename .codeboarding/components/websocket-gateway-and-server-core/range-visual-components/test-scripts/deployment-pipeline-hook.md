---
component_id: 1.6.6.1
component_name: Deployment Pipeline Hook
---

# Deployment Pipeline Hook

## Component Description

Central useDeploymentPipeline hook — subscribes to backend WebSocket for Ansible play recap data, parses per-VM status using parsePlayRecap, computes timelineItems via setTimelineItemsLocal, and exposes isVmPresent helper.

---

## Source Files:

- `server/ansibleScriptTest.js`
- `server/snapshotTest.js`

