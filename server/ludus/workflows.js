import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { getContainerBackend } from "./container-backends.js"

const WORKFLOWS_DIR = join(import.meta.dir, "..", "workflows")

async function readDirTree(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const result = []
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const children = await readDirTree(join(dirPath, entry.name))
      result.push({ name: entry.name, type: "directory", children })
    } else {
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

export async function verifyWorkflowMcpTool(_, __, data) {
  const { workflowName } = data.data
  if (!workflowName) throw new Error("workflowName is required")
  if (!/^[\w-]+$/.test(workflowName)) throw new Error("workflowName contains invalid characters")

  try {
    const stats = await stat(join(WORKFLOWS_DIR, workflowName))
    if (!stats.isDirectory()) throw new Error(`"${workflowName}" is not a directory`)
  } catch (err) {
    if (err.code === "ENOENT") throw new Error(`Workflow "${workflowName}" not found`)
    throw err
  }

  const backend = getContainerBackend("sift")
  if (!backend) throw new Error("SIFT container backend not found")

  const jrpcMsgs = [
    '{"jsonrpc":"2.0","method":"tools/list","id":1}',
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"my_tool","arguments":{"input":"test-mcp"}},"id":2}',
  ]
  const remoteCmd = [
    `cd /home/sift/workflows/${workflowName}`,
    `printf '${jrpcMsgs[0]}\\n${jrpcMsgs[1]}\\n'`,
    `timeout 10 bun run ./customMCP/index.ts 2>/dev/null`,
  ].join(" | ")

  const cmd = [
    "sshpass", "-p", backend.sshPass,
    "ssh",
    "-p", String(backend.sshPort),
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "ConnectTimeout=5",
    `${backend.sshUser}@${backend.sshHost}`,
    remoteCmd,
  ]

  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const exitCode = await proc.exited

  if (exitCode !== 0) {
    throw new Error(`MCP tool verification failed: ${stderr.trim() || stdout.trim()}`)
  }

  const lines = stdout.trim().split("\n").filter(Boolean).map(l => {
    try { return JSON.parse(l) } catch { return null }
  }).filter(Boolean)

  const callResponse = lines.find(l => l.id === 2)
  if (!callResponse) throw new Error("No tools/call response received")
  if (callResponse.error) {
    throw new Error(`Tool call failed: ${callResponse.error.message || JSON.stringify(callResponse.error)}`)
  }

  const toolResult = callResponse.result?.content?.[0]?.text || ""
  return { success: true, workflow: workflowName, tool: "my_tool", result: toolResult }
}

export async function initializeOpencodeSessionFromDocker(_, __, data) {
  const { workflowName } = data.data
  if (!workflowName) throw new Error("workflowName is required")
  if (!/^[\w-]+$/.test(workflowName)) throw new Error("workflowName contains invalid characters")

  try {
    const stats = await stat(join(WORKFLOWS_DIR, workflowName))
    if (!stats.isDirectory()) throw new Error(`"${workflowName}" is not a directory`)
  } catch (err) {
    if (err.code === "ENOENT") throw new Error(`Workflow "${workflowName}" not found`)
    throw err
  }

  const backend = getContainerBackend("sift")
  if (!backend) throw new Error("SIFT container backend not found")

  const cmd = [
    "sshpass", "-p", backend.sshPass,
    "ssh",
    "-p", String(backend.sshPort),
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "ConnectTimeout=5",
    `${backend.sshUser}@${backend.sshHost}`,
    `kill $(lsof -t -i:3113) 2>/dev/null; cd /home/sift/workflows/${workflowName} && nohup opencode serve --port 3113 --hostname 0.0.0.0 > /tmp/opencode-serve.log 2>&1 & sleep 1 && echo OK`,
  ]

  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const exitCode = await proc.exited

  if (exitCode !== 0) {
    throw new Error(`Failed to start opencode session: ${stderr.trim() || stdout.trim()}`)
  }

  return { success: true, workflow: workflowName, message: stdout.trim() }
}
