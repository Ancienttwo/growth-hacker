import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const dashboardApiBaseUrl = process.env.DASHBOARD_API_BASE_URL ?? "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src")
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5177,
    proxy: {
      "/api": dashboardApiBaseUrl
    }
  },
  build: {
    outDir: "dist"
  }
});
