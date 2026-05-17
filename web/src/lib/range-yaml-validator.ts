import yaml from "js-yaml"

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0
}

function isString(v: unknown): v is string {
  return typeof v === "string"
}

function isNumber(v: unknown): v is number {
  return typeof v === "number"
}

export function validateRangeYaml(input: string): ValidationResult {
  const errors: string[] = []

  if (!input.trim()) {
    return { valid: false, errors: ["YAML content is empty"] }
  }

  let parsed: unknown
  try {
    parsed = yaml.load(input)
  } catch (e) {
    return { valid: false, errors: [`Invalid YAML syntax: ${(e as Error).message}`] }
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { valid: false, errors: ["Root must be a mapping (object)"] }
  }

  const root = parsed as Record<string, unknown>
  const allowedKeys = ["router", "ludus"]

  for (const key of Object.keys(root)) {
    if (!allowedKeys.includes(key)) {
      errors.push(`Unknown top-level key "${key}". Allowed: ${allowedKeys.join(", ")}`)
    }
  }

  if (root.router !== undefined) {
    if (typeof root.router !== "object" || root.router === null || Array.isArray(root.router)) {
      errors.push('"router" must be a mapping (object)')
    } else {
      const router = root.router as Record<string, unknown>
      const required = ["vm_name", "hostname", "template", "ram_gb", "cpus"]
      for (const field of required) {
        if (!(field in router)) {
          errors.push(`"router" is missing required field "${field}"`)
        }
      }
      if (router.vm_name !== undefined && !isString(router.vm_name)) {
        errors.push('"router.vm_name" must be a string')
      }
      if (router.hostname !== undefined && !isString(router.hostname)) {
        errors.push('"router.hostname" must be a string')
      }
      if (router.template !== undefined && !isString(router.template)) {
        errors.push('"router.template" must be a string')
      }
      if (router.ram_gb !== undefined && !isPositiveInt(router.ram_gb)) {
        errors.push('"router.ram_gb" must be a positive integer')
      }
      if (router.cpus !== undefined && !isPositiveInt(router.cpus)) {
        errors.push('"router.cpus" must be a positive integer')
      }
    }
  }

  if (root.ludus !== undefined) {
    if (!Array.isArray(root.ludus)) {
      errors.push('"ludus" must be an array')
    } else {
      for (let i = 0; i < root.ludus.length; i++) {
        const vm = root.ludus[i]
        const prefix = `ludus[${i}]`
        if (typeof vm !== "object" || vm === null || Array.isArray(vm)) {
          errors.push(`${prefix} must be a mapping (object)`)
          continue
        }
        const vmObj = vm as Record<string, unknown>
        const required = ["vm_name", "hostname", "template", "vlan", "ip_last_octet", "ram_gb", "cpus"]
        for (const field of required) {
          if (!(field in vmObj)) {
            errors.push(`${prefix} is missing required field "${field}"`)
          }
        }
        if (vmObj.vm_name !== undefined && !isString(vmObj.vm_name)) {
          errors.push(`${prefix}.vm_name must be a string`)
        }
        if (vmObj.hostname !== undefined && !isString(vmObj.hostname)) {
          errors.push(`${prefix}.hostname must be a string`)
        }
        if (vmObj.template !== undefined && !isString(vmObj.template)) {
          errors.push(`${prefix}.template must be a string`)
        }
        if (vmObj.vlan !== undefined && !isNumber(vmObj.vlan)) {
          errors.push(`${prefix}.vlan must be a number`)
        }
        if (vmObj.ip_last_octet !== undefined) {
          if (!isNumber(vmObj.ip_last_octet) || !Number.isInteger(vmObj.ip_last_octet) || vmObj.ip_last_octet < 1 || vmObj.ip_last_octet > 254) {
            errors.push(`${prefix}.ip_last_octet must be an integer between 1 and 254`)
          }
        }
        if (vmObj.ram_gb !== undefined && !isPositiveInt(vmObj.ram_gb)) {
          errors.push(`${prefix}.ram_gb must be a positive integer`)
        }
        if (vmObj.cpus !== undefined && !isPositiveInt(vmObj.cpus)) {
          errors.push(`${prefix}.cpus must be a positive integer`)
        }

        if (vmObj.linux !== undefined) {
          if (vmObj.linux !== true) {
            errors.push(`${prefix}.linux must be true when present`)
          }
          if (vmObj.windows !== undefined) {
            errors.push(`${prefix} cannot have both "linux" and "windows"`)
          }
        }
        if (vmObj.windows !== undefined) {
          if (typeof vmObj.windows !== "object" || vmObj.windows === null || Array.isArray(vmObj.windows)) {
            errors.push(`${prefix}.windows must be a mapping (object)`)
          } else {
            const win = vmObj.windows as Record<string, unknown>
            if (win.sysprep !== undefined && typeof win.sysprep !== "boolean") {
              errors.push(`${prefix}.windows.sysprep must be a boolean`)
            }
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

export function isYamlContentEqual(a: string, b: string): boolean {
  try {
    const parsedA = yaml.load(a)
    const parsedB = yaml.load(b)
    if (parsedA === null && parsedB === null) return true
    if (parsedA === null || parsedB === null) return false
    return JSON.stringify(parsedA) === JSON.stringify(parsedB)
  } catch {
    return a.trim() === b.trim()
  }
}
