import { test, expect } from "bun:test"
import { listSnapshots } from "../range.js"

function mockLudusServer() {
  return Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)

      if (url.pathname === "/range") {
        return new Response(JSON.stringify({
          VMs: [
            { name: "ty-attacker-kali", proxmoxID: 104 },
            { name: "ty-win11-22h2", proxmoxID: 105 },
            { name: "ty-router", proxmoxID: 101 },
          ],
        }))
      }

      if (url.pathname === "/snapshots/list") {
        const vmids = url.searchParams.get("vmids")
        return new Response(JSON.stringify({
          snapshots: [
            { name: "base-clean" },
            { name: "current", parent: "base-clean" },
          ],
        }))
      }

      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
    },
  })
}

test("listSnapshots batch mode returns proxmoxID for each VM", async () => {
  const server = mockLudusServer()
  const result = await listSnapshots(`http://localhost:${server.port}`, "test-key", {})

  expect(typeof result).toBe("object")
  expect(result).not.toBeNull()

  const entries = Object.entries(result)
  expect(entries.length).toBe(3)

  for (const [name, info] of entries) {
    expect(info).toHaveProperty("vm")
    expect(info).toHaveProperty("proxmoxID")
    expect(info).toHaveProperty("snapshots")
    expect(typeof info.proxmoxID).toBe("number")
    expect(Array.isArray(info.snapshots)).toBe(true)
  }

  expect(result["ty-attacker-kali"].proxmoxID).toBe(104)
  expect(result["ty-win11-22h2"].proxmoxID).toBe(105)
  expect(result["ty-router"].proxmoxID).toBe(101)

  expect(result["ty-attacker-kali"].snapshots.length).toBe(2)
  expect(result["ty-attacker-kali"].snapshots[0].name).toBe("base-clean")

  server.stop()
})

test("listSnapshots batch mode handles snapshot fetch failure gracefully", async () => {
  let requestCount = 0

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)

      if (url.pathname === "/range") {
        return new Response(JSON.stringify({
          VMs: [
            { name: "ty-broken-vm", proxmoxID: 999 },
          ],
        }))
      }

      if (url.pathname === "/snapshots/list") {
        return new Response("internal server error", { status: 500 })
      }

      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 })
    },
  })

  const result = await listSnapshots(`http://localhost:${server.port}`, "test-key", {})

  expect(result["ty-broken-vm"]).toBeDefined()
  expect(result["ty-broken-vm"].proxmoxID).toBe(999)
  expect(result["ty-broken-vm"].snapshots).toEqual([])

  server.stop()
})
