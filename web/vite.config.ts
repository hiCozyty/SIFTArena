import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  envPrefix: ["VITE_", "LUDUS_"],
  server: {
    // host: "0.0.0.0",
    proxy: {
      "/api/opencode": {
        target: "http://127.0.0.1:3111",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/opencode/, ""),
      },
      "/api/playbook-opencode": {
        target: "http://127.0.0.1:3112",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/playbook-opencode/, ""),
      },
    },
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
