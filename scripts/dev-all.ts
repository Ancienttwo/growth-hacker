import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const baseEnv = cleanEnv(process.env);
const apiPort = Number(baseEnv.PORT ?? readConfigPort() ?? 8787);
const dashboardApiBaseUrl = baseEnv.DASHBOARD_API_BASE_URL ?? `http://127.0.0.1:${apiPort}`;

const commands = [
  { name: "server", args: ["--filter", "@growth-hacker/server", "dev"], env: baseEnv },
  { name: "web", args: ["--filter", "@growth-hacker/web", "dev"], env: { ...baseEnv, DASHBOARD_API_BASE_URL: dashboardApiBaseUrl } }
];

const children = commands.map((command) =>
  Bun.spawn([process.execPath, ...command.args], {
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
    env: command.env
  })
);

let stopping = false;

function stopAll(signal: "SIGINT" | "SIGTERM" = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      child.kill(signal);
    } catch {
      // Process may already have exited.
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => stopAll(signal));
}

const exits = children.map(async (child, index) => ({
  name: commands[index].name,
  code: await child.exited
}));

const firstExit = await Promise.race(exits);
stopAll(firstExit.code === 0 ? "SIGTERM" : "SIGINT");
await Promise.allSettled(exits);

process.exit(firstExit.code);

function cleanEnv(input: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(input).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function readConfigPort(): number | undefined {
  const configPath = resolve("growth-hacker.config.json");
  if (!existsSync(configPath)) return undefined;
  const raw = JSON.parse(readFileSync(configPath, "utf8")) as { port?: unknown };
  return typeof raw.port === "number" ? raw.port : undefined;
}
