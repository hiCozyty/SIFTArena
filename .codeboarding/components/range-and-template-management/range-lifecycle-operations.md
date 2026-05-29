---
component_id: 2.1
component_name: Range Lifecycle Operations
---

# Range Lifecycle Operations

## Component Description

Core VM orchestration — deploys, deletes, snapshots, and runs Ansible scripts on range VMs. All 32 functions live in server/ludus/range.js.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/server/ludus/range.js (lines 348-375)
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

### /home/cozyty/Projects/shadowProtocol/server/ludus/range.js (lines 271-312)
```
export async function deleteRangeVMs(ludusUrl, apiKey, data) {
  if (data?.force) {
    const range = await apiCall(ludusUrl, apiKey, "/range")
    await apiCall(ludusUrl, apiKey, `/range/${range.rangeID}/vms`, "DELETE")
    const host = new URL(ludusUrl).hostname
    await destroyZombieVMs(host)
    return { result: "Range VMs destroy in progress" }
  }

  const range = await apiCall(ludusUrl, apiKey, "/range")
  const vms = range.VMs ?? []

  const toDelete = data?.all ? vms : vms.filter((vm) => !vm.isRouter && !vm.name?.includes("attacker-kali"))

  if (toDelete.length === 0) {
    return { deleted: 0, message: "range already clean", names: [] }
  }

  const onVMs = toDelete.filter((vm) => vm.poweredOn).map((vm) => vm.name)
  if (onVMs.length > 0) {
    await apiCall(ludusUrl, apiKey, "/range/poweroff", "PUT", { machines: onVMs })
    const pending = new Set(onVMs)
    for (let i = 0; i < 30 && pending.size > 0; i++) {
      await sleep(2000)
      const cur = await apiCall(ludusUrl, apiKey, "/range")
      for (const vm of cur.VMs ?? []) {
        if (!vm.poweredOn) pending.delete(vm.name)
      }
    }
  }

  const deleted = []
  for (const vm of toDelete) {
    await apiCall(ludusUrl, apiKey, `/vm/${vm.proxmoxID}`, "DELETE")
    deleted.push(vm.name)
  }

  const host = new URL(ludusUrl).hostname
  await destroyZombieVMs(host)

  return { deleted: deleted.length, names: deleted }
}
```

### /home/cozyty/Projects/shadowProtocol/server/ludus/range.js (lines 428-517)
```
export async function prepareGoldenImage(ludusUrl, apiKey, data) {
  const rangeId = process.env.LUDUS_RANGE_ID || "ty"
  const snapshotName = "base-clean"
  const log = (msg) => console.log(`[prepareGoldenImage ${Date.now()}] ${msg}`)

  log("start")
  const range = await apiCall(ludusUrl, apiKey, "/range")
  log(`/range done`)
  const vms = range.VMs ?? []

  const kali = vms.find(v => v.name?.includes("attacker-kali"))
  const windows = vms.find(v => !v.isRouter && !v.name?.includes("attacker-kali"))
  const router = vms.find(v => v.isRouter)

  const targets = [router, kali, windows].filter(Boolean)
  const offTargets = targets.filter(v => !v.poweredOn)

  if (offTargets.length > 0) {
    const names = offTargets.map(v => v.name)
    log(`VMs powered off: ${names.join(", ")}. Powering on...`)
    await apiCall(ludusUrl, apiKey, "/range/poweron", "PUT", { machines: names })
    const pending = new Set(names)
    for (let i = 0; i < 30 && pending.size > 0; i++) {
      await sleep(2000)
      const cur = await apiCall(ludusUrl, apiKey, "/range")
      for (const vm of cur.VMs ?? []) {
        if (vm.poweredOn) pending.delete(vm.name)
      }
    }
    log("All VMs powered on")
  }

  const prepared = []

  const entries = [
    { label: "kali", vm: kali, isWindows: false },
    { label: "windows", vm: windows, isWindows: true },
  ]

  const t0_batch = Date.now()
  const snapshotChecks = data?.overwrite ? [] : await Promise.all(
    entries.map(async ({ label, vm }) => {
      if (!vm) return { label, exists: null }
      const t0 = Date.now()
      const exists = await snapshotExists(ludusUrl, apiKey, vm.proxmoxID, rangeId, snapshotName)
      log(`snapshotCheck ${label} ${exists} took ${Date.now() - t0}ms`)
      return { label, exists }
    })
  )
  log(`snapshotChecks batch took ${Date.now() - t0_batch}ms total`)

  for (const { label, vm, isWindows } of entries) {
    if (!vm) {
      prepared.push({ label, error: "VM not found in range" })
      continue
    }

    try {
      log(`waitForVMIP start: ${label}`)
      const ip = vm.ip && vm.ip !== "null" ? vm.ip : await waitForVMIP(ludusUrl, apiKey, vm.name)
      log(`waitForVMIP done: ${label} ip=${ip}`)

      if (!data?.overwrite) {
        const check = snapshotChecks.find(s => s.label === label)
        const alreadyExists = check?.exists
        if (alreadyExists) {
          prepared.push({ label, vm: vm.name, ip, snapshot: snapshotName, created: false })
          continue
        }
      }

      await waitForConnectivity(ludusUrl, apiKey, vm.name, ip, isWindows)

      if (data?.overwrite) {
        await removeSnapshot(ludusUrl, apiKey, vm.proxmoxID, rangeId, snapshotName)
      }

      const created = await ensureSnapshot(ludusUrl, apiKey, vm.proxmoxID, rangeId, snapshotName)

      const entry = { label, vm: vm.name, ip, snapshot: snapshotName, created }
      if (data?.overwrite) entry.overwritten = true
      prepared.push(entry)
    } catch (err) {
      prepared.push({ label, vm: vm.name, error: err.message })
    }
  }

  log(`done ${JSON.stringify(prepared.map(p => ({ label: p.label, ip: p.ip, created: p.created })))}`)
  return { prepared }
}
```

### /home/cozyty/Projects/shadowProtocol/server/ludus/range.js (lines 207-269)
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


