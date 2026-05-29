---
component_id: 2
component_name: Range Infrastructure Manager
---

# Range Infrastructure Manager

## Component Description

Manages the full lifecycle of cyber range environments including VM deployment, network topology configuration, Ansible automation, snapshot management, and RDP connection proxying. Handles provisioning of base VMs (Kali, Windows, router), golden image preparation, and secure remote desktop access via DER-encoded certificate exchange.

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

### /home/cozyty/Projects/shadowProtocol/server/ludus/range.js (lines 653-740)
```
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
```

### /home/cozyty/Projects/shadowProtocol/server/rdp-proxy.js (lines 292-376)
```
export function createRdpProxyHandler() {
  const activeSessions = new Map()

  return {
    open(ws) {
      const vmIp = ws.data?.vmIp
      if (!vmIp) {
        ws.close(1008, "Missing VM IP")
        return
      }

      console.log(`[rdp] WebSocket opened for ${vmIp}:3389`)

      let handshakeDone = false

      ws.binaryType = "arraybuffer"
      ws.addEventListener("message", async (event) => {
        if (handshakeDone) {
          // Relay mode: forward to TLS socket
          const session = activeSessions.get(ws)
          if (session?.tlsSocket && !session.tlsSocket.destroyed) {
            session.tlsSocket.write(new Uint8Array(event.data))
          }
          return
        }

        handshakeDone = true
        try {
          const requestData = new Uint8Array(event.data)
          console.log(`[rdp ${vmIp}] RDCleanPath request (${requestData.length} bytes)`)

          // Parse RDCleanPath request (use vmIp from URL, not destination from PDU)
          const request = parseRDCleanPathRequest(requestData)
          console.log(`[rdp ${vmIp}] destination: ${request.destination}`)

          // Perform RDP handshake
          const { x224Response, certChain, tlsSocket } = await performRDPHandshake(
            vmIp,
            3389,
            request.x224ConnectionRequest
          )

          // Send RDCleanPath response
          const serverAddr = `${vmIp}:3389`
          const responsePdu = buildRDCleanPathResponse(serverAddr, x224Response, certChain)
          console.log(`[rdp ${vmIp}] Sending RDCleanPath response (${responsePdu.length} bytes)`)
          ws.send(responsePdu)

          // Set up relay
          activeSessions.set(ws, { tlsSocket, vmIp })
          setupRelay(ws, tlsSocket, vmIp)

          // Handle WS messages for relay
          ws.addEventListener("message", (ev) => {
            if (!handshakeDone) return
            const session = activeSessions.get(ws)
            if (session?.tlsSocket && !session.tlsSocket.destroyed) {
              session.tlsSocket.write(new Uint8Array(ev.data))
            }
          })

          console.log(`[rdp ${vmIp}] Handshake complete — relay active`)
        } catch (err) {
          console.error(`[rdp ${vmIp}] Handshake error:`, err.message)
          try {
            const errorPdu = buildRDCleanPathError(1, 502)
            ws.send(errorPdu)
          } catch {}
          ws.close(1011, err.message)
        }
      })

      ws.addEventListener("close", () => {
        const session = activeSessions.get(ws)
        if (session?.tlsSocket) {
          session.tlsSocket.destroy()
          activeSessions.delete(ws)
        }
        console.log(`[rdp ${vmIp}] WebSocket closed`)
      })
    },
    message() {},
    close() {},
  }
}
```

### /home/cozyty/Projects/shadowProtocol/server/rdp-proxy.js (lines 189-246)
```
function performRDPHandshake(host, port, x224Request) {
  return new Promise((resolve, reject) => {
    const log = `[${host}:${port}]`
    const timeout = setTimeout(() => {
      tcpSocket.destroy()
      reject(new Error("Connection timed out"))
    }, 15000)

    const tcpSocket = new tls.TLSSocket(undefined, {
      socket: undefined,
      rejectUnauthorized: false,
      servername: host,
    })

    // Step 1: TCP connect
    const conn = Bun.connect({
      hostname: host,
      port,
      socket: {
        data(tcp, data) {
          // First data: X.224 Connection Confirm
          tcp.removeAllListeners?.("data")
          const x224Response = new Uint8Array(data)

          // Step 4: TLS handshake
          const tlsSocket = tls.connect({
            socket: tcp,
            servername: host,
            rejectUnauthorized: false,
          })

          tlsSocket.on("secureConnect", () => {
            clearTimeout(timeout)
            const peerCert = tlsSocket.getPeerCertificate(true)
            const certChain = extractCertChain(peerCert)
            resolve({ x224Response, certChain, tlsSocket })
          })

          tlsSocket.on("error", (err) => {
            clearTimeout(timeout)
            reject(new Error(`TLS handshake failed: ${err.message}`))
          })
        },
        error(tcp, err) {
          clearTimeout(timeout)
          reject(new Error(`TCP connection failed: ${err.message}`))
        },
        close() {
          clearTimeout(timeout)
          reject(new Error("TCP connection closed during handshake"))
        },
      },
    })

    // Step 2: Send X.224 Connection Request
    conn.write(new Uint8Array(x224Request))
  })
}
```


## Source Files:

- `server/ludus/range.js`
- `server/ludus/templates.js`
- `server/rdp-proxy.js`
- `server/templates.js`

