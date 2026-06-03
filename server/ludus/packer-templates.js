import { $ } from "bun"

const SHARED_DIRS = new Set(["ansible", "common", "scripts"])

const DIR_TO_TEMPLATE = {
  kali: "kali-x64-desktop-template",
  debian11: "debian-11-x64-server-template",
  debian12: "debian-12-x64-server-template",
  "win11-22h2-x64-enterprise": "win11-22h2-x64-enterprise-template",
  "win2022-server-x64": "win2022-server-x64-template",
}

export async function fetchPackerTemplates(ludusUrl) {
  const host = new URL(ludusUrl).hostname

  const raw = await $`ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 root@${host} 'for d in /opt/ludus/packer/*/; do dirname=$(basename "$d"); echo "---DIR--- $dirname"; find "$d" -maxdepth 1 -type f | while read -r f; do echo "---FILE--- $(basename "$f")"; cat "$f"; done; done'`.quiet().text()

  const templates = []
  const blocks = raw.split("---DIR---").filter(Boolean)

  for (const block of blocks) {
    const lines = block.trim().split("\n")
    const dirname = lines[0].trim()
    if (SHARED_DIRS.has(dirname)) continue

    const templateName = DIR_TO_TEMPLATE[dirname]
    const files = []
    let currentFile = null
    let contentLines = []

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]
      const match = line.match(/^---FILE--- (.+)$/)
      if (match) {
        if (currentFile) {
          files.push({ name: currentFile, content: contentLines.join("\n").trimEnd() })
        }
        currentFile = match[1]
        contentLines = []
      } else if (currentFile) {
        contentLines.push(line)
      }
    }
    if (currentFile) {
      files.push({ name: currentFile, content: contentLines.join("\n").trimEnd() })
    }

    templates.push({ dirname, templateName: templateName ?? dirname, files })
  }

  return templates
}
