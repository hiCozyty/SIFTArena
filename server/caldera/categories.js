import { FOCUS_CATEGORIES, FOCUS_TECHNIQUES } from "./focus.js"
import focusedTechniques from "./focusedTechniques.json"
import { getCustomAbilities } from "./customAbilities.js"

export async function fetchCalderaCategories() {
  return {
    categories: FOCUS_CATEGORIES,
    techniques: FOCUS_TECHNIQUES,
    count: FOCUS_CATEGORIES.length,
  }
}

export async function fetchFocusedCategoriesAndTechniques() {
  const result = structuredClone(focusedTechniques)
  for (const cat of result.categories) {
    const catTechs = result.techniques[cat]
    if (!catTechs) continue
    for (const tid of Object.keys(catTechs)) {
      const seen = new Set()
      catTechs[tid].abilities = catTechs[tid].abilities.filter((ab) => {
        if (seen.has(ab.ability_id)) return false
        seen.add(ab.ability_id)
        return true
      })
      for (const ab of catTechs[tid].abilities) {
        ab.custom = false
      }
    }
  }

  const jsonAbilityIds = result.techniques["credential-access"]?.["T1003.001"]?.abilities?.map(a => a.ability_id) ?? []
  const customAbilities = getCustomAbilities()
  if (customAbilities.length > 0 && result.techniques["credential-access"]?.["T1003.001"]) {
    const existingIds = new Set(result.techniques["credential-access"]["T1003.001"].abilities.map(a => a.ability_id))
    for (const ab of customAbilities) {
      if (!existingIds.has(ab.ability_id)) {
        result.techniques["credential-access"]["T1003.001"].abilities.push(ab)
      }
    }
  }

  const merged = result.techniques["credential-access"]?.["T1003.001"]?.abilities ?? []
  return result
}
