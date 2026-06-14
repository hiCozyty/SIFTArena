import { $ } from "bun"
import { getPlaybooks } from "../caldera/playbooks.js"
import { restoreToBaseClean } from "../ludus/range.js"

const RANGE_ID = process.env.LUDUS_RANGE_ID || "ty"

export let lastPlaybookResult = null

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function sendStatus(ws, step, status, message) {
  ws.send(JSON.stringify({ type: "runPlaybookStatus", step, status, message }))
}
async function apiCall(ludusUrl, apiKey, path) {
  const res = await fetch(`${ludusUrl}${path}`, {
    headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
    tls: { rejectUnauthorized: false },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Ludus API error: ${res.status}`)
  return data
}

async function winrmRun(host, user, pass, command) {
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

async function runScheduledTask(ip, taskName, command, runAsSystem) {
  const encoded = Buffer.from(command, "utf-16le").toString("base64")
  const user = runAsSystem ? "NT AUTHORITY\\SYSTEM" : "localuser"


  const ps = [
    `$taskName = '${taskName}'`,
    `$encoded = '${encoded}'`,
    `$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -EncodedCommand $encoded"`,
    `$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(1)`,
    `$principal = New-ScheduledTaskPrincipal -UserId '${user}' -LogonType ServiceAccount -RunLevel Highest`,
    `Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null`,
    `Start-ScheduledTask -TaskName $taskName`,
    `Write-Host 'TASK_STARTED'`
  ].join("; ")

  await winrmRun(ip, "localuser", "password", `powershell -Command "${ps}"`)

  await sleep(3000)

  let lastLog = ""
  for (let i = 0; i < 180; i++) {
    const state = await winrmRun(ip, "localuser", "password",
      `powershell -Command "(Get-ScheduledTask -TaskName '${taskName}' -ErrorAction SilentlyContinue).State"`)
    const trimmed = state.trim()
    if (trimmed !== "Running") {
      return trimmed
    }
    if (i % 5 === 0 && lastLog !== trimmed) {
      lastLog = trimmed
    }
    await sleep(1000)
  }
  throw new Error(`Task "${taskName}" did not complete within 3 minutes`)
}

const SERVICE_NAMES = [
  "WdiServiceHost", "CDPUserSvc", "BITS", "SysMain", "WpnService",
  "FontCache", "DusmSvc", "StateRepository", "SENS", "DPS",
  "CscService", "EventSystem", "HvHost", "IKEEXT", "Wcmsvc",
  "WinHttpAutoProxySvc", "AppHostSvc", "AppIDSvc", "Appinfo", "AudioEndpointBuilder",
  "Audiosrv", "BFE", "BrokerInfrastructure", "Browser", "CertPropSvc",
  "COMSysApp", "CoreMessagingRegistrar", "CryptSvc", "defragsvc", "DeviceAssociationService",
  "DeviceInstall", "Dhcp", "DiagTrack", "DmEnrollmentSvc", "Dnscache",
  "DoSvc", "dot3svc", "DsSvc", "EapHost", "EFS",
  "entAppSvc", "FDResPub", "fhsvc", "FontCache3.0.0.0", "FrameServer",
  "gpsvc", "hidserv", "hns", "iphlpsvc", "KeyIso",
  "KTMRM", "LanmanServer", "LanmanWorkstation", "lltdsvc", "lmhosts",
  "LSM", "MSDTC", "MSiSCSI", "msiserver", "NaturalAuthentication",
  "NcaSvc", "NcbService", "NcdAutoSetup", "Netlogon", "Netman",
  "NetMsmqActivator", "NetPipeActivator", "netprofm", "NetTcpActivator",
  "NetTcpPortSharing", "NlaSvc", "nsi", "PcaSvc", "PerfHost",
  "pla", "PlugPlay", "PNRPsvc", "PolicyAgent", "Power",
  "PrintNotify", "ProfSvc", "QWAVE", "RasAuto", "RasMan",
  "RemoteAccess", "RemoteRegistry", "RmSvc", "RpcEptMapper", "RpcLocator",
  "SCardSvr", "ScDeviceEnum", "Schedule", "SCPolicySvc", "SDRSVC",
  "seclogon", "SensorDataService", "SensorService", "SensrSvc", "SessionEnv",
  "SharedAccess", "ShellHWDetection", "smphost", "SNMPTRAP", "Spooler",
  "sppsvc", "SSDPSRV", "SstpSvc", "StiSvc", "StorSvc",
  "svsvc", "swprv", "SystemEventsBroker", "TabletInputService", "TapiSrv",
  "TermService", "Themes", "TieringEngineService", "TimeBrokerSvc", "TokenBroker",
  "TrkWks", "TrustedInstaller", "tzautoupdate", "UdkUserSvc", "UevAgentService",
  "UI0Detect", "UmRdpService", "upnphost", "UserManager", "UsoSvc",
  "VaultSvc", "vds", "VSS", "W32Time", "W3SVC",
  "WaaSMedicSvc", "WalletService", "WarpJITSvc", "wbengine", "WbioSrvc",
  "wcncsvc", "WdiSystemHost", "WdNisSvc", "WebClient", "Wecsvc",
  "wercplsupport", "WerSvc", "WiaRpc", "WinDefend", "Winmgmt",
  "WinRM", "wisvc", "wlidsvc", "wlpasvc", "WManSvc",
  "wmiApSrv", "WMPNetworkSvc", "workfolderssvc", "WPDBusEnum", "wscsvc",
  "WSearch", "wuauserv", "wudfsvc", "WwanSvc",
]

function pickServiceName(used = new Set()) {
  const available = SERVICE_NAMES.filter(n => !used.has(n))
  if (available.length === 0) throw new Error("No available service names (pool exhausted)")
  return available[Math.floor(Math.random() * available.length)]
}

async function cleanupScheduledTasks(ip, taskNames) {
  if (taskNames.length === 0) return
  for (const name of taskNames) {
    try {
      await winrmRun(ip, "localuser", "password",
        `powershell -Command "Unregister-ScheduledTask -TaskName '${name}' -Confirm:$false -ErrorAction SilentlyContinue; Write-Host 'REMOVED:${name}'"`)
    } catch (err) {
    }
  }
}

function randomStagger(stagger) {
  if (!stagger || stagger <= 0) return 0
  return Math.floor(Math.random() * (stagger + 1))
}

export async function runPlaybook(ludusUrl, apiKey, data, ws) {
  let winIp = null
  const taskNames = []
  let bgRunning = false
  const runStartedAt = Date.now()
  const timelineResults = []
  const bgResults = []

  try {
    const { playbookName } = data.data || {}
    if (!playbookName) {
      return { playbookName: "", startedAt: runStartedAt, finishedAt: Date.now(), timeline: [], error: "No playbook name provided" }
    }


    const playbooks = getPlaybooks()
    const playbook = playbooks.find(p => p.name === playbookName)
    if (!playbook) {
      return { playbookName, startedAt: runStartedAt, finishedAt: Date.now(), timeline: [], error: `Playbook "${playbookName}" not found` }
    }

    const { timelineEvents, persistentBgCommands, settings } = playbook
    settings.staggerBetweenEvents = settings.staggerBetweenEvents ?? settings.jitterBetweenEvents ?? 0
    settings.persistentBgStagger = settings.persistentBgStagger ?? settings.persistentBgJitter ?? 0


    const events = timelineEvents.filter(e => e?.id || (e?.name && e?.command))
    const bgCommands = persistentBgCommands.filter(b => b?.name && b?.command)

    sendStatus(ws, "init", "running", `Settings: ${JSON.stringify(settings)}, events: ${events.length}, bg: ${bgCommands.length}`)

    for (let i = 0; i < events.length; i++) {
      const e = events[i]
      const type = e.id ? "ability" : "noise"
    }
    for (let i = 0; i < bgCommands.length; i++) {
    }

    // ==================== Step 0: Revert ====================
    sendStatus(ws, "revert", "running", "Reverting win11-22h2 to base-clean snapshot...")

    const tRevert = performance.now()
    const revertResult = await restoreToBaseClean(ludusUrl, apiKey, { label: "win11-22h2" })
    const revertMs = (performance.now() - tRevert).toFixed(0)
    sendStatus(ws, "revert", "success", `VM reverted to base-clean (${revertMs}ms)`)

    winIp = revertResult.ip

    // ==================== Step 1: Power check ====================
    sendStatus(ws, "powerCheck", "running", "Checking VM power status...")

    const range = await apiCall(ludusUrl, apiKey, "/range")
    const vms = range.VMs ?? []
    const winVm = vms.find(v => (v.name || "").toLowerCase().includes("win11-22h2"))
    if (!winVm) {
      throw new Error("win11-22h2 VM not found in range")
    }
    if (!winVm.poweredOn) {
      throw new Error(`win11-22h2 (${winVm.name}) is powered off`)
    }
    sendStatus(ws, "powerCheck", "success", `win11-22h2 powered on (${winVm.name})`)

    // ==================== Step 2: CLI check ====================
    sendStatus(ws, "cliCheck", "running", "Checking WinRM connectivity...")

    try {
      await $`bash -c "timeout 3 bash -c '</dev/tcp/${winIp}/5986' 2>/dev/null"`.quiet()
      sendStatus(ws, "cliCheck", "success", `WinRM port 5986 reachable at ${winIp}`)
    } catch {
      throw new Error(`WinRM port 5986 on win11-22h2 (${winIp}) not reachable`)
    }

    // === Start background noise (concurrent with timeline) ===
    if (bgCommands.length > 0) {

      sendStatus(ws, "bg-noise", "running", `Starting ${bgCommands.length} persistent background events...`)
      bgRunning = true
      const usedBgNames = new Set()

      if (settings.persistentBgRandomize && bgCommands.length > 1) {
        ;(async () => {
          let runCount = 0
          while (bgRunning) {
            const bg = bgCommands[Math.floor(Math.random() * bgCommands.length)]
            const taskName = pickServiceName(usedBgNames)
            usedBgNames.add(taskName)
            taskNames.push(taskName)
            runCount++
            const startedAt = Date.now()
            try {
              sendStatus(ws, "bg-random", "running", `BG "${bg.name}" run #${runCount} starting`)
              await runScheduledTask(winIp, taskName, bg.command, false)
              const finishedAt = Date.now()
              bgResults.push({
                name: bg.name, command: bg.command, taskName,
                startedAt, finishedAt, durationMs: finishedAt - startedAt,
                status: "success", error: null, runIndex: runCount - 1,
              })
              sendStatus(ws, "bg-random", "success", `BG "${bg.name}" run #${runCount} completed`)
            } catch (err) {
              const finishedAt = Date.now()
              bgResults.push({
                name: bg.name, command: bg.command, taskName,
                startedAt, finishedAt, durationMs: finishedAt - startedAt,
                status: "error", error: err.message, runIndex: runCount - 1,
              })
              sendStatus(ws, "bg-random", "error", `BG "${bg.name}" run #${runCount} failed: ${err.message}`)
            }
            if (!bgRunning) break
            const staggerMs = randomStagger(settings.persistentBgStagger || 0)
            const interval = (settings.persistentBgInterval || 2000) + staggerMs
            sendStatus(ws, "bg-random", "running", `Sleeping ${interval}ms (base=${settings.persistentBgInterval || 2000}ms, stagger=${staggerMs}ms)`)
            await sleep(Math.max(0, interval))
          }
        })()
      } else {
        for (let i = 0; i < bgCommands.length; i++) {
        const bg = bgCommands[i]
        const bgTaskName = pickServiceName(usedBgNames)
        usedBgNames.add(bgTaskName)
        taskNames.push(bgTaskName)


        ;(async () => {
          let runCount = 0
          while (bgRunning) {
            runCount++
            const startedAt = Date.now()
            try {
              sendStatus(ws, `bg-${i}`, "running", `BG "${bg.name}" run #${runCount} starting`)
              await runScheduledTask(winIp, bgTaskName, bg.command, false)
              const finishedAt = Date.now()
              bgResults.push({
                name: bg.name, command: bg.command, taskName: bgTaskName,
                startedAt, finishedAt, durationMs: finishedAt - startedAt,
                status: "success", error: null, runIndex: runCount - 1,
              })
              sendStatus(ws, `bg-${i}`, "success", `BG "${bg.name}" run #${runCount} completed`)
            } catch (err) {
              const finishedAt = Date.now()
              bgResults.push({
                name: bg.name, command: bg.command, taskName: bgTaskName,
                startedAt, finishedAt, durationMs: finishedAt - startedAt,
                status: "error", error: err.message, runIndex: runCount - 1,
              })
              sendStatus(ws, `bg-${i}`, "error", `BG "${bg.name}" run #${runCount} failed: ${err.message}`)
            }
            if (!bgRunning) {
              break
            }
            const staggerMs = randomStagger(settings.persistentBgStagger || 0)
            const interval = (settings.persistentBgInterval || 2000) + staggerMs
            sendStatus(ws, `bg-${i}`, "running", `BG "${bg.name}" sleeping ${interval}ms (base=${settings.persistentBgInterval || 2000}ms, stagger=${staggerMs}ms)`)
            await sleep(Math.max(0, interval))
          }
        })()
        }
      }
      sendStatus(ws, "bg-noise", "success", `${bgCommands.length} persistent background events started`)
    } else {
      sendStatus(ws, "bg-noise", "success", "No persistent background events")
    }

    // ==================== Step 3: Timeline events ====================

    const signalToNoise = settings.signalToNoiseRatio ?? 1

    // Build steps: expand noise events into N repetitions, skip empty slots
    const steps = []
    for (let i = 0; i < events.length; i++) {
      const e = events[i]
      if (!e.id && (!e.name || !e.command)) continue
      const isAbility = !!e.id
      steps.push({ event: e, isAbility, repetitions: isAbility ? 1 : signalToNoise })
    }

    sendStatus(ws, "timeline", "running", `Executing ${steps.length} timeline steps (signal:noise ratio 1:${signalToNoise})...`)

    let timelineIndex = 0

    for (let s = 0; s < steps.length; s++) {
      const step = steps[s]

      // Wait between steps (not before first)
      if (s > 0) {
        const waitMs = (settings.waitTimeBetweenEvents || 1000) + randomStagger(settings.staggerBetweenEvents || 0)
        sendStatus(ws, `wait-${s}`, "running", `Waiting ${waitMs}ms before step (base=${settings.waitTimeBetweenEvents}ms, stagger=${settings.staggerBetweenEvents}ms)`)
        await sleep(Math.max(0, waitMs))
        sendStatus(ws, `wait-${s}`, "success", "Wait complete")
      }

      // Run repetitions (1 for ability, N for noise — back-to-back within a noise set)
      for (let r = 0; r < step.repetitions; r++) {
        const tag = `${s}-${r}`
        const label = step.isAbility
          ? `ability "${step.event.id || step.event.name}"`
          : `noise "${step.event.name}" (${r + 1}/${step.repetitions})`

        sendStatus(ws, `event-${tag}`, "running", `Running ${label}`)

        const taskName = pickServiceName()
        taskNames.push(taskName)

        const startedAt = Date.now()
        try {
          await runScheduledTask(winIp, taskName, step.event.command, step.isAbility)
          const finishedAt = Date.now()
          const durationMs = finishedAt - startedAt

          const entry = {
            index: timelineIndex,
            id: step.event.id || null,
            name: step.event.name || null,
            description: step.event.description || null,
            command: step.event.command || "",
            taskName,
            type: step.isAbility ? "ability" : "noise",
            repeatIndex: step.isAbility ? null : r,
            startedAt,
            finishedAt,
            durationMs,
            status: "success",
            error: null,
          }
          timelineResults.push(entry)
          timelineIndex++
          sendStatus(ws, `event-${tag}`, "success", JSON.stringify(entry))
        } catch (err) {
          const finishedAt = Date.now()
          const durationMs = finishedAt - startedAt

          const entry = {
            index: timelineIndex,
            id: step.event.id || null,
            name: step.event.name || null,
            description: step.event.description || null,
            command: step.event.command || "",
            taskName,
            type: step.isAbility ? "ability" : "noise",
            repeatIndex: step.isAbility ? null : r,
            startedAt,
            finishedAt,
            durationMs,
            status: "error",
            error: err.message,
          }
          timelineResults.push(entry)
          timelineIndex++
          sendStatus(ws, `event-${tag}`, "error", JSON.stringify(entry))
          throw err
        }
      }
    }

    sendStatus(ws, "timeline", "success", `All ${events.length} timeline events executed`)

    // ==================== Stop background noise ====================
    if (bgRunning) {
      bgRunning = false
      await sleep(2000)
    }

    // ==================== Cleanup ====================

    sendStatus(ws, "cleanup", "running", "Removing scheduled tasks...")
    await cleanupScheduledTasks(winIp, taskNames)

    sendStatus(ws, "cleanup", "success", `Removed ${taskNames.length} scheduled tasks`)

    lastPlaybookResult = { playbookName, startedAt: runStartedAt, finishedAt: Date.now(), timeline: timelineResults, backgroundEvents: bgResults }
    return lastPlaybookResult

  } catch (err) {

    try {
      if (bgRunning) {
        bgRunning = false
        await sleep(2000)
      }
      if (winIp && taskNames.length > 0) {
        sendStatus(ws, "cleanup", "running", "Cleaning up on error...")
        await cleanupScheduledTasks(winIp, taskNames)
        sendStatus(ws, "cleanup", "success", "Cleanup complete")
      }
    } catch (cleanupErr) {
    }

    throw err
  }
}
