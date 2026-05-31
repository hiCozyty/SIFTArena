import { $ } from "bun"

const VM_DEFS = {
  "router":       { template: "debian-11-x64-server-template", hostname: "router", vm_name: "{{ range_id }}-router-debian11-x64", ram_gb: 2, cpus: 2 },
  "attacker-kali": { template: "kali-x64-desktop-template", hostname: "attacker-kali", vm_name: "{{ range_id }}-attacker-kali", vlan: 99, ip_last_octet: 1, ram_gb: 4, cpus: 2, linux: true },
  "win11-22h2":   { template: "win11-22h2-x64-enterprise-template", hostname: "WIN11-22H2", vm_name: "{{ range_id }}-win11-22h2", vlan: 99, ip_last_octet: 24, ram_gb: 4, cpus: 2, windows: { sysprep: false } },
}

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

async function setRangeConfig(ludusUrl, userKey, yaml) {
  const formData = new FormData()
  formData.append("file", new Blob([yaml], { type: "application/yaml" }), "range.yml")
  formData.append("force", "false")
  const response = await fetch(`${ludusUrl}/range/config`, {
    method: "PUT",
    headers: { "X-API-KEY": userKey },
    body: formData,
    tls: { rejectUnauthorized: false },
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Config update failed (${response.status}): ${text}`)
  }
}

async function apiCall(ludusUrl, apiKey, path, method = "GET", body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
    tls: { rejectUnauthorized: false },
  }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const response = await fetch(`${ludusUrl}${path}`, opts)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || `Ludus API error: ${response.status}`)
  return data
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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

async function waitForVMIP(ludusUrl, apiKey, vmName, timeoutSecs = 120) {
  console.log(`[waitForVMIP] polling ${vmName} for IP (timeout=${timeoutSecs}s)`)
  for (let i = 0; i < timeoutSecs / 5; i++) {
    const range = await apiCall(ludusUrl, apiKey, "/range")
    const vm = range.VMs?.find(v => v.name === vmName)
    if (vm?.ip && vm.ip !== "null") return vm.ip
    await sleep(5000)
  }
  throw new Error(`Timeout waiting for IP on ${vmName}`)
}

async function fetchAnsibleInventory(ludusUrl, apiKey) {
  const rangeId = process.env.LUDUS_RANGE_ID || "ty"
  const data = await apiCall(ludusUrl, apiKey, `/range/ansibleinventory?rangeID=${rangeId}`)
  if (!data?.result) throw new Error("No inventory data in response")
  return data.result
}

let cachedInventory = null

export function getCachedInventory() {
  return cachedInventory
}

export async function fetchRdpConfigs(ludusUrl, apiKey, data) {
  const rangeId = data?.rangeID || process.env.LUDUS_RANGE_ID
  let path = `/range/rdpconfigs?rangeID=${rangeId}`
  if (data?.userID) path += `&userID=${data.userID}`

  const response = await fetch(`${ludusUrl}${path}`, {
    headers: { "X-API-KEY": apiKey },
    tls: { rejectUnauthorized: false },
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`RDP configs error (${response.status}): ${text}`)
  }

  const buffer = await response.arrayBuffer()
  return {
    filename: `rdp-range-${rangeId}.zip`,
    data: Buffer.from(buffer).toString("base64"),
    size: buffer.byteLength,
  }
}

export async function fetchRangeConfig(ludusUrl, apiKey) {
  return await apiCall(ludusUrl, apiKey, "/range/config")
}

export async function fetchSystemInfo(ludusUrl, apiKey) {
  const host = new URL(ludusUrl).hostname
  try {
    const raw = await $`ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 root@${host} "free -g | grep ^Mem: | tr -s ' ' | cut -d' ' -f2 && nproc"`.text()
    const [totalRam, totalCpu] = raw.trim().split("\n").map(s => Number(s.trim()))
    return { totalCpu, totalRam }
  } catch (e) {
    console.error("systemInfo ssh failed:", e.stderr?.toString() || e.message)
    throw e
  }
}

export async function updateRangeConfig(ludusUrl, apiKey, data) {
  await setRangeConfig(ludusUrl, apiKey, data.yaml)
  return { result: "ok" }
}

export async function preloadInventory(ludusUrl, apiKey) {
  cachedInventory = await fetchAnsibleInventory(ludusUrl, apiKey)
  return cachedInventory
}

async function waitForConnectivity(ludusUrl, apiKey, vmName, ip, isWindows) {
  const ports = isWindows ? [5985, 5986] : [22]
  let readyPort = null

  console.log(`[waitForConnectivity] waiting for ports ${ports} on ${ip} (${vmName})`)
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
  if (!readyPort) throw new Error(`Timeout: ports ${ports.join(",")} not reachable on ${ip} (${vmName})`)

  console.log(`[waitForConnectivity] running ansible ping on ${vmName}...`)
  const inventoryText = cachedInventory || await fetchAnsibleInventory(ludusUrl, apiKey)
  const escaped = inventoryText.replace(/'/g, "'\\''")
  if (isWindows) {
    await $`bash -c "uv run ansible ${vmName} -i <(echo '${escaped}') -m win_ping -e 'ansible_winrm_read_timeout_sec=10 ansible_winrm_operation_timeout_sec=5'"`
  } else {
    await $`bash -c "uv run ansible ${vmName} -i <(echo '${escaped}') -m ping"`
  }
  console.log(`[waitForConnectivity] ansible ping ok`)
}

async function snapshotExists(ludusUrl, apiKey, proxmoxID, rangeId, snapshotName) {
  try {
    const qs = `rangeID=${rangeId}&vmids=${proxmoxID}`
    const data = await apiCall(ludusUrl, apiKey, `/snapshots/list?${qs}`)
    const snapshots = data?.snapshots || data || []
    return snapshots.some(s => s.name === snapshotName || s.snapname === snapshotName)
  } catch {
    return false
  }
}

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

async function ensureSnapshot(ludusUrl, apiKey, proxmoxID, rangeId, snapshotName) {
  const exists = await snapshotExists(ludusUrl, apiKey, proxmoxID, rangeId, snapshotName)
  if (exists) return false
  await createSnapshot(ludusUrl, apiKey, proxmoxID, rangeId, snapshotName)
  return true
}

async function removeSnapshot(ludusUrl, apiKey, proxmoxID, rangeId, snapshotName) {
  const body = { name: snapshotName, vmids: [proxmoxID] }
  try {
    await apiCall(ludusUrl, apiKey, `/snapshots/remove?rangeID=${rangeId}`, "POST", body)
    return true
  } catch {
    return false
  }
}

export async function abortRange(ludusUrl, apiKey, data) {
  let path = "/range/abort"
  const params = []
  if (data?.rangeID) params.push(`rangeID=${data.rangeID}`)
  if (data?.userID) params.push(`userID=${data.userID}`)
  if (params.length > 0) path += "?" + params.join("&")
  return await apiCall(ludusUrl, apiKey, path, "POST")
}

let prevLogMeta = { entryId: null, log: "", staleStart: 0 }

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
    const runningEntry = history.find((e) => e.status === "running")
    const candidates = runningEntry
      ? [runningEntry, ...history.filter((e) => e !== runningEntry)]
      : history

    let entry = null
    let raw = ""
    for (const candidate of candidates) {
      try {
        const detail = await apiCall(ludusUrl, apiKey, `/range/logs/history/${candidate.id}`)
        raw = detail.result ?? ""
        if (raw) {
          entry = candidate
          break
        }
      } catch (err) {
        if (err.message.includes("Log file not found")) {
          continue
        }
        throw err
      }
    }

    if (entry) {
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

function lastOctet(ip) {
  if (typeof ip !== "string") return undefined
  const n = parseInt(ip.split(".").pop(), 10)
  return isNaN(n) ? undefined : n
}

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

export async function deployCustomVM(ludusUrl, apiKey, data) {
  const { hostname, yaml } = data
  if (!hostname) throw new Error("Missing hostname")
  if (!yaml) throw new Error("Missing yaml config")

  const rangeId = process.env.LUDUS_RANGE_ID || "ty"
  const expectedVmName = `${rangeId}-${hostname}`

  const range = await apiCall(ludusUrl, apiKey, "/range")
  const vms = range.VMs ?? []

  const existingVM = vms.find(vm => vm.name === expectedVmName)

  if (existingVM) {
    const qs = `rangeID=${rangeId}&vmids=${existingVM.proxmoxID}`
    const snapshotResult = await apiCall(ludusUrl, apiKey, `/snapshots/list?${qs}`)
    const snapshots = snapshotResult?.snapshots || []
    const hasBaseClean = snapshots.some(s => s.name === "base-clean")

    if (hasBaseClean) {
      return { deployed: null, alreadyDeployed: true, vmName: expectedVmName }
    }

    if (existingVM.poweredOn) {
      await apiCall(ludusUrl, apiKey, "/range/poweroff", "PUT", { machines: [existingVM.name] })
      for (let i = 0; i < 30; i++) {
        await sleep(2000)
        const cur = await apiCall(ludusUrl, apiKey, "/range")
        const vm = cur.VMs?.find(v => v.name === existingVM.name)
        if (!vm?.poweredOn) break
      }
    }

    await apiCall(ludusUrl, apiKey, `/vm/${existingVM.proxmoxID}`, "DELETE")
    await destroyZombieVMs(new URL(ludusUrl).hostname)
  }

  const userKey = (process.env.LUDUS_USER_API_KEY || apiKey).trim()
  await setRangeConfig(ludusUrl, userKey, yaml)
  await apiCall(ludusUrl, apiKey, "/range/deploy", "POST", { force: true })

  return { deployed: hostname, vmName: expectedVmName, deletedExisting: !!existingVM }
}

export async function deployRouter(ludusUrl, apiKey) {
  const d = VM_DEFS.router
  const yaml = `ludus: []
router:
  vm_name: "${d.vm_name}"
  hostname: "${d.hostname}"
  template: ${d.template}
  ram_gb: ${d.ram_gb}
  cpus: ${d.cpus}
`
  const userKey = (process.env.LUDUS_USER_API_KEY || apiKey).trim()
  await setRangeConfig(ludusUrl, userKey, yaml)
  await apiCall(ludusUrl, apiKey, "/range/deploy", "POST", { force: true })
  return { deployed: "router" }
}

export async function deployAllBaseVMs(ludusUrl, apiKey, data) {
  const userKey = (process.env.LUDUS_USER_API_KEY || apiKey).trim()
  
  if (!data?.skipConfigGeneration) {
    const vmNames = data?.vms ?? ["attacker-kali", "win11-22h2"]
    const r = VM_DEFS.router
    let yaml = `router:
  vm_name: "${r.vm_name}"
  hostname: "${r.hostname}"
  template: ${r.template}
  ram_gb: ${r.ram_gb}
  cpus: ${r.cpus}
ludus:
`
    for (const name of vmNames) {
      const d = VM_DEFS[name]
      if (!d) throw new Error(`Unknown VM: "${name}"`)
      yaml += `  - vm_name: "{{ range_id }}-${name}"
    hostname: ${d.hostname}
    template: ${d.template}
    vlan: ${d.vlan}
    ip_last_octet: ${d.ip_last_octet}
    ram_gb: ${d.ram_gb}
    cpus: ${d.cpus}
`
      if (d.linux) {
        yaml += `    linux: true\n`
      } else if (d.windows) {
        yaml += `    windows:\n      sysprep: false\n`
      }
    }
    await setRangeConfig(ludusUrl, userKey, yaml)
  }
  
  await apiCall(ludusUrl, apiKey, "/range/deploy", "POST", { force: true })
  setTimeout(() => preloadInventory(ludusUrl, apiKey).catch(() => {}), 5000)
  return { result: "ok" }
}

export async function prepareGoldenImage(ludusUrl, apiKey, data) {
  const rangeId = process.env.LUDUS_RANGE_ID || "ty"
  const snapshotName = "base-clean"

  const range = await apiCall(ludusUrl, apiKey, "/range")
  const vms = range.VMs ?? []

  const router = vms.find(v => v.isRouter)

  let entries = []
  if (data?.vmNames && Array.isArray(data.vmNames)) {
    const targetVMs = vms.filter(v => data.vmNames.includes(v.name))
    entries = targetVMs.map(vm => ({
      label: vm.name?.replace(new RegExp(`^${rangeId}-`), "") || vm.name,
      vm,
      isWindows: vm.name?.toLowerCase().includes("win") || false,
    }))
  } else {
    const nonRouterVMs = vms.filter(v => !v.isRouter)
    entries = nonRouterVMs.map(vm => ({
      label: vm.name?.replace(new RegExp(`^${rangeId}-`), "") || vm.name,
      vm,
      isWindows: vm.name?.toLowerCase().includes("win") || false,
    }))
  }

  const targets = entries.map(e => e.vm).concat(router).filter(Boolean)
  const offTargets = targets.filter(v => !v.poweredOn)

  if (offTargets.length > 0) {
    const names = offTargets.map(v => v.name)
    await apiCall(ludusUrl, apiKey, "/range/poweron", "PUT", { machines: names })
    const pending = new Set(names)
    for (let i = 0; i < 30 && pending.size > 0; i++) {
      await sleep(2000)
      const cur = await apiCall(ludusUrl, apiKey, "/range")
      for (const vm of cur.VMs ?? []) {
        if (vm.poweredOn) pending.delete(vm.name)
      }
    }
  }

  const prepared = []

  const t0_batch = Date.now()
  const snapshotChecks = data?.overwrite ? [] : await Promise.all(
    entries.map(async ({ label, vm }) => {
      if (!vm) return { label, exists: null }
      const exists = await snapshotExists(ludusUrl, apiKey, vm.proxmoxID, rangeId, snapshotName)
      return { label, exists }
    })
  )

  for (const { label, vm, isWindows } of entries) {
    if (!vm) {
      prepared.push({ label, error: "VM not found in range" })
      continue
    }

    try {
      const ip = vm.ip && vm.ip !== "null" ? vm.ip : await waitForVMIP(ludusUrl, apiKey, vm.name)

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

  return { prepared }
}
function findVM(vms, label) {
  const vm = vms.find(v => v.name === label || v.name?.includes(label))
  if (!vm) throw new Error(`VM matching "${label}" not found`)
  return vm
}

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

export async function listSnapshots(ludusUrl, apiKey, data) {
  const { label } = data
  const range = await apiCall(ludusUrl, apiKey, "/range")
  const vm = findVM(range.VMs ?? [], label)
  const rangeId = process.env.LUDUS_RANGE_ID || "ty"
  const qs = `rangeID=${rangeId}&vmids=${vm.proxmoxID}`
  const result = await apiCall(ludusUrl, apiKey, `/snapshots/list?${qs}`)
  return { vm: vm.name, snapshots: result?.snapshots || [] }
}

export async function saveBaseClean(ludusUrl, apiKey, data) {
  const { label } = data
  const timings = {}
  const tStart = performance.now()
  console.log(`[saveBaseClean] start label="${label}"`)

  const t0 = performance.now()
  const range = await apiCall(ludusUrl, apiKey, "/range")
  timings.fetchRange_ms = performance.now() - t0
  console.log(`[saveBaseClean] range fetched in ${Math.round(timings.fetchRange_ms)}ms`)

  const vm = findVM(range.VMs ?? [], label)
  const rangeId = process.env.LUDUS_RANGE_ID || "ty"
  const isWindows = vm.name?.includes("win") || vm.name?.includes("WIN")
  console.log(`[saveBaseClean] found vm="${vm.name}" ip="${vm.ip}" isWindows=${isWindows}`)

  const tIp = performance.now()
  const ip = vm.ip && vm.ip !== "null" ? vm.ip : await waitForVMIP(ludusUrl, apiKey, vm.name)
  timings.ipWait_ms = performance.now() - tIp
  console.log(`[saveBaseClean] ip="${ip}" (waited ${Math.round(timings.ipWait_ms)}ms)`)

  const tConn = performance.now()
  console.log(`[saveBaseClean] waiting for connectivity on ${ip}...`)
  await waitForConnectivity(ludusUrl, apiKey, vm.name, ip, isWindows)
  timings.connectivityWait_ms = performance.now() - tConn
  console.log(`[saveBaseClean] connectivity ok (${Math.round(timings.connectivityWait_ms)}ms)`)

  const tRemove = performance.now()
  const exists = await snapshotExists(ludusUrl, apiKey, vm.proxmoxID, rangeId, "base-clean")
  console.log(`[saveBaseClean] base-clean snapshot exists=${exists}`)
  if (exists) {
    const removed = await removeSnapshot(ludusUrl, apiKey, vm.proxmoxID, rangeId, "base-clean")
    if (!removed) throw new Error(`Failed to remove existing base-clean snapshot on ${vm.name}`)
    console.log(`[saveBaseClean] removed old base-clean snapshot`)
  }
  timings.removeOld_ms = performance.now() - tRemove

  const tCreate = performance.now()
  console.log(`[saveBaseClean] creating snapshot...`)
  await createSnapshot(ludusUrl, apiKey, vm.proxmoxID, rangeId, "base-clean")
  timings.createSnapshot_ms = performance.now() - tCreate
  console.log(`[saveBaseClean] snapshot created`)

  timings.total_ms = performance.now() - tStart
  console.log(`[saveBaseClean] done in ${Math.round(timings.total_ms)}ms`)

  return { vm: vm.name, snapshot: "base-clean", ip, created: true, timings }
}

export async function runAnsibleScript(ludusUrl, apiKey, data, ws) {
  const { label, playbook } = data
  if (!label || !playbook) throw new Error("label and playbook are required")

  const timings = {}
  const tStart = performance.now()

  const t0 = performance.now()
  const range = await apiCall(ludusUrl, apiKey, "/range")
  timings.fetchRange_ms = performance.now() - t0

  const vm = findVM(range.VMs ?? [], label)
  const rangeId = process.env.LUDUS_RANGE_ID || "ty"
  const isWindows = vm.name?.includes("win") || vm.name?.includes("WIN")

  if (!vm.poweredOn) {
    const tPower = performance.now()
    ws?.send(JSON.stringify({ type: "ansibleLog", state: "powerOn" }))
    await apiCall(ludusUrl, apiKey, "/range/poweron", "PUT", { machines: [vm.name] })
    for (let i = 0; i < 30; i++) {
      await sleep(2000)
      const cur = await apiCall(ludusUrl, apiKey, "/range")
      if (cur.VMs?.find(v => v.name === vm.name)?.poweredOn) break
    }
    timings.powerOn_ms = performance.now() - tPower
  }

  const tIp = performance.now()
  ws?.send(JSON.stringify({ type: "ansibleLog", state: "waitingForIP" }))
  const ip = vm.ip && vm.ip !== "null" ? vm.ip : await waitForVMIP(ludusUrl, apiKey, vm.name)
  timings.ipWait_ms = performance.now() - tIp

  const tConn = performance.now()
  ws?.send(JSON.stringify({ type: "ansibleLog", state: "waitingForConnectivity" }))
  await waitForConnectivity(ludusUrl, apiKey, vm.name, ip, isWindows)
  timings.connectivityWait_ms = performance.now() - tConn

  const tInventory = performance.now()
  ws?.send(JSON.stringify({ type: "ansibleLog", state: "fetchingInventory" }))
  const inventoryText = await fetchAnsibleInventory(ludusUrl, apiKey)
  const inventoryPath = `/tmp/ludus-inventory-${rangeId}`
  await Bun.write(inventoryPath, inventoryText)
  timings.fetchInventory_ms = performance.now() - tInventory

  const tPlaybook = performance.now()
  ws?.send(JSON.stringify({ type: "ansibleLog", state: "playbookStarted" }))

  const proc = Bun.spawn(["uv", "run", "ansible-playbook", "-i", inventoryPath, "--limit", vm.name, playbook], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const reader = proc.stdout.getReader()
  const decoder = new TextDecoder()
  let fullOutput = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    fullOutput += chunk
    const lines = chunk.split("\n")
    for (const line of lines) {
      if (line) ws?.send(JSON.stringify({ type: "ansibleLog", line }))
    }
  }
  await proc.exited

  const stderrText = (await new Response(proc.stderr).text()).trim()
  if (stderrText) console.error(`[ansible stderr] ${stderrText}`)

  const lines = fullOutput.split("\n")
  const recapIdx = lines.findIndex(l => l.includes("PLAY RECAP"))
  const playRecap = recapIdx !== -1 ? lines.slice(recapIdx).filter(l => l.trim()) : []
  timings.playbook_ms = performance.now() - tPlaybook
  timings.total_ms = performance.now() - tStart

  return {
    vm: vm.name,
    ip,
    isWindows,
    playbook,
    ansible: {
      success: proc.exitCode === 0,
      exitCode: proc.exitCode,
      playRecap,
    },
    timings,
  }
}

export async function checkCaldera(ludusUrl, apiKey, data, ws) {
  const { label } = data
  if (!label) throw new Error("label is required")

  const range = await apiCall(ludusUrl, apiKey, "/range")
  const vm = findVM(range.VMs ?? [], label)
  const ip = vm.ip && vm.ip !== "null" ? vm.ip : await waitForVMIP(ludusUrl, apiKey, vm.name)

  try {
  const result = await $`sshpass -p 'kali' ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 kali@${ip} "systemctl is-active caldera"`.quiet().text()
    return { calderaInstalled: result.trim() === "active" }
  } catch {
    return { calderaInstalled: false }
  }
}

export async function getVmDefs() {
  return VM_DEFS
}