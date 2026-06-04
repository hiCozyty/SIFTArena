const CALDERA_URL = "http://10.1.99.1:8888"
const CALDERA_KEY = "ADMIN123"
const OUT_FILE = import.meta.dir + "/focusedTechniques.json"

const CATEGORIES = {
  "credential-access": [
    "T1003.001",
  ],
}

const VALID_TECHNIQUES = new Set(Object.values(CATEGORIES).flat())

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

const PAYLOAD_DIR = "~/caldera/plugins/atomic/data/atomic-red-team/ExternalPayloads"

const PAYLOAD_DOWNLOADS = {
  "procdump.exe": {
    kali_steps: `mkdir -p ${PAYLOAD_DIR} && \\\nwget -q "https://download.sysinternals.com/files/Procdump.zip" -O /tmp/Procdump.zip && \\\nunzip -o /tmp/Procdump.zip -d /tmp/Procdump && \\\ncp /tmp/Procdump/procdump64.exe ${PAYLOAD_DIR}/procdump.exe && \\\nrm -rf /tmp/Procdump.zip /tmp/Procdump && \\\nsystemctl restart caldera`,
    win_steps: "",
  },
  "Outflank-Dumpert.exe": {
    kali_steps: `mkdir -p ${PAYLOAD_DIR} && \\\nwget -q "https://github.com/clr2of8/Dumpert/raw/5838c357224cc9bc69618c80c2b5b2d17a394b10/Dumpert/x64/Release/Outflank-Dumpert.exe" -O ${PAYLOAD_DIR}/Outflank-Dumpert.exe && \\\nsystemctl restart caldera`,
    win_steps: "",
  },
  "nanodump.x64.exe": {
    kali_steps: `mkdir -p ${PAYLOAD_DIR} && \\\nwget -q "https://github.com/fortra/nanodump/raw/2c0b3d5d59c56714312131de9665defb98551c27/dist/nanodump.x64.exe" -O ${PAYLOAD_DIR}/nanodump.x64.exe && \\\nsystemctl restart caldera`,
    win_steps: "",
  },
  "mimikatz.exe": {
    kali_steps: `mkdir -p ${PAYLOAD_DIR}/x64 && \\\nwget -q "https://github.com/gentilkiwi/mimikatz/releases/latest/download/mimikatz_trunk.zip" -O /tmp/mimikatz.zip && \\\nunzip -o /tmp/mimikatz.zip -d /tmp/mimikatz && \\\ncp /tmp/mimikatz/x64/mimikatz.exe ${PAYLOAD_DIR}/x64/mimikatz.exe && \\\nrm -rf /tmp/mimikatz.zip /tmp/mimikatz && \\\nsystemctl restart caldera`,
    win_steps: "",
  },
  "pypykatz": {
    kali_steps: `pip3 install pypykatz && \
cp -r $(python3 -c "import pypykatz, os; print(os.path.dirname(pypykatz.__file__))") ${PAYLOAD_DIR}/pypykatz && \
systemctl restart caldera`,
    win_steps: `invoke-webrequest "https://www.python.org/ftp/python/3.10.4/python-3.10.4-amd64.exe" -outfile "ExternalPayloads\\python_setup.exe"
Start-Process -FilePath "ExternalPayloads\\python_setup.exe" -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1 Include_test=0" -Wait`,
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

  return {
    ...ability,
    kali_prereq: info.kali_steps || "",
    win_prereq: info.win_steps || "",
  }
}

function strip(ability) {
  const executor = ability.executors?.[0] ?? {}
  return {
    ability_id: ability.ability_id,
    name: ability.name,
    description: ability.description ?? "",
    command: executor.command ?? "",
    kali_prereq: ability.kali_prereq ?? "",
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
    const cat = ability.tactic
    const tid = ability.technique_id
    if (!result.techniques[cat]?.[tid]) continue

    if (!result.techniques[cat][tid].technique_name) {
      result.techniques[cat][tid].technique_name = ability.technique_name
    }

    const seen = result.techniques[cat][tid].abilities.map(a => a.ability_id)
    if (!seen.includes(ability.ability_id)) {
      result.techniques[cat][tid].abilities.push(enrichPayloads(filterExecutors(ability)))
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
  console.log(`Wrote ${OUT_FILE} (${size} KB, ${totalAbilities} abilities across ${totalTechs} techniques)`)
}

main().catch(err => {
  console.error("Error:", err.message)
  process.exit(1)
})
