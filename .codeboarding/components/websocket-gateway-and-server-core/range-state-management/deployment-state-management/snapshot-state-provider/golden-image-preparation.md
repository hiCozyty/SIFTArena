---
component_id: 1.7.1.2.1
component_name: Golden Image Preparation
---

# Golden Image Preparation

## Component Description

Manages golden image pipeline: VM readiness checks, snapshot creation/verification, inventory fetching, connectivity monitoring, base-clean restore.

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


## Source Files:

- `server/range.js`

