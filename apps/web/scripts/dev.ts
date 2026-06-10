import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createWebViteConfig } from "../vite.shared";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = dirname(scriptDir);
const apiBaseUrl = process.env.DASHBOARD_API_BASE_URL ?? "http://127.0.0.1:8787";
const host = process.env.VITE_HOST ?? "127.0.0.1";
const port = readPort(process.env.VITE_PORT, 5177);

const dependencyStart = performance.now();
console.log("[web] Loading Vite dev dependencies...");

const [{ createServer }, { default: react }, { default: tailwindcss }] = await Promise.all([
  import("vite"),
  import("@vitejs/plugin-react"),
  import("@tailwindcss/vite")
]);

console.log(`[web] Loaded Vite dev dependencies in ${formatDuration(performance.now() - dependencyStart)}.`);

const serverStart = performance.now();
const server = await createServer({
  ...createWebViteConfig({
    apiBaseUrl,
    host,
    plugins: [react(), tailwindcss()],
    port,
    rootDir: webRoot
  }),
  clearScreen: false,
  configFile: false
});

await server.listen();
console.log(`[web] Vite dev server ready in ${formatDuration(performance.now() - serverStart)}.`);
server.printUrls();
server.bindCLIShortcuts({ print: true });

let closing = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void closeServer(signal);
  });
}

async function closeServer(signal: "SIGINT" | "SIGTERM") {
  if (closing) return;
  closing = true;
  try {
    await server.close();
  } finally {
    process.exit(signal === "SIGINT" ? 130 : 143);
  }
}

function readPort(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}

function formatDuration(milliseconds: number): string {
  return milliseconds >= 1000 ? `${(milliseconds / 1000).toFixed(1)}s` : `${Math.round(milliseconds)}ms`;
}
