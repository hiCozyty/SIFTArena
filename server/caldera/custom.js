import crypto from "crypto"

const TACTIC = "credential-access"
const TECHNIQUE_ID = "T1003.001"
const TECHNIQUE_NAME = "OS Credential Dumping: LSASS Memory"
const CALDERA_URL = "http://10.1.99.1:8888"
const CALDERA_KEY = "ADMIN123"

function generateId() {
  return crypto.randomUUID()
}

function validateAbility(body) {
  const errors = []
  if (!body.name || typeof body.name !== "string") errors.push("name is required")
  if (!body.command || typeof body.command !== "string") errors.push("command is required")
  if (errors.length) throw new Error(errors.join("; "))
}

export function buildAbility(body) {
  console.log("[custom] buildAbility called with:", { name: body.name, command: body.command })
  const abilityId = body.ability_id || generateId()
  const ability = {
    ability_id: abilityId,
    name: body.name,
    description: body.description || "",
    tactic: TACTIC,
    technique_id: TECHNIQUE_ID,
    technique_name: TECHNIQUE_NAME,
    plugin: "",
    source: "user",
    privilege: "",
    repeatable: false,
    singleton: false,
    delete_payload: true,
    requirements: [],
    buckets: [TACTIC],
    additional_info: {},
    access: {},
    executors: [
      {
        name: "psh",
        platform: "windows",
        command: body.command,
        code: null,
        language: null,
        build_target: null,
        payloads: [],
        uploads: [],
        timeout: 60,
        parsers: [],
        cleanup: [],
        variations: [],
        additional_info: {},
      },
    ],
  }
  console.log("[custom] buildAbility output:", JSON.stringify(ability))
  return ability
}

export async function deleteAbility(abilityId) {
  console.log("[custom] DELETE from Caldera:", `${CALDERA_URL}/api/v2/abilities/${abilityId}`)
  const res = await fetch(`${CALDERA_URL}/api/v2/abilities/${abilityId}`, {
    method: "DELETE",
    headers: { "KEY": CALDERA_KEY },
  })
  console.log("[custom] Caldera DELETE response status:", res.status)
  if (!res.ok && res.status !== 404) {
    const text = await res.text()
    throw new Error(`Caldera DELETE failed (${res.status}): ${text}`)
  }
  return res
}

export async function createAbility(data) {
  console.log("[custom] createAbility called with:", { name: data.name, command: data.command })
  validateAbility(data)
  const ability = buildAbility(data)
  console.log("[custom] POSTing to Caldera:", `${CALDERA_URL}/api/v2/abilities`)
  const res = await fetch(`${CALDERA_URL}/api/v2/abilities`, {
    method: "POST",
    headers: { "KEY": CALDERA_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(ability),
  })
  const resBody = await res.json()
  console.log("[custom] Caldera response status:", res.status)
  console.log("[custom] Caldera response body:", JSON.stringify(resBody))
  if (!res.ok) {
    throw new Error(`Caldera API error (${res.status}): ${JSON.stringify(resBody)}`)
  }
  return resBody
}
