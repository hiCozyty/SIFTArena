---
component_id: 7.7.2.5.1
component_name: Readiness State Engine
---

# Readiness State Engine

## Component Description

The reactive data pipeline that receives WebSocket push data, filters relevant items, computes structured timeline entries, and evaluates allOk — the golden image readiness check. Diffs previous vs new state and debounces final updates.

---

## Source Files:

- `web/src/components/lab-range/use-lab-range-state.ts`

