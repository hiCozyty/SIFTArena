import { readdir } from "node:fs/promises"
import { join } from "node:path"

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
