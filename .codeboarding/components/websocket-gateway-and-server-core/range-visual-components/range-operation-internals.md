---
component_id: 1.6.7
component_name: Range Operation Internals
---

# Range Operation Internals

## Component Description

Internal class/tracking structures from range.js — snapshot pipeline state trackers, Ansible log parsers, VM deletion tracking, and play recap parsing.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 513-513)
```
        const check = snapshotChecks.find(s => s.label === label)
```

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 260-260)
```
        const playLines = nonEmpty.filter(l => l.startsWith("PLAY ["))
```

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 311-311)
```
  const onVMs = toDelete.filter((vm) => vm.poweredOn).map((vm) => vm.name)
```

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 746-746)
```
  const playRecap = recapIdx !== -1 ? lines.slice(recapIdx).filter(l => l.trim()) : []
```


