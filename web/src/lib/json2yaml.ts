export function vmDefsToYaml(obj: Record<string, Record<string, unknown>>): string {
  const lines: string[] = []

  function formatValue(val: unknown, indent: number): string[] {
    const prefix = "  ".repeat(indent)
    const result: string[] = []
    if (val === null || val === undefined) {
      result.push(prefix + "null")
    } else if (typeof val === "boolean" || typeof val === "number") {
      result.push(prefix + String(val))
    } else if (typeof val === "string") {
      result.push(prefix + val)
    } else if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === "object" && item !== null) {
          const entries = Object.entries(item)
          if (entries.length > 0) {
            const [firstKey, firstVal] = entries[0]
            result.push(prefix + "- " + firstKey + ": " + formatInline(firstVal))
            for (const [k, v] of entries.slice(1)) {
              result.push(prefix + "  " + k + ": " + formatInline(v))
            }
          } else {
            result.push(prefix + "- {}")
          }
        } else {
          result.push(prefix + "- " + String(item))
        }
      }
    } else if (typeof val === "object") {
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        if (typeof v === "object" && v !== null && !Array.isArray(v)) {
          result.push(prefix + k + ":")
          result.push(...formatValue(v, indent + 1))
        } else {
          result.push(prefix + k + ": " + formatInline(v))
        }
      }
    }
    return result
  }

  function formatInline(val: unknown): string {
    if (val === null || val === undefined) return "null"
    if (typeof val === "boolean" || typeof val === "number") return String(val)
    if (typeof val === "string") return val.includes("{{") ? JSON.stringify(val) : val
    if (typeof val === "object" && !Array.isArray(val)) {
      const entries = Object.entries(val as Record<string, unknown>)
      if (entries.length === 0) return "{}"
      const parts = entries.map(([k, v]) => k + ": " + formatInline(v))
      return parts.join(", ")
    }
    return String(val)
  }

  if (obj.router) {
    lines.push("router:")
    const routerEntries = Object.entries(obj.router)
    const vmNameEntry = routerEntries.find(([k]) => k === "vm_name")
    const hostnameEntry = routerEntries.find(([k]) => k === "hostname")
    const otherEntries = routerEntries.filter(([k]) => k !== "vm_name" && k !== "hostname")
    if (vmNameEntry) {
      lines.push("  " + vmNameEntry[0] + ": " + formatInline(vmNameEntry[1]))
    } else {
      lines.push("  vm_name: \"{{ range_id }}-router-debian11-x64\"")
    }
    if (hostnameEntry) {
      lines.push("  " + hostnameEntry[0] + ": " + formatInline(hostnameEntry[1]))
    }
    for (const [k, v] of otherEntries) {
      if (typeof v === "object" && v !== null && !Array.isArray(v)) {
        lines.push("  " + k + ":")
        for (const [nk, nv] of Object.entries(v as Record<string, unknown>)) {
          lines.push("    " + nk + ": " + formatInline(nv))
        }
      } else {
        lines.push("  " + k + ": " + formatInline(v))
      }
    }
  }

  const ludusEntries = Object.entries(obj).filter(([key]) => key !== "router")
  if (ludusEntries.length > 0) {
    lines.push("ludus:")
    for (const [key, vmDef] of ludusEntries) {
      const entries = Object.entries(vmDef)
      const hostnameEntry = entries.find(([k]) => k === "hostname")
      const otherEntries = entries.filter(([k]) => k !== "hostname")
      lines.push("  - vm_name: \"{{ range_id }}-" + key + "\"")
      if (hostnameEntry) {
        lines.push("    " + hostnameEntry[0] + ": " + formatInline(hostnameEntry[1]))
      }
      for (const [k, v] of otherEntries) {
        if (typeof v === "object" && v !== null && !Array.isArray(v)) {
          lines.push("    " + k + ":")
          for (const [nk, nv] of Object.entries(v as Record<string, unknown>)) {
            lines.push("      " + nk + ": " + formatInline(nv))
          }
        } else {
          lines.push("    " + k + ": " + formatInline(v))
        }
      }
    }
  }

  return lines.join("\n")
}
