---
component_id: 1.6.2.2
component_name: Snapshot & Golden Image Pipeline
---

# Snapshot & Golden Image Pipeline

## Component Description

Manages the complete snapshot lifecycle — golden image preparation with router/Kali/Windows checks, snapshot creation/verification, Ansible inventory management, VM connectivity monitoring, and base clean restore.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 450-539)
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

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 188-199)
```
async function createSnapshot(ludusUrl, apiKey, proxmoxID, rangeId, snapshotName) {
  const body = {
    vmids: [proxmoxID],
    name: snapshotName,
    description: `Base clean state for ${rangeId}-${snapshotName}`,
    includeRAM: true,
  }
  const result = await apiCall(ludusUrl, apiKey, `/snapshots/create?rangeID=${rangeId}`, "POST", body)
  if (result?.errors?.length) {
    throw new Error(`Snapshot failed: ${result.errors[0].error}`)
  }
}
```

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 87-92)
```
async function fetchAnsibleInventory(ludusUrl, apiKey) {
  const rangeId = process.env.LUDUS_RANGE_ID || "ty"
  const data = await apiCall(ludusUrl, apiKey, `/range/ansibleinventory?rangeID=${rangeId}`)
  if (!data?.result) throw new Error("No inventory data in response")
  return data.result
}
```

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 546-614)
```
export async function restoreToBaseClean(ludusUrl, apiKey, data) {
  const { label } = data
  const timings = {}
  const tStart = performance.now()

  const t0 = performance.now()
  const range = await apiCall(ludusUrl, apiKey, "/range")
  timings.fetchRange_ms = performance.now() - t0

  const vm = findVM(range.VMs ?? [], label)
  const rangeId = process.env.LUDUS_RANGE_ID || "ty"
  const isWindows = vm.name?.includes("win") || vm.name?.includes("WIN")

  const tRollback = performance.now()
  const rbResult = await apiCall(ludusUrl, apiKey, `/snapshots/rollback?rangeID=${rangeId}`, "POST", {
    vmids: [vm.proxmoxID],
    name: "base-clean",
  })
  if (rbResult?.errors?.length) throw new Error(`Rollback failed: ${rbResult.errors[0].error}`)
  timings.rollback_ms = performance.now() - tRollback

  const tIp = performance.now()
  let ip = null
  for (let i = 0; i < 24; i++) {
    const cur = await apiCall(ludusUrl, apiKey, "/range")
    const curVm = cur.VMs?.find(v => v.name === vm.name)
    if (curVm?.ip && curVm.ip !== "null") {
      ip = curVm.ip
      break
    }
    await sleep(5000)
  }
  if (!ip) throw new Error(`Timeout waiting for IP on ${vm.name}`)
  timings.ipWait_ms = performance.now() - tIp

  const tTcp = performance.now()
  const ports = isWindows ? [5985, 5986] : [22]
  let readyPort = null
  for (let i = 0; i < 60; i++) {
    for (const port of ports) {
      try {
        await $`bash -c "timeout 1 bash -c '</dev/tcp/${ip}/${port}' 2>/dev/null"`.quiet()
        readyPort = port
        break
      } catch {}
    }
    if (readyPort) break
    await sleep(2000)
  }
  if (!readyPort) throw new Error(`Timeout: ports ${ports.join(",")} not reachable on ${ip} (${vm.name})`)
  timings.tcpPortWait_ms = performance.now() - tTcp

  const tInventory = performance.now()
  const inventoryText = getCachedInventory() || await fetchAnsibleInventory(ludusUrl, apiKey)
  timings.fetchInventory_ms = performance.now() - tInventory

  const tPing = performance.now()
  const escaped = inventoryText.replace(/'/g, "'\\''")
  const ansibleCmd = isWindows
    ? `uv run ansible ${vm.name} -i <(echo '${escaped}') -m win_ping -e 'ansible_winrm_read_timeout_sec=10 ansible_winrm_operation_timeout_sec=5'`
    : `uv run ansible ${vm.name} -i <(echo '${escaped}') -m ping`
  await $`bash -c "${ansibleCmd}"`.quiet()
  timings.ansiblePing_ms = performance.now() - tPing

  timings.connectivityWait_ms = timings.tcpPortWait_ms + timings.fetchInventory_ms + timings.ansiblePing_ms
  timings.totalDowntime_ms = performance.now() - tStart

  return { vm: vm.name, ip, timings }
}
```


## Source Files:

- `server/range.js`

