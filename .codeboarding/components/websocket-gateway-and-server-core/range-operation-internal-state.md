---
component_id: 1.12
component_name: Range Operation Internal State
---

# Range Operation Internal State

## Component Description

Internal class/tracking structures used by the monolithic range.js — VM conflict detectors, snapshot pipeline trackers (check, kali, router, windows), and Ansible log parsers (playLines, recapIdx, statusLine).

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 513-513)
```
        const check = snapshotChecks.find(s => s.label === label)
```

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 460-460)
```
  const kali = vms.find(v => v.name?.includes("attacker-kali"))
```

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 260-260)
```
        const playLines = nonEmpty.filter(l => l.startsWith("PLAY ["))
```

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 255-255)
```
        const recapIdx = cleanLines.findIndex(l => l.includes("PLAY RECAP"))
```

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 311-311)
```
  const onVMs = toDelete.filter((vm) => vm.poweredOn).map((vm) => vm.name)
```


