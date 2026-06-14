import { readdir, stat } from "node:fs/promises"
import { join, basename } from "node:path"
import { collectEvidence as runEvidenceCollection, abortEvidenceCollection as abortRunningCollection } from "../benchmark/evidenceCollection.js"

const WORKFLOWS_DIR = join(import.meta.dir, "..", "..", "workflows")
const EVIDENCE_DIR = join(import.meta.dir, "..", "..", "evidence")

let currentMountedEvidence = null

async function sshExec(cmd, timeoutMs = 120_000) {
  const proc = Bun.spawn([
    "sshpass", "-p", "forensics", "ssh",
    "-p", "2222",
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "LogLevel=ERROR",
    "-n",
    "sift@localhost",
    cmd,
  ], { stdin: "ignore", timeout: timeoutMs })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  await proc.exited
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: proc.exitCode }
}

async function writeJsonRemote(filePath, data, timeoutMs = 120_000) {
  const proc = Bun.spawn([
    "sshpass", "-p", "forensics", "ssh",
    "-p", "2222",
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "LogLevel=ERROR",
    "-n",
    "sift@localhost",
    `bun -e 'const json = JSON.parse(await Bun.stdin.text()); await Bun.write("${filePath}", JSON.stringify(json, null, 2));'`
  ], { stdin: "pipe", timeout: timeoutMs })
  proc.stdin.write(JSON.stringify(data))
  proc.stdin.end()
  await proc.exited
  if (proc.exitCode !== 0) throw new Error(`writeJsonRemote failed for ${filePath}`)
}

export async function preAgentStagingPipeline(_, __, data, ws) {
  const { playbookName, attackWindowStartMs, attackWindowEndMs } = data.data || {}
  if (!playbookName) throw new Error("playbookName is required")

  const evidencePath = `/home/sift/evidence/${playbookName}`
  const e01Path = `${evidencePath}/disk-image.E01`
  const memoryPath = `${evidencePath}/memory.dump`
  const outputDir = `${evidencePath}/staged`

  // Create output directory on SIFT
  const { stderr: mkdirErr } = await sshExec(`mkdir -p ${outputDir} 2>/dev/null`)
  if (mkdirErr && !mkdirErr.includes("File exists")) {
    throw new Error(`Failed to create output dir: ${mkdirErr}`)
  }

  // Determine attack window
  let windowStart = attackWindowStartMs
  let windowEnd = attackWindowEndMs
  if (!windowStart || !windowEnd) {
    const gtPath = `${evidencePath}/groundTruth.json`
    const { stdout: gtContent } = await sshExec(`cat ${gtPath} 2>/dev/null || echo '{}'`)
    if (gtContent && gtContent !== '{}') {
      try {
        const gt = JSON.parse(gtContent)
        windowStart = gt.attackStart || gt.WINDOW_START_MS
        windowEnd = gt.attackEnd || gt.WINDOW_END_MS
      } catch {}
    }
  }
  if (!windowStart || !windowEnd) {
    throw new Error("Attack window not provided and groundTruth.json missing start/end")
  }

  const windowStartS = Math.floor(windowStart / 1000)
  const windowEndS = Math.ceil(windowEnd / 1000)

  // Get NTFS offset (reuse existing detection)
  const offset = await detectPartitionOffset(evidencePath)

  const sendStatus = (step, status, message) => {
    if (ws) ws.send(JSON.stringify({ type: "preAgentStagingStatus", step, status, message }))
  }

  sendStatus("inodes", "start", "Locating forensic artifacts")

  // Get inodes for all required files
  const { stdout: flsOut } = await sshExec(`sudo fls -r -o ${offset} "${e01Path}" 2>/dev/null | grep -iE "Sysmon%4Operational.evtx|Security.evtx|PowerShell%4Operational.evtx|\\.pf$|\\$MFT|UsnJrnl"`, 180_000)
  const lines = flsOut.split("\n")
  const inodes = { sysmon: null, security: null, powershell: null, prefetch: [], mft: null, usn: null }
  for (const line of lines) {
    const match = line.match(/(\d+)-\d+-\d+:\s+(.+)$/)
    if (!match) continue
    const inode = match[1]
    const name = match[2].toLowerCase()
    if (name.includes("sysmon") && name.includes("operational")) inodes.sysmon = inode
    if (name === "security.evtx") inodes.security = inode
    if (name.includes("powershell") && name.includes("operational")) inodes.powershell = inode
    if (name.endsWith(".pf")) inodes.prefetch.push(inode)
    if (name === "$mft") inodes.mft = inode
    if (name === "$usnjrnl" || name === "usnjrnl") inodes.usn = inode
  }
  if (!inodes.sysmon || !inodes.security || !inodes.mft) {
    throw new Error(`Missing essential inodes: sysmon=${inodes.sysmon} security=${inodes.security} mft=${inodes.mft}`)
  }
  sendStatus("inodes", "done", `Found: sysmon=${inodes.sysmon}, security=${inodes.security}, mft=${inodes.mft}`)

  // Helper to extract and parse EVTX
  async function parseEvtx(inode, logName) {
    const tmpEvtx = `/tmp/${logName}.evtx`
    await sshExec(`sudo icat -o ${offset} "${e01Path}" ${inode} > ${tmpEvtx} 2>/dev/null`)
    const { stdout: xml } = await sshExec(`evtxexport -f xml ${tmpEvtx} 2>/dev/null | head -500000`, 120_000)
    const events = []
    const eventBlocks = xml.split(/(?=<\?xml|<Event)/)
    for (const block of eventBlocks) {
      if (!block.includes("<Event")) continue
      const eidMatch = block.match(/<EventID>(\d+)<\/EventID>/)
      if (!eidMatch) continue
      const tsMatch = block.match(/TimeCreated SystemTime="([^"]+)"/)
      let timestamp = null
      if (tsMatch) {
        const tsStr = tsMatch[1].replace("Z", "+00:00")
        timestamp = new Date(tsStr).getTime()
      }
      if (timestamp && timestamp >= windowStart && timestamp <= windowEnd) {
        events.push({ eventId: parseInt(eidMatch[1], 10), timestamp, rawPreview: block.slice(0, 500) })
      }
    }
    await writeJsonRemote(`${outputDir}/${logName}.json`, events)
    return events.length
  }

  sendStatus("evtx", "start", "Parsing EVTX logs")
  const sysmonCount = await parseEvtx(inodes.sysmon, "sysmon")
  const securityCount = await parseEvtx(inodes.security, "security")
  let powershellCount = 0
  if (inodes.powershell) powershellCount = await parseEvtx(inodes.powershell, "powershell")
  sendStatus("evtx", "done", `EVTX: sysmon=${sysmonCount}, security=${securityCount}, ps=${powershellCount} events in window`)

  sendStatus("usn", "start", "Parsing USN journal")
  const { stdout: usnJson } = await sshExec(`sudo icat -o ${offset} "${e01Path}" ${inodes.usn} 2>/dev/null | python3 -c "
import sys, struct, json, datetime
WINDOW_START = ${windowStartS}
WINDOW_END = ${windowEndS}
data = sys.stdin.buffer.read()
records = []
offset = 0
while offset < len(data) - 60:
    try:
        rec_len = struct.unpack_from('<I', data, offset)[0]
        if rec_len < 60 or rec_len > 65536:
            offset += 8
            continue
        major = struct.unpack_from('<H', data, offset + 4)[0]
        if major not in (2, 3):
            offset += 8
            continue
        ft = struct.unpack_from('<q', data, offset + 24)[0]
        reason = struct.unpack_from('<I', data, offset + 40)[0]
        fname_len = struct.unpack_from('<H', data, offset + 56)[0]
        fname_off = struct.unpack_from('<H', data, offset + 58)[0]
        fname_end = offset + fname_off + fname_len
        if fname_end > len(data):
            offset += rec_len
            continue
        fname = data[offset + fname_off:fname_end].decode('utf-16-le', errors='replace')
        epoch = (ft - 116444736000000000) // 10000000
        if WINDOW_START <= epoch <= WINDOW_END:
            records.append({'timestamp': epoch, 'file': fname, 'reason': hex(reason)})
        offset += rec_len
    except:
        offset += 8
print(json.dumps(records))
"`, 120_000)
  const usnRecords = JSON.parse(usnJson || "[]")
  await writeJsonRemote(`${outputDir}/usn_journal.json`, usnRecords)
  sendStatus("usn", "done", `USN: ${usnRecords.length} records`)

  sendStatus("mft", "start", "Building MFT timeline")
  const { stdout: mftLines } = await sshExec(`sudo fls -m "C:" -o ${offset} "${e01Path}" 2>/dev/null | mactime -d -b - 2>/dev/null | awk -v start=${windowStartS} -v end=${windowEndS} '$2 >= start && $2 <= end' | head -100000`, 180_000)
  const mftEntries = mftLines.split("\n").filter(l => l.trim()).map(line => {
    const parts = line.split("|")
    if (parts.length < 10) return null
    return { timestamp: parseInt(parts[1], 10), name: parts[0], file: parts[9], size: parseInt(parts[6], 10) }
  }).filter(Boolean)
  await writeJsonRemote(`${outputDir}/mft_timeline.json`, mftEntries)
  sendStatus("mft", "done", `MFT: ${mftEntries.length} entries`)

  sendStatus("prefetch", "start", "Parsing Prefetch files")
  const prefetchResults = []
  for (const pfInode of inodes.prefetch.slice(0, 50)) {
    const { stdout: stringsOut } = await sshExec(`sudo icat -o ${offset} "${e01Path}" ${pfInode} 2>/dev/null | strings | head -20`, 30_000)
    let toolName = null
    const match = stringsOut.match(/([A-Z0-9]+)\.EXE/i)
    if (match) toolName = match[1]
    const { stdout: lastRunOut } = await sshExec(`sudo icat -o ${offset} "${e01Path}" ${pfInode} 2>/dev/null | python3 -c "
import sys, struct
data = sys.stdin.buffer.read()
if len(data) < 0x80: sys.exit(0)
if data[0:4] != b'SCCA': sys.exit(0)
version = struct.unpack_from('<I', data, 4)[0]
if version >= 17:
    ft = struct.unpack_from('<Q', data, 0x78)[0]
    epoch = (ft - 116444736000000000) // 10000000
    print(epoch)
"`, 30_000)
    const lastRunEpoch = parseInt(lastRunOut, 10)
    const inWindow = !isNaN(lastRunEpoch) && lastRunEpoch >= windowStartS && lastRunEpoch <= windowEndS
    prefetchResults.push({ inode: pfInode, toolName, lastRunEpoch: lastRunEpoch || null, inWindow, stringsSample: stringsOut.slice(0, 200) })
  }
  await writeJsonRemote(`${outputDir}/prefetch.json`, prefetchResults)
  sendStatus("prefetch", "done", `Prefetch: ${prefetchResults.filter(p => p.inWindow).length} in window`)

  sendStatus("volatility", "start", "Running Volatility plugins")
  async function runVolPlugin(plugin, args = "") {
    const { stdout } = await sshExec(`vol -f "${memoryPath}" ${plugin} ${args} 2>/dev/null`, 300_000)
    return stdout
  }

  // pstree
  const pstreeRaw = await runVolPlugin("windows.pstree")
  const processes = pstreeRaw.split("\n").slice(2).filter(l => l.trim()).map(line => {
    const parts = line.trim().split(/\s+/)
    if (parts.length >= 3) return { pid: parseInt(parts[0], 10), ppid: parseInt(parts[1], 10), name: parts[2] }
    return null
  }).filter(Boolean)
  await writeJsonRemote(`${outputDir}/volatility_pstree.json`, processes)

  // lsass handles
  const lsass = processes.find(p => p.name.toLowerCase() === "lsass.exe")
  let lsassHandles = []
  if (lsass) {
    const handlesRaw = await runVolPlugin("windows.handles", `--pid ${lsass.pid}`)
    const lines = handlesRaw.split("\n").slice(1).filter(l => l.trim())
    lsassHandles = lines.map(l => {
      const parts = l.trim().split(/\s+/)
      return { handle: parts[0], type: parts[1], access: parts[2], name: parts.slice(3).join(" ") }
    })
  }
  await writeJsonRemote(`${outputDir}/volatility_handles_lsass.json`, lsassHandles)

  // high-access handles from non-system processes
  const highAccessHandles = []
  const targetPids = processes.filter(p => p.pid > 4 && p.name !== "lsass.exe").slice(0, 20).map(p => p.pid)
  for (const pid of targetPids) {
    const handlesRaw = await runVolPlugin("windows.handles", `--pid ${pid}`)
    const lines = handlesRaw.split("\n").filter(l => l.includes("0x1410") || l.includes("0x1fffff") || l.includes("0x1f0fff"))
    for (const line of lines) {
      highAccessHandles.push({ pid, processName: processes.find(p => p.pid === pid)?.name, handleInfo: line.trim() })
    }
  }
  await writeJsonRemote(`${outputDir}/volatility_high_access_handles.json`, highAccessHandles)

  // malfind
  const malfindRaw = await runVolPlugin("windows.malfind")
  const malfindEntries = malfindRaw.split("\n").filter(l => l.includes("PAGE_EXECUTE_READWRITE")).slice(0, 200)
  await writeJsonRemote(`${outputDir}/volatility_malfind.json`, malfindEntries)

  // dlllist for suspicious processes
  const suspiciousNames = ["powershell", "rundll32", "procdump", "python"]
  const dllResults = []
  for (const proc of processes.filter(p => suspiciousNames.some(n => p.name.toLowerCase().includes(n)))) {
    const dllRaw = await runVolPlugin("windows.dlllist", `--pid ${proc.pid}`)
    dllResults.push({ pid: proc.pid, processName: proc.name, dlls: dllRaw.split("\n").slice(2, 50) })
  }
  await writeJsonRemote(`${outputDir}/volatility_dlllist.json`, dllResults)
  sendStatus("volatility", "done", "Volatility complete")

  // Manifest
  const manifest = {
    playbook: playbookName,
    attackWindow: { startMs: windowStart, endMs: windowEnd, startUtc: new Date(windowStart).toISOString(), endUtc: new Date(windowEnd).toISOString() },
    ntfsOffset: offset,
    artifactCounts: {
      sysmonEvents: sysmonCount,
      securityEvents: securityCount,
      powershellEvents: powershellCount,
      usnRecords: usnRecords.length,
      mftEntries: mftEntries.length,
      prefetchFiles: prefetchResults.length,
      processes: processes.length,
      highAccessHandles: highAccessHandles.length,
    },
    generatedAt: new Date().toISOString(),
  }
  await writeJsonRemote(`${outputDir}/manifest.json`, manifest)

  sendStatus("complete", "done", `Staging outputs written to ${outputDir}`)
  return { success: true, outputDir, manifest }
}

async function readDirTree(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const result = []
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "bun.lock") continue
    if (entry.isDirectory()) {
      const children = await readDirTree(join(dirPath, entry.name))
      result.push({ name: entry.name, type: "directory", children })
    } else if (!entry.name.endsWith(".sha256")) {
      result.push({ name: entry.name, type: "file" })
    }
  }
  result.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return result
}

export async function listWorkflows() {
  const entries = await readdir(WORKFLOWS_DIR, { withFileTypes: true })
  const workflowDirs = entries.filter(e => e.isDirectory())

  return Promise.all(workflowDirs.map(async (dir) => {
    const basePath = join(WORKFLOWS_DIR, dir.name)
    const files = await readDirTree(basePath)
    try {
      const config = await Bun.file(join(basePath, "opencode.json")).json()
      const agentsContent = await Bun.file(join(basePath, "AGENTS.md")).text()
      return { name: dir.name, config, agentsContent, files }
    } catch {
      return { name: dir.name, config: null, agentsContent: null, files }
    }
  }))
}

export async function readWorkflowFile(_, __, data) {
  const { path } = data.data
  const fullPath = join(WORKFLOWS_DIR, path)
  try {
    const content = await Bun.file(fullPath).text()
    return { content }
  } catch {
    return { content: null }
  }
}

export async function initializeOpencodeSessionFromDocker(_, __, data) {
  const tTotal0 = performance.now()
  const { workflowName } = data.data || {}

  if (!workflowName || typeof workflowName !== "string" || !workflowName.trim()) {
    throw new Error("workflowName is required")
  }

  if (!/^[\w-]+$/.test(workflowName)) {
    throw new Error("workflowName contains invalid characters")
  }

  const workflowDir = join(WORKFLOWS_DIR, workflowName)
  const s = await stat(workflowDir).catch(() => null)
  if (!s || !s.isDirectory()) {
    throw new Error(`Workflow "${workflowName}" not found`)
  }

  const remoteCmd = `kill $(lsof -t -i:3113) 2>/dev/null; cd /home/sift/workflows/${workflowName} && ( setsid opencode serve --port 3113 --hostname 0.0.0.0 < /dev/null > /tmp/opencode-serve.log 2>&1 & ); ok=false; for i in $(seq 1 30); do curl -s --head --max-time 3 http://localhost:3113/provider >/dev/null 2>&1 && { ok=true; break; }; sleep 0.2; done; $ok && echo OK || echo FAIL`

  const tSpawn = performance.now()
  const proc = Bun.spawn([
    "sshpass", "-p", "forensics", "ssh",
    "-p", "2222",
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "ConnectTimeout=10",
    "-n",
    "sift@localhost",
    remoteCmd,
  ], { stdin: "ignore", timeout: 30_000 })

  const stdout = await new Response(proc.stdout).text()
  const trimmed = stdout.trim()
  const stdoutElapsed = performance.now() - tSpawn
  if (trimmed.endsWith("OK")) {
    proc.kill()
    const totalElapsed = performance.now() - tTotal0
    return { success: true, workflow: workflowName, message: "OK" }
  }

  const stderr = await new Response(proc.stderr).text()
  await proc.exited
  const exitCode = proc.exitCode
  const totalElapsed = performance.now() - tTotal0
  throw new Error(`SSH command failed (exit ${exitCode}): ${stderr || stdout}`)
}

export async function listEvidence() {
  let entries
  try {
    entries = await readdir(EVIDENCE_DIR, { withFileTypes: true })
  } catch {
    return []
  }
  const playbookDirs = entries.filter(e => e.isDirectory())

  return Promise.all(playbookDirs.map(async (dir) => {
    const basePath = join(EVIDENCE_DIR, dir.name)
    const files = await readDirTree(basePath)
    return { name: dir.name, config: null, agentsContent: null, files }
  }))
}

export async function getEvidenceFileInfo(_, __, data) {
  const { path } = data.data
  const fullPath = join(EVIDENCE_DIR, path)
  const s = await stat(fullPath).catch(() => null)
  if (!s || !s.isFile()) return { name: null, path, size: null, hash: null, created: null }

  let hash = null
  try {
    hash = `sha256:${(await Bun.file(fullPath + ".sha256").text()).trim()}`
  } catch {}

  let content = null
  if (path.endsWith(".json")) {
    try {
      content = await Bun.file(fullPath).text()
    } catch {}
  }

  return {
    name: basename(path),
    path,
    size: s.size,
    hash,
    created: s.birthtime.toISOString(),
    content,
  }
}

export async function mountEvidenceToSift(_, __, data, ws) {
  let { path, extractInode } = data.data
  const containerPath = `/home/sift/evidence/${path}`

  if (extractInode) {
    const offset = await detectPartitionOffset(containerPath)
    const e01Path = `${containerPath}/disk-image.E01`

    const proc = Bun.spawn([
      "sshpass", "-p", "forensics", "ssh",
      "-p", "2222",
      "-o", "StrictHostKeyChecking=no",
      "-o", "UserKnownHostsFile=/dev/null",
      "-o", "LogLevel=ERROR",
      "-n",
      "sift@localhost",
      `sudo icat -o ${offset} "${e01Path}" ${extractInode}`,
    ], { stdin: "ignore" })

    const buf = await new Response(proc.stdout).arrayBuffer()
    proc.kill()

    if (buf.byteLength === 0) {
      throw new Error(`icat returned empty output for inode ${extractInode}`)
    }

    const base64 = Buffer.from(buf).toString("base64")

    return {
      extractInode,
      sectorOffset: offset,
      size: buf.byteLength,
      data: base64,
    }
  }

  const mountScript = `set -e
echo "=== Analyzing E01 with Sleuth Kit ==="
E01="${containerPath}/disk-image.E01"
echo "E01 path: $E01"

echo ""
echo "=== Partition table (mmls) ==="
sudo mmls "$E01" 2>&1

echo ""
echo "=== Detecting NTFS partition ==="
OFFSET_LINE=$(sudo mmls "$E01" | grep -E 'Basic data|NTFS|ntfs' | sort -k5 -rn | head -1)
if [ -z "$OFFSET_LINE" ]; then
    echo "ERROR: Could not detect filesystem partition"
    exit 1
fi
OFFSET=$(echo "$OFFSET_LINE" | awk '{print $3}')
echo "Detected partition at sector: $OFFSET"
echo "MOUNT_OFFSET:$OFFSET"

echo ""
echo "=== File listing (fls -r -o $OFFSET) ==="
sudo fls -r -o "$OFFSET" "$E01" | head -200
echo "Done."`

  const decoder = new TextDecoder()
  let fullOutput = ""

  const proc = Bun.spawn([
    "sshpass", "-p", "forensics", "ssh",
    "-p", "2222",
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "LogLevel=ERROR",
    "-n",
    "sift@localhost",
    mountScript,
  ], {
    stdin: "ignore",
    terminal: {
      data(_terminal, data) {
        const text = decoder.decode(data)
        fullOutput += text
        if (ws) {
          ws.send(JSON.stringify({ type: "mountEvidenceToSift:stream", text }))
        }
      }
    }
  })

  const exitCode = await proc.exited
  proc.kill()

  if (exitCode !== 0) {
    throw new Error(`Mount failed (exit ${exitCode}): ${fullOutput}`)
  }

  const match = fullOutput.match(/MOUNT_OFFSET:(\d+)/)
  if (match) {
    partitionOffsetCache = parseInt(match[1], 10)
    partitionOffsetCachePath = containerPath
  }

  currentMountedEvidence = path

  return { success: true, output: fullOutput.trim() }
}

let partitionOffsetCache = null
let partitionOffsetCachePath = null

async function detectPartitionOffset(containerPath) {
  if (partitionOffsetCachePath === containerPath && partitionOffsetCache) {
    return partitionOffsetCache
  }

  const e01Path = `${containerPath}/disk-image.E01`
  const proc = Bun.spawn([
    "sshpass", "-p", "forensics", "ssh",
    "-p", "2222",
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "LogLevel=ERROR",
    "-n",
    "sift@localhost",
    `OFFSET_LINE=$(sudo mmls "${e01Path}" | grep -E 'Basic data|NTFS|ntfs' | sort -k5 -rn | head -1); if [ -z "$OFFSET_LINE" ]; then exit 1; fi; echo $(echo "$OFFSET_LINE" | awk '{print $3}')`,
  ], { stdin: "ignore" })

  const raw = (await new Response(proc.stdout).text()).trim()
  proc.kill()
  if (!raw) {
    throw new Error("Could not detect NTFS partition offset. Run mount first.")
  }

  const offset = parseInt(raw, 10)
  if (isNaN(offset)) {
    throw new Error(`Invalid partition offset: ${raw}`)
  }

  partitionOffsetCache = offset
  partitionOffsetCachePath = containerPath
  return offset
}

export async function unmountEvidenceFromSift() {
  currentMountedEvidence = null
  partitionOffsetCache = null
  partitionOffsetCachePath = null
  return { success: true, output: "No kernel mount to clean up — Sleuth Kit reads E01 directly." }
}

export async function checkStagedOutputExists(_, __, data) {
  const { playbookName } = data.data || {}
  if (!playbookName) throw new Error("playbookName is required")
  const { exitCode } = await sshExec(`test -d /home/sift/evidence/${playbookName}/staged && echo "exists" || echo "none"`)
  return { exists: exitCode === 0 }
}

export async function collectEvidence(_, __, data, ws) {
  const { playbookName, vmid, overwrite } = data.data || {}
  const sendStatus = (step, status, message) => {
    if (ws) ws.send(JSON.stringify({ type: "evidenceCollectionStatus", step, status, message }))
  }
  return runEvidenceCollection({ playbookName, vmid, overwrite }, sendStatus)
}

export async function abortEvidenceCollection() {
  abortRunningCollection()
  return { success: true }
}

export async function checkEvidenceExists(_, __, data) {
  const { playbookName } = data.data || {}
  if (!playbookName) throw new Error("playbookName is required")
  const memoryDump = Bun.file(`./evidence/${playbookName}/memory.dump`)
  const diskImage = Bun.file(`./evidence/${playbookName}/disk-image.E01`)
  const exists = await memoryDump.exists() && await diskImage.exists()
  return { exists, playbookName }
}

export async function getMountedEvidence() {
  return currentMountedEvidence
}

export async function listOpencodeModels() {
  try {
    const res = await fetch("http://localhost:3113/provider")
    if (!res.ok) return { models: [], default: null }
    const data = await res.json()
    const provider = (data.all ?? []).find((p) => p.id === "opencode-go")
    if (!provider) return { models: [], default: null }
    const models = Object.values(provider.models ?? {}).map((m) => ({
      id: `${m.providerID}/${m.id}`,
      name: m.name,
    }))
    return { models, default: "opencode-go/deepseek-v4-flash" }
  } catch {
    return { models: [], default: null }
  }
}
