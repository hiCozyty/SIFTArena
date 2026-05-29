---
component_id: 1.6.5
component_name: Template Management
---

# Template Management

## Component Description

YAML template operations — fetching, building, and destroying VM templates.

---

## Key References:

### /home/cozyty/Projects/shadowProtocol/server/templates.js (lines 58-72)
```
export async function buildTemplates(ludusUrl, apiKey, { templates, parallel }) {
  const host = new URL(ludusUrl).hostname
  await destroyExistingTemplates(host, templates)
  const body = { templates }
  if (parallel !== undefined) body.parallel = parallel

  const response = await fetch(`${ludusUrl}/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || `Ludus API error: ${response.status}`)
  return data
}
```

### /home/cozyty/Projects/shadowProtocol/server/templates.js (lines 16-43)
```
export async function fetchTemplatesWithLog(ludusUrl, apiKey) {
  const templates = await apiGet(ludusUrl, apiKey, "/templates")
  let latestLog = ""
  let logEmpty = true
  try {
    const history = await apiGet(ludusUrl, apiKey, "/templates/logs/history")
    const running = history.find((e) => e.status === "running")
    if (running) {
      const detail = await apiGet(ludusUrl, apiKey, `/templates/logs/history/${running.id}`)
      const allLines = (detail.result ?? "").split("\n")
      const nonEmpty = allLines.filter(l => l.trim())
      logEmpty = nonEmpty.length === 0

      const arrowLines = nonEmpty.filter(l => l.includes("==>"))
      if (arrowLines.length > 0) {
        let line = arrowLines[arrowLines.length - 1]
        line = line.replace(/\u001b\[[0-9;]*m/g, "")
        const match = line.match(/^\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}\s+(.*)/)
        const message = match ? match[1] : line
        const idx = message.indexOf("==>")
        latestLog = message.slice(idx + 3).replace(/^\s+/, "").trim()
      }
    }
  } catch (err) {
    console.error("fetchTemplatesWithLog — error:", err.message)
  }
  return [templates, { latestLog, logEmpty }]
}
```


## Source Files:

- `server/templates.js`

