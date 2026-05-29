---
component_id: 1.7.1.1.1
component_name: Golden Image Preparation
---

# Golden Image Preparation

## Component Description

Manages golden image pipeline: VM readiness checks, snapshot creation/verification, inventory fetching, connectivity monitoring, base-clean restore.

---

## Key References:

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

