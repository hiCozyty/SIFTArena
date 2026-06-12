import { readdir, stat } from "node:fs/promises"
import { join, basename } from "node:path"
import { collectEvidence as runEvidenceCollection } from "../benchmark/evidenceCollection.js"

const WORKFLOWS_DIR = join(import.meta.dir, "..", "..", "workflows")
const EVIDENCE_DIR = join(import.meta.dir, "..", "..", "evidence")

let currentMountedEvidence = null

async function readDirTree(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const result = []
  for (const entry of entries) {
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

  const remoteCmd = `kill $(lsof -t -i:3113) 2>/dev/null; cd /home/sift/workflows/${workflowName} && nohup opencode serve --port 3113 --hostname 0.0.0.0 > /tmp/opencode-serve.log 2>&1 & sleep 1 && echo OK`

  const proc = Bun.spawn([
    "sshpass", "-p", "forensics", "ssh",
    "-p", "2222",
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "sift@localhost",
    remoteCmd,
  ])

  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited

  if (exitCode !== 0) {
    throw new Error(`SSH command failed (exit ${exitCode}): ${stderr || stdout}`)
  }

  const trimmed = stdout.trim()
  if (!trimmed.endsWith("OK")) {
    throw new Error(`Unexpected response from opencode serve: ${trimmed}`)
  }

  return { success: true, workflow: workflowName, message: "OK" }
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

  return {
    name: basename(path),
    path,
    size: s.size,
    hash,
    created: s.birthtime.toISOString(),
  }
}

export async function mountEvidenceToSift(_, __, data, ws) {
  let { path, extractInode } = data.data
  const containerPath = `/home/sift/evidence/${path}`

  if (extractInode) {
    console.log(`[mountEvidenceToSift] extractInode ${extractInode} for ${path}`)
    const offset = await detectPartitionOffset(containerPath)
    const e01Path = `${containerPath}/disk-image.E01`

    const proc = Bun.spawn([
      "sshpass", "-p", "forensics", "ssh",
      "-p", "2222",
      "-o", "StrictHostKeyChecking=no",
      "-o", "UserKnownHostsFile=/dev/null",
      "-o", "LogLevel=ERROR",
      "sift@localhost",
      `sudo icat -o ${offset} "${e01Path}" ${extractInode}`,
    ])

    const buf = await new Response(proc.stdout).arrayBuffer()
    const exitCode = await proc.exited

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      throw new Error(`icat failed (exit ${exitCode}): ${stderr}`)
    }

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

  console.log("[mountEvidenceToSift] Starting Sleuth Kit analysis for path:", path)

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
    "sift@localhost",
    mountScript,
  ], {
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
  console.log("[detectPartitionOffset] Detecting for:", containerPath)

  const proc = Bun.spawn([
    "sshpass", "-p", "forensics", "ssh",
    "-p", "2222",
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "LogLevel=ERROR",
    "sift@localhost",
    `OFFSET_LINE=$(sudo mmls "${e01Path}" | grep -E 'Basic data|NTFS|ntfs' | sort -k5 -rn | head -1); if [ -z "$OFFSET_LINE" ]; then exit 1; fi; echo $(echo "$OFFSET_LINE" | awk '{print $3}')`,
  ])

  const raw = (await new Response(proc.stdout).text()).trim()
  const exitCode = await proc.exited
  if (exitCode !== 0 || !raw) {
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

export async function collectEvidence(_, __, data) {
  const { playbookName, vmid, overwrite } = data.data || {}
  return runEvidenceCollection({ playbookName, vmid, overwrite })
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
