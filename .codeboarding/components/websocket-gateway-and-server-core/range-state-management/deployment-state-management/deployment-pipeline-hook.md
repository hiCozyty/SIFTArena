---
component_id: 1.7.1.1
component_name: Deployment Pipeline Hook
---

# Deployment Pipeline Hook

## Component Description

Central useDeploymentPipeline hook — subscribes to backend WebSocket for Ansible play recap data, parses per-VM deployment status using parsePlayRecap, computes timelineItems with setTimelineItemsLocal, and exposes isVmPresent helper.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 260-260)
```
        const playLines = nonEmpty.filter(l => l.startsWith("PLAY ["))
```

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 255-255)
```
        const recapIdx = cleanLines.findIndex(l => l.includes("PLAY RECAP"))
```

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 249-251)
```
        const statusLine = [...nonEmpty].reverse().find(l =>
          l.startsWith("PLAY [") || l.startsWith("TASK [") || l.includes("PLAY RECAP")
        )
```

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 746-746)
```
  const playRecap = recapIdx !== -1 ? lines.slice(recapIdx).filter(l => l.trim()) : []
```


## Source Files:

- `server/range.js`

