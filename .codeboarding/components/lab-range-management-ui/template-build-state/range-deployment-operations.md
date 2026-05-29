---
component_id: 7.9.2
component_name: Range Deployment Operations
---

# Range Deployment Operations

## Component Description

Core VM lifecycle — deploys VMs, manages range configuration, fetches range status, and handles VM deletion. Cluster 1 and 5 form the complete create/delete lifecycle, both calling apiCall and sleep.

---

## Source Files:

- `web/src/components/lab-range/use-template-builder.ts`

