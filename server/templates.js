async function apiGet(ludusUrl, apiKey, path) {
  const response = await fetch(`${ludusUrl}${path}`, {
    headers: { "X-API-KEY": apiKey },
  })
  if (!response.ok) throw new Error(`Ludus API error: ${response.status}`)
  return await response.json()
}

export async function fetchTemplates(ludusUrl, apiKey) {
  return apiGet(ludusUrl, apiKey, "/templates")
}

export async function fetchTemplatesStatus(ludusUrl, apiKey) {
  return apiGet(ludusUrl, apiKey, "/templates/status")
}

export async function buildTemplates(ludusUrl, apiKey, { templates, parallel }) {
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
