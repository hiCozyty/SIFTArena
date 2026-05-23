import { FOCUS_CATEGORIES, FOCUS_TECHNIQUES } from "./focus.js"
import focusedTechniques from "./focusedTechniques.json"

export async function fetchCalderaCategories() {
  return {
    categories: FOCUS_CATEGORIES,
    techniques: FOCUS_TECHNIQUES,
    count: FOCUS_CATEGORIES.length,
  }
}

export async function fetchFocusedCategoriesAndTechniques() {
  const result = { ...focusedTechniques }
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
    }
  }
  return result
}
