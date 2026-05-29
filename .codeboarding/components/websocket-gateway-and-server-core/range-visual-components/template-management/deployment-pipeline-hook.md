---
component_id: 1.6.5.1
component_name: Deployment Pipeline Hook
---

# Deployment Pipeline Hook

## Component Description

Central useDeploymentPipeline hook — subscribes to backend WebSocket for Ansible play recap data, parses per-VM deployment status using parsePlayRecap, computes timelineItems with setTimelineItemsLocal, and exposes isVmPresent helper.

---

## Source Files:

- `server/templates.js`

