---
component_id: 1.6.2.3
component_name: VM Deletion & Teardown
---

# VM Deletion & Teardown

## Component Description

VM teardown operations — deletes individual VMs, deletes entire ranges, and destroys zombie/orphaned VMs. Uses sleep for polling between deletion attempts.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 293-334)
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

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 336-362)
```
export async function deleteVM(ludusUrl, apiKey, data) {
  const range = await apiCall(ludusUrl, apiKey, "/range")
  const vms = range.VMs ?? []

  let target
  if (data.isRouter) {
    target = vms.find((vm) => vm.isRouter)
  } else if (data.vm) {
    target = vms.find((vm) => vm.name === data.vm || vm.name?.includes(data.vm))
  }
  if (!target) throw new Error(`VM not found (isRouter:${!!data.isRouter}, vm:${data.vm})`)

  if (target.poweredOn) {
    await apiCall(ludusUrl, apiKey, "/range/poweroff", "PUT", { machines: [target.name] })
    for (let i = 0; i < 30; i++) {
      await sleep(2000)
      const cur = await apiCall(ludusUrl, apiKey, "/range")
      const vm = cur.VMs?.find((v) => v.name === target.name)
      if (!vm?.poweredOn) break
    }
  }

  await apiCall(ludusUrl, apiKey, `/vm/${target.proxmoxID}`, "DELETE")
  const host = new URL(ludusUrl).hostname
  await destroyZombieVMs(host)
  return { deleted: target.name }
}
```

### /home/cozyty/Projects/shadowProtocol/server/range.js (lines 65-74)
```
async function destroyZombieVMs(host) {
  try {
    const raw = await $`ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 root@${host} "qm list --output-format=json 2>/dev/null"`.quiet().text()
    const vms = JSON.parse(raw)
    for (const vm of vms) {
      if (vm.name?.endsWith("-template")) continue
      await $`ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 root@${host} "qm stop ${vm.vmid} 2>/dev/null; qm destroy ${vm.vmid} 2>/dev/null"`.quiet()
    }
  } catch {}
}
```


## Source Files:

- `server/range.js`

