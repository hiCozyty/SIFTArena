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
    console.log("  bun focusedDataTest.js category <credential-access|privilege-escalation>")
    console.log("  bun focusedDataTest.js technique <techniqueId>")
    console.log("  bun focusedDataTest.js count")
    console.log("  bun focusedDataTest.js raw")
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
    }
    ws.close()
  })

  ws.send(JSON.stringify(msg))
}

main().catch(err => {
  console.error("error:", err.message)
  process.exit(1)
})
