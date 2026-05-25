const PORT = process.env.BUN_SERVER_PORT
const WS_URL = `ws://localhost:${PORT}`

function connect() {
  return new Promise((resolve, reject) => {
    console.log(`Connecting to ${WS_URL}...`)
    const ws = new WebSocket(WS_URL)
    ws.addEventListener("open", () => {
      console.log("WebSocket connected")
      resolve(ws)
    })
    ws.addEventListener("error", (e) => {
      console.error("WebSocket error event:", e.message ?? "no message")
      reject(new Error("connection failed"))
    })
    setTimeout(() => reject(new Error("connect timeout")), 5000)
  })
}

async function main() {
  const cmd = Bun.argv[2]
  if (!cmd || cmd === "help") {
    console.log("Usage:")
    console.log("  bun focusedDataTest.js overview")
    console.log("  bun focusedDataTest.js category <category>")
    console.log("  bun focusedDataTest.js technique <techniqueId>")
    console.log("  bun focusedDataTest.js ability <techniqueId>")
    console.log("  bun focusedDataTest.js count")
    console.log("  bun focusedDataTest.js raw")
    console.log("  bun focusedDataTest.js enriched")
    process.exit(0)
  }

  const ws = await connect()
  ws.addEventListener("close", (e) => console.log(`WebSocket closed: code=${e.code} reason="${e.reason}"`))
  ws.addEventListener("error", (e) => console.error("WebSocket error during session:", e.message ?? "no message"))

  const msg = { type: "getFocusedCategoriesAndTechniques" }
  ws.addEventListener("message", (e) => {
    const data = JSON.parse(e.data)
    if (data.type === "connected") return
    if (data.error) {
      console.error("error:", data.error)
      ws.close()
      return
    }
    const result = data.result
    switch (cmd) {
      case "overview": {
        console.log(`Categories: ${result.categories.join(", ")}\n`)
        for (const cat of result.categories) {
          const techs = Object.keys(result.techniques[cat])
          console.log(`${cat} (${techs.length} techniques):`)
          for (const tid of techs) {
            const t = result.techniques[cat][tid]
            console.log(`  ${tid} - ${t.technique_name} (${t.abilities.length} abilities)`)
          }
          console.log()
        }
        break
      }
      case "category": {
        const cat = Bun.argv[3]
        const techs = result.techniques[cat]
        if (!techs) { console.error(`Unknown category: ${cat}`); break }
        console.log(`${cat} (${Object.keys(techs).length} techniques):`)
        for (const [tid, t] of Object.entries(techs)) {
          console.log(`  ${tid} - ${t.technique_name} (${t.abilities.length} abilities)`)
        }
        break
      }
      case "technique": {
        const tid = Bun.argv[3]
        for (const cat of result.categories) {
          const t = result.techniques[cat]?.[tid]
          if (t) {
            console.log(`${tid} - ${t.technique_name} (${cat})`)
            console.log(`  ${t.abilities.length} abilities:`)
            for (const a of t.abilities) {
              const executors = a.executors.map(e => `${e.name}(${e.platform})`).join(", ")
              console.log(`    ${a.ability_id} | ${a.name} | [${executors}]`)
            }
            break
          }
        }
        break
      }
      case "ability": {
        const tid2 = Bun.argv[3]
        let found = false
        for (const cat of result.categories) {
          const t = result.techniques[cat]?.[tid2]
          if (t) {
            found = true
            console.log(`${tid2} - ${t.technique_name} (${cat})`)
            console.log(`  ${t.abilities.length} abilities:`)
            for (const a of t.abilities) {
              console.log(`\n  === ${a.name} ===`)
              console.log(`  ID: ${a.ability_id}`)
              console.log(`  Plugin: ${a.plugin}`)
              for (const e of a.executors) {
                console.log(`  Executor: ${e.name} (${e.platform})`)
                console.log(`  Command: ${e.command}`)
                if (e.payloads?.length) console.log(`  Payloads: ${e.payloads.join(", ")}`)
                if (e.cleanup?.length) console.log(`  Cleanup: ${e.cleanup.join("; ")}`)
                console.log(`  Timeout: ${e.timeout}s`)
              }
            }
            break
          }
        }
        if (!found) console.error(`Technique "${tid2}" not found`)
        break
      }
      case "count": {
        let total = 0
        for (const cat of result.categories) {
          const techs = Object.keys(result.techniques[cat])
          let abCount = 0
          for (const t of Object.values(result.techniques[cat])) {
            abCount += t.abilities.length
          }
          total += abCount
          console.log(`${cat}: ${techs.length} techniques, ${abCount} abilities`)
        }
        console.log(`Total: ${result.categories.length} categories, ${total} abilities`)
        break
      }
      case "raw":
        console.log(JSON.stringify(result, null, 2))
        break
      case "enriched": {
        let total = 0
        let enriched = 0
        let notNeeded = 0
        for (const cat of result.categories) {
          const techs = result.techniques[cat]
          if (!techs) continue
          for (const [tid, t] of Object.entries(techs)) {
            console.log(`\n${tid} - ${t.technique_name}`)
            for (const a of t.abilities) {
              total++
              if (a.download_instructions) {
                enriched++
                const payloadLine = a.download_instructions.split("\n").find(l => l.startsWith("Payload:"))
                console.log(`  ENRICHED | ${a.ability_id.slice(0, 8)} | ${a.name} | ${payloadLine || "unknown"}`)
              } else {
                notNeeded++
                const hasPayloads = a.executors?.some(e => (e.payloads || []).length > 0)
                const reason = hasPayloads ? `has payloads: ${a.executors.find(e => e.payloads.length).payloads.join(", ")}` : "no PathToAtomicsFolder reference"
                console.log(`  OK       | ${a.ability_id.slice(0, 8)} | ${a.name} | ${reason}`)
              }
            }
          }
        }
        console.log(`\n=== Summary ===`)
        console.log(`Total abilities: ${total}`)
        console.log(`Enriched: ${enriched}`)
        console.log(`No enrichment needed: ${notNeeded}`)
        break
      }
    }
    ws.close()
  })

  ws.send(JSON.stringify(msg))
}

main().catch(err => {
  console.error("error:", err.message)
  process.exit(1)
})
