const VM_DEFS = {
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

export async function fetchRangeWithLog(ludusUrl, apiKey) {
  const range = await apiCall(ludusUrl, apiKey, "/range")
  const vms = range.VMs ?? []
  console.log("VMs:", vms.map((v) => v.name).join(", "))
  let latestLog = ""
  let logEmpty = true
  try {
    const history = await apiCall(ludusUrl, apiKey, "/range/logs/history")
    const entry = history.find((e) => e.status === "running") ?? history[0]
    if (entry) {
      const detail = await apiCall(ludusUrl, apiKey, `/range/logs/history/${entry.id}`)
      const clean = (detail.result ?? "").replace(/\u001b\[[0-9;]*m/g, "").replace(/\s+$/, "")
      logEmpty = !clean
      if (clean) {
        latestLog = clean
        const tail = clean.split("\n").slice(-5).join("\n")
        console.log("latest log (tail):\n" + tail)
      }
    }
  } catch (err) {
    console.error("fetchRangeWithLog — error:", err.message)
  }
  return [vms, { latestLog, logEmpty }]
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
  return { deployed: vmName }
}
