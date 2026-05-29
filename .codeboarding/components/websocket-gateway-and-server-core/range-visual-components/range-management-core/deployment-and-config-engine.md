---
component_id: 1.6.2.1
component_name: Deployment & Config Engine
---

# Deployment & Config Engine

## Component Description

Core VM lifecycle — deploys VMs, manages range configuration, generates YAML config files, and fetches deployment status with log parsing. Includes conflict detection and IP octet calculation.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 370-397)
```
export async function deployVM(ludusUrl, apiKey, data) {
  const vmName = data.vm
  if (!VM_DEFS[vmName]) throw new Error(`Unknown VM: "${vmName}"`)

  const ipLastOctet = data.ipLastOctet
  if (ipLastOctet !== undefined) {
    if (!Number.isInteger(ipLastOctet) || ipLastOctet < 1 || ipLastOctet > 254) {
      return { deployed: null }
    }
    try {
      const range = await apiCall(ludusUrl, apiKey, "/range")
      const vms = range.VMs ?? []
      const vlan = VM_DEFS[vmName].vlan
      const conflict = vms.some((vm) => {
        const n = vm.ip_last_octet ?? lastOctet(vm.ip) ?? lastOctet(vm.ip_address)
        return !vm.isRouter && vm.vlan === vlan && n === ipLastOctet
      })
      if (conflict) return { deployed: null }
    } catch {}
  }

  const userKey = (process.env.LUDUS_USER_API_KEY || apiKey).trim()
  const yaml = generateYaml(vmName, ipLastOctet)
  await setRangeConfig(ludusUrl, userKey, yaml)
  await apiCall(ludusUrl, apiKey, "/range/deploy", "POST", { force: true })
  // await apiCall(ludusUrl, apiKey, "/range/deploy", "POST")
  return { deployed: vmName }
}
```

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 229-291)
```
export async function fetchRangeWithLog(ludusUrl, apiKey) {
  const range = await apiCall(ludusUrl, apiKey, "/range")
  const vms = range.VMs ?? []
  let latestLog = ""
  let playRecap = null
  let logEmpty = true
  let logStale = false
  let logDebug = {}
  let currentVM = null
  try {
    const history = await apiCall(ludusUrl, apiKey, "/range/logs/history")
    const entry = history.find((e) => e.status === "running") ?? history[0]
    if (entry) {
      const detail = await apiCall(ludusUrl, apiKey, `/range/logs/history/${entry.id}`)
      const raw = detail.result ?? ""
      const clean = raw.replace(/\u001b\[[0-9;]*m/g, "").replace(/\s+$/, "")
      logEmpty = !clean
      if (clean) {
        const cleanLines = clean.split("\n")
        const nonEmpty = cleanLines.filter(l => l.trim())
        const statusLine = [...nonEmpty].reverse().find(l =>
          l.startsWith("PLAY [") || l.startsWith("TASK [") || l.includes("PLAY RECAP")
        )
        latestLog = (statusLine || nonEmpty[nonEmpty.length - 1] || "").replace(/\s*\*+$/, "").trim()
        console.log("latestLog:", latestLog)

        const recapIdx = cleanLines.findIndex(l => l.includes("PLAY RECAP"))
        if (recapIdx !== -1) {
          playRecap = cleanLines.slice(recapIdx).filter(l => l.trim())
        }

        const playLines = nonEmpty.filter(l => l.startsWith("PLAY ["))
        console.log("[range] PLAY lines found:", playLines)
        for (const line of playLines) {
          const m = line.match(/^PLAY \[(.+?)\]/)
          if (!m) continue
          const host = m[1].toLowerCase()
          console.log("[range] PLAY host:", host)
          if (host.includes("router")) currentVM = "router"
          else if (host.includes("kali")) currentVM = "kali"
          else if (host.includes("win11") || host.includes("windows")) currentVM = "windows"
        }
        if (playRecap) currentVM = "recap"
        console.log("[range] currentVM:", currentVM, "playRecap:", playRecap ? playRecap.length + " lines" : null)
      }

      logDebug = { entryId: entry.id, entryStatus: entry.status, rawLength: raw.length }

      const entryId = entry.id
      if (prevLogMeta.entryId === entryId && prevLogMeta.log === latestLog && latestLog) {
        if (!prevLogMeta.staleStart) prevLogMeta.staleStart = Date.now()
        if (Date.now() - prevLogMeta.staleStart > 5000) {
          logStale = true
        }
      } else {
        prevLogMeta = { entryId, log: latestLog, staleStart: 0 }
      }
    }
  } catch (err) {
    console.error("fetchRangeWithLog — error:", err.message)
  }
  return [vms, { latestLog, playRecap, logEmpty, logStale, logDebug, currentVM }]
}
```

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 9-30)
```
function generateYaml(vmName, ipLastOctet) {
  const d = VM_DEFS[vmName]
  const octet = ipLastOctet ?? d.ip_last_octet
  let yaml = `ludus:
  - vm_name: "{{ range_id }}-${vmName}"
    hostname: ${d.hostname}
    template: ${d.template}
    vlan: ${d.vlan}
    ip_last_octet: ${octet}
    ram_gb: ${d.ram_gb}
    cpus: ${d.cpus}
`
  if (d.linux) {
    yaml += `    linux: true
`
  } else if (d.windows) {
    yaml += `    windows:
      sysprep: false
`
  }
  return yaml
}
```


## Source Files:

- `server/range.js`

