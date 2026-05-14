import { $ } from "bun"

const VM_DEFS = {
  "router":       { template: "debian-11-x64-server-template", hostname: "{{ range_id }}-router", vm_name: "{{ range_id }}-router-debian11-x64", ram_gb: 2, cpus: 2 },
  "attacker-kali": { template: "kali-x64-desktop-template", hostname: "attacker-kali", vlan: 99, ip_last_octet: 1, ram_gb: 4, cpus: 2, linux: true },
  "win11-22h2":   { template: "win11-22h2-x64-enterprise-template", hostname: "WIN11-22H2", vlan: 99, ip_last_octet: 24, ram_gb: 4, cpus: 2, windows: { sysprep: false } },
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

async function waitForVMIP(ludusUrl, apiKey, vmName, timeoutSecs = 120) {
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

export async function preloadInventory(ludusUrl, apiKey) {
  cachedInventory = await fetchAnsibleInventory(ludusUrl, apiKey)
  return cachedInventory
}

async function waitForConnectivity(ludusUrl, apiKey, vmName, ip, isWindows) {
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
  if (!readyPort) throw new Error(`Timeout: ports ${ports.join(",")} not reachable on ${ip} (${vmName})`)

  const inventoryText = cachedInventory || await fetchAnsibleInventory(ludusUrl, apiKey)
  const escaped = inventoryText.replace(/'/g, "'\\''")
  if (isWindows) {
    await $`bash -c "uv run ansible ${vmName} -i <(echo '${escaped}') -m win_ping -e 'ansible_winrm_read_timeout_sec=10 ansible_winrm_operation_timeout_sec=5'"`
  } else {
    await $`bash -c "uv run ansible ${vmName} -i <(echo '${escaped}') -m ping"`
  }
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

export async function deleteRangeVMs(ludusUrl, apiKey, data) {
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
  await apiCall(ludusUrl, apiKey, "/range/deploy", "POST", { force: true })
  setTimeout(() => preloadInventory(ludusUrl, apiKey).catch(() => {}), 5000)
  return { deployed: ["router", ...vmNames] }
}

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
      const ip = vm.ip || await waitForVMIP(ludusUrl, apiKey, vm.name)
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