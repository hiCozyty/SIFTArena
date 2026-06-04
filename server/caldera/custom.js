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
  const abilityId = body.ability_id || generateId()
  return {
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
}

export async function createAbility(data) {
  validateAbility(data)
  const ability = buildAbility(data)
  const res = await fetch(`${CALDERA_URL}/api/v2/abilities`, {
    method: "POST",
    headers: { "KEY": CALDERA_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(ability),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Caldera API error (${res.status}): ${text}`)
  }
  return await res.json()
}
