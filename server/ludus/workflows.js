import { readdir, stat } from "node:fs/promises"
import { join, basename } from "node:path"

const WORKFLOWS_DIR = join(import.meta.dir, "..", "..", "workflows")
const EVIDENCE_DIR = join(import.meta.dir, "..", "..", "evidence")

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
  if (!s || !s.isFile()) return { name: null, path, size: null, hash: null }

  let hash = null
  try {
    hash = `sha256:${(await Bun.file(fullPath + ".sha256").text()).trim()}`
  } catch {}

  return {
    name: basename(path),
    path,
    size: s.size,
    hash,
  }
}

export async function mountEvidenceToSift(_, __, data) {
  const { path } = data.data
  const containerPath = `/home/sift/evidence/${path}`

  const mountScript = `set -e
echo "=== Verifying E01 ==="
ewfverify ${containerPath}/disk-image.E01

echo "=== Creating mount points ==="
mkdir -p /mnt/ewf /mnt/windows

echo "=== Mounting E01 ==="
ewfmount ${containerPath}/disk-image.E01 /mnt/ewf

echo "=== Finding NTFS partition offset ==="
OFFSET_LINE=$(mmls /mnt/ewf/ewf1 | grep -i "NTFS" | head -1 | awk '{print $3}')
if [ -z "$OFFSET_LINE" ]; then
  echo "ERROR: No NTFS partition found in E01 image"
  exit 1
fi
echo "Partition offset: $OFFSET_LINE"

echo "=== Mounting filesystem read-only ==="
mount -o ro,loop,offset=$((${OFFSET_LINE}*512)) /mnt/ewf/ewf1 /mnt/windows
echo "Mounted at /mnt/windows"`

  const proc = Bun.spawn([
    "sshpass", "-p", "forensics", "ssh",
    "-p", "2222",
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "sift@localhost",
    mountScript,
  ])

  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited

  if (exitCode !== 0) {
    throw new Error(`Mount failed (exit ${exitCode}): ${stderr || stdout}`)
  }

  return { success: true, output: stdout.trim(), mountPoint: "/mnt/windows" }
}
