import crypto from "crypto"

const CUSTOM_DIR = "caldera/custom"

function generateId() {
  return crypto.randomUUID()
}

function validateAbility(body) {
  const errors = []
  if (!body.name || typeof body.name !== "string") errors.push("name is required")
  if (!body.tactic || typeof body.tactic !== "string") errors.push("tactic is required")
  if (!body.technique_id || typeof body.technique_id !== "string") errors.push("technique_id is required")
  if (!body.command || typeof body.command !== "string") errors.push("command is required")
  if (body.platform && !["windows", "linux", "darwin"].includes(body.platform)) errors.push("platform must be windows, linux, or darwin")
  if (body.executor && !["psh", "cmd", "sh", "bash"].includes(body.executor)) errors.push("executor must be psh, cmd, sh, or bash")
  if (errors.length) throw new Error(errors.join("; "))
}

const DEFAULT_EXECUTOR = { windows: "psh", linux: "sh", darwin: "sh" }

function buildAbility(body) {
  const abilityId = generateId()
  const platform = body.platform || "windows"
  const executor = body.executor || DEFAULT_EXECUTOR[platform] || "sh"
  return {
    ability_id: abilityId,
    name: body.name,
    description: body.description || "",
    tactic: body.tactic,
    technique_id: body.technique_id,
    technique_name: body.technique_name || "",
    plugin: "",
    source: "user",
    privilege: "",
    repeatable: false,
    singleton: false,
    delete_payload: true,
    requirements: [],
    buckets: [body.tactic],
    additional_info: {},
    access: {},
    executors: [
      {
        name: executor,
        platform,
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

export async function createAbility(ludusUrl, apiKey, data) {
  validateAbility(data)
  const ability = buildAbility(data)
  const filePath = `${CUSTOM_DIR}/${ability.ability_id}.json`
  await Bun.write(filePath, JSON.stringify(ability, null, 2))
  return ability
}

export async function getCustomAbilities(ludusUrl, apiKey, data) {
  const dir = Bun.file(CUSTOM_DIR)
  if (!(await dir.exists())) return { abilities: [], count: 0 }

  const files = []
  for await (const entry of new Bun.Glob("*.json").scan({ cwd: CUSTOM_DIR })) {
    files.push(entry)
  }

  const abilities = await Promise.all(
    files.map(async (f) => {
      const text = await Bun.file(`${CUSTOM_DIR}/${f}`).text()
      const ab = JSON.parse(text)
      return {
        ability_id: ab.ability_id,
        name: ab.name,
        description: ab.description,
        tactic: ab.tactic,
        technique_id: ab.technique_id,
        technique_name: ab.technique_name,
        source: "user",
      }
    })
  )

  if (data?.techniqueId) {
    const filtered = abilities.filter(a => a.technique_id === data.techniqueId)
    return { technique_id: data.techniqueId, count: filtered.length, abilities: filtered }
  }

  return { abilities, count: abilities.length }
}

export async function getCustomAbility(ludusUrl, apiKey, data) {
  if (!data?.abilityId) throw new Error("abilityId is required")
  const filePath = `${CUSTOM_DIR}/${data.abilityId}.json`
  const file = Bun.file(filePath)
  if (!(await file.exists())) throw new Error(`Custom ability "${data.abilityId}" not found`)
  const text = await file.text()
  return JSON.parse(text)
}
