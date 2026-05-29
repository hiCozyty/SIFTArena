---
component_id: 1.7.1.2
component_name: Snapshot State Provider
---

# Snapshot State Provider

## Component Description

Provides snapshot pipeline state (router/Kali/Windows checks) consumed by the deployment pipeline to determine golden image readiness before deployment.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 513-513)
```
        const check = snapshotChecks.find(s => s.label === label)
```

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 462-462)
```
  const router = vms.find(v => v.isRouter)
```

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 460-460)
```
  const kali = vms.find(v => v.name?.includes("attacker-kali"))
```


## Source Files:

- `server/range.js`

