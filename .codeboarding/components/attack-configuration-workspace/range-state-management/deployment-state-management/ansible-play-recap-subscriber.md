---
component_id: 6.7.4.1
component_name: Ansible Play Recap Subscriber
---

# Ansible Play Recap Subscriber

## Component Description

Subscribes to backendWs for real-time fetchRangeWithLog push data. Receives raw Ansible play recap lines pushed by the 1-second polling engine and parses per-VM status using parsePlayRecap.

---

## Source Files:

- `web/src/components/ui/chat.tsx`
- `web/src/hooks/use-opencode-chat.ts`

