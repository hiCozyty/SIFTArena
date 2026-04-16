import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api/nvidia": {
        target: "https://integrate.api.nvidia.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/nvidia/, "/v1"),
      },
    },
  },
})
