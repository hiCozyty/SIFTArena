Bun.serve({
  hostname: "0.0.0.0",
  port: 8050,
  fetch(req) {
    return new Response("Hello from port 8050.")
  },
})
console.log("Test server on http://0.0.0.0:8050")
