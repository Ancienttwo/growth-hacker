import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { createWebViteConfig } from "./vite.shared";

const dashboardApiBaseUrl = process.env.DASHBOARD_API_BASE_URL ?? "http://127.0.0.1:8787";
const webRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig(
  createWebViteConfig({
    apiBaseUrl: dashboardApiBaseUrl,
    plugins: [react(), tailwindcss()],
    rootDir: webRoot
  })
);
