#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { spawnSync } from "child_process";

type Format = "json" | "text";
type Zone = "green" | "yellow" | "orange" | "red" | "unknown";
type Source = "rollout-token-count" | "state-db-token-total" | "tool-call-count" | "unavailable";

type Args = {
  cwd: string;
  codexHome: string;
  format: Format;
  sessionId: string;
  transcriptPath: string;
  toolCount: number | null;
  writeStatus: boolean;
};

type ThreadInfo = {
  id: string;
  cwd: string;
  title: string;
  tokens_used: number;
  git_branch: string;
  rollout_path: string;
  updated_at_ms: number;
  first_user_message: string;
  model: string;
  reasoning_effort: string;
};

type BudgetPolicy = {
  yellow: number;
  orange: number;
  red: number;
  statusFile: string;
  fallbackWindows: Record<string, number>;
  fallbackToolCalls: {
    yellow: number;
    orange: number;
    red: number;
  };
};

type BudgetResult = {
  cwd: string;
  codexHome: string;
  sessionId: string;
  threadId: string;
  model: string;
  reasoningEffort: string;
  source: Source;
  zone: Zone;
  usageTokens: number | null;
  contextWindow: number | null;
  usedPercent: number | null;
  remainingPercent: number | null;
  estimated: boolean;
  rolloutPath: string;
  statusFile: string;
  message: string;
  handoffRecommended: boolean;
  stopRecommended: boolean;
  thresholds: {
    yellow: number;
    orange: number;
    red: number;
  };
};

const DEFAULT_WINDOWS: Record<string, number> = {
  "gpt-5.4": 1_050_000,
  "gpt-5.5": 258_000,
};

function usage(): never {
  console.error(
    [
      "Usage: scripts/context-budget.ts [--format json|text] [--cwd <repo>] [--codex-home <dir>]",
      "       [--session-id <id>] [--transcript-path <path>] [--tool-count <n>] [--write-status]",
    ].join("\n")
  );
  process.exit(2);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    cwd: process.cwd(),
    codexHome: process.env.CODEX_HOME || join(homedir(), ".codex"),
    format: "text",
    sessionId: process.env.CODEX_SESSION_ID || process.env.CLAUDE_SESSION_ID || "",
    transcriptPath: process.env.CODEX_TRANSCRIPT_PATH || process.env.CLAUDE_TRANSCRIPT_PATH || "",
    toolCount: null,
    writeStatus: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--format": {
        const value = argv[++i] as Format | undefined;
        if (value !== "json" && value !== "text") usage();
        args.format = value;
        break;
      }
      case "--cwd":
        args.cwd = argv[++i] || usage();
        break;
      case "--codex-home":
        args.codexHome = argv[++i] || usage();
        break;
      case "--session-id":
        args.sessionId = argv[++i] || "";
        break;
      case "--transcript-path":
        args.transcriptPath = argv[++i] || "";
        break;
      case "--tool-count": {
        const value = Number(argv[++i]);
        if (!Number.isFinite(value) || value < 0) usage();
        args.toolCount = value;
        break;
      }
      case "--write-status":
        args.writeStatus = true;
        break;
      case "--help":
      case "-h":
        usage();
        break;
      default:
        usage();
    }
  }

  args.cwd = resolve(args.cwd);
  args.codexHome = resolve(args.codexHome.replace(/^~(?=$|\/)/, homedir()));
  args.transcriptPath = args.transcriptPath ? resolve(args.transcriptPath.replace(/^~(?=$|\/)/, homedir())) : "";
  return args;
}

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function valueAt(input: unknown, path: string): unknown {
  let current = input;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object" || !(part in current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function numberAt(input: unknown, path: string): number | null {
  const value = valueAt(input, path);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringAt(input: unknown, path: string): string {
  const value = valueAt(input, path);
  return typeof value === "string" ? value : "";
}

function safeRelativePath(value: string, fallback: string, allowedPrefix = ""): string {
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(trimmed) ||
    trimmed.includes("\0")
  ) {
    return fallback;
  }

  const parts = trimmed.split(/[\\/]+/);
  if (parts.includes("..")) return fallback;
  if (allowedPrefix && !trimmed.startsWith(allowedPrefix)) return fallback;
  return trimmed;
}

function readPolicy(cwd: string): BudgetPolicy {
  const policy: BudgetPolicy = {
    yellow: 0.55,
    orange: 0.7,
    red: 0.8,
    statusFile: ".ai/harness/context-budget/latest.json",
    fallbackWindows: { ...DEFAULT_WINDOWS },
    fallbackToolCalls: {
      yellow: 30,
      orange: 40,
      red: 50,
    },
  };

  const path = join(cwd, ".ai/harness/policy.json");
  if (!existsSync(path)) return policy;

  try {
    const json = readJsonFile(path);
    policy.yellow = numberAt(json, "context_budget.zones.yellow") ?? policy.yellow;
    policy.orange = numberAt(json, "context_budget.zones.orange") ?? policy.orange;
    policy.red = numberAt(json, "context_budget.zones.red") ?? policy.red;
    policy.statusFile = safeRelativePath(stringAt(json, "context_budget.status_file"), policy.statusFile, ".ai/harness/");
    policy.fallbackToolCalls.yellow =
      numberAt(json, "context_budget.fallback_tool_calls.yellow") ?? policy.fallbackToolCalls.yellow;
    policy.fallbackToolCalls.orange =
      numberAt(json, "context_budget.fallback_tool_calls.orange") ?? policy.fallbackToolCalls.orange;
    policy.fallbackToolCalls.red =
      numberAt(json, "context_budget.fallback_tool_calls.red") ?? policy.fallbackToolCalls.red;

    const windows = valueAt(json, "context_budget.fallback_model_windows");
    if (windows && typeof windows === "object") {
      for (const [model, value] of Object.entries(windows as Record<string, unknown>)) {
        if (typeof value === "number" && Number.isFinite(value) && value > 0) {
          policy.fallbackWindows[model] = value;
        }
      }
    }
  } catch {
    return policy;
  }

  return policy;
}

function readConfigWindow(codexHome: string): number | null {
  const path = join(codexHome, "config.toml");
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf-8");
  const match = text.match(/^model_context_window\s*=\s*(\d+)\s*$/m);
  return match ? Number(match[1]) : null;
}

function sqliteJson(dbPath: string, sql: string): unknown[] {
  if (!existsSync(dbPath)) return [];
  const res = spawnSync("sqlite3", ["-json", dbPath, sql], { encoding: "utf-8" });
  if (res.status !== 0 || !res.stdout.trim()) return [];
  try {
    const parsed = JSON.parse(res.stdout);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function sqlQuote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function readThreads(args: Args): ThreadInfo[] {
  const dbPath = join(args.codexHome, "state_5.sqlite");
  const where: string[] = ["archived = 0"];
  if (args.sessionId) where.push(`id = ${sqlQuote(args.sessionId)}`);

  let rows = sqliteJson(
    dbPath,
    [
      "select id, cwd, title, tokens_used, git_branch, rollout_path, updated_at_ms,",
      "first_user_message, model, reasoning_effort",
      "from threads",
      `where ${where.join(" and ")}`,
      "order by updated_at_ms desc",
      "limit 20",
    ].join(" ")
  ) as Partial<ThreadInfo>[];

  if (rows.length === 0 && args.cwd) {
    rows = sqliteJson(
      dbPath,
      [
        "select id, cwd, title, tokens_used, git_branch, rollout_path, updated_at_ms,",
        "first_user_message, model, reasoning_effort",
        "from threads",
        `where archived = 0 and cwd = ${sqlQuote(args.cwd)}`,
        "order by updated_at_ms desc",
        "limit 20",
      ].join(" ")
    ) as Partial<ThreadInfo>[];
  }

  return rows.map((row) => ({
    id: String(row.id || ""),
    cwd: String(row.cwd || ""),
    title: String(row.title || ""),
    tokens_used: Number(row.tokens_used || 0),
    git_branch: String(row.git_branch || ""),
    rollout_path: String(row.rollout_path || ""),
    updated_at_ms: Number(row.updated_at_ms || 0),
    first_user_message: String(row.first_user_message || ""),
    model: String(row.model || ""),
    reasoning_effort: String(row.reasoning_effort || ""),
  }));
}

function selectThread(args: Args): ThreadInfo | null {
  const threads = readThreads(args);
  if (threads.length === 0) return null;
  return threads.sort((a, b) => b.updated_at_ms - a.updated_at_ms)[0];
}

function tailLines(path: string, count: number): string[] {
  if (!existsSync(path)) return [];
  const res = spawnSync("tail", ["-n", String(count), path], { encoding: "utf-8" });
  const text = res.status === 0 ? res.stdout : readFileSync(path, "utf-8");
  return text.split(/\r?\n/).filter(Boolean);
}

function readRolloutSignal(path: string): {
  usageTokens: number | null;
  contextWindow: number | null;
  model: string;
  reasoningEffort: string;
} {
  let usageTokens: number | null = null;
  let contextWindow: number | null = null;
  let model = "";
  let reasoningEffort = "";

  for (const line of tailLines(path, 800)) {
    let item: unknown;
    try {
      item = JSON.parse(line);
    } catch {
      continue;
    }

    const payload = valueAt(item, "payload");
    const eventType = stringAt(payload, "type");
    if (eventType === "task_started") {
      contextWindow = numberAt(payload, "model_context_window") ?? contextWindow;
      model = stringAt(payload, "model") || model;
      reasoningEffort = stringAt(payload, "reasoning_effort") || reasoningEffort;
      continue;
    }

    if (eventType !== "token_count") continue;
    usageTokens =
      numberAt(payload, "info.last_token_usage.total_tokens") ??
      numberAt(payload, "info.last_token_usage.input_tokens") ??
      usageTokens;
    contextWindow = numberAt(payload, "info.model_context_window") ?? contextWindow;
  }

  return { usageTokens, contextWindow, model, reasoningEffort };
}

function resolveWindow(model: string, signalWindow: number | null, policy: BudgetPolicy, codexHome: string): number | null {
  if (signalWindow && signalWindow > 0) return signalWindow;
  if (model && policy.fallbackWindows[model]) return policy.fallbackWindows[model];
  return readConfigWindow(codexHome);
}

function zoneForPercent(percent: number | null, policy: BudgetPolicy): Zone {
  if (percent === null || !Number.isFinite(percent)) return "unknown";
  if (percent >= policy.red) return "red";
  if (percent >= policy.orange) return "orange";
  if (percent >= policy.yellow) return "yellow";
  return "green";
}

function zoneForToolCount(count: number | null, policy: BudgetPolicy): Zone {
  if (count === null) return "unknown";
  if (count >= policy.fallbackToolCalls.red) return "red";
  if (count >= policy.fallbackToolCalls.orange) return "orange";
  if (count >= policy.fallbackToolCalls.yellow) return "yellow";
  return "green";
}

function buildResult(args: Args): BudgetResult {
  const policy = readPolicy(args.cwd);
  const thread = selectThread(args);
  const rolloutPath = args.transcriptPath || thread?.rollout_path || "";
  const signal = rolloutPath ? readRolloutSignal(rolloutPath) : { usageTokens: null, contextWindow: null, model: "", reasoningEffort: "" };
  const model = signal.model || thread?.model || "";
  const reasoningEffort = signal.reasoningEffort || thread?.reasoning_effort || "";
  const window = resolveWindow(model, signal.contextWindow, policy, args.codexHome);

  let source: Source = "unavailable";
  let usageTokens = signal.usageTokens;
  let usedPercent: number | null = null;
  let estimated = false;

  if (usageTokens !== null && window && window > 0) {
    source = "rollout-token-count";
    usedPercent = usageTokens / window;
  } else if (thread && thread.tokens_used > 0 && window && window > 0) {
    source = "state-db-token-total";
    usageTokens = thread.tokens_used;
    usedPercent = usageTokens / window;
    estimated = true;
  }

  let zone = zoneForPercent(usedPercent, policy);
  if (zone === "unknown" && args.toolCount !== null) {
    source = "tool-call-count";
    zone = zoneForToolCount(args.toolCount, policy);
    estimated = true;
  }

  const statusFile = join(args.cwd, policy.statusFile);
  const remainingPercent = usedPercent === null ? null : Math.max(0, 1 - usedPercent);
  const message =
    zone === "red"
      ? "context red zone: write handoff and resume from a fresh session; do not wait for auto-compact"
      : zone === "orange"
        ? "context orange zone: stop broad exploration and prepare a handoff resume packet"
        : zone === "yellow"
          ? "context yellow zone: persist research, todo, and handoff state before continuing"
          : zone === "green"
            ? "context green zone"
            : "context pressure unavailable";

  return {
    cwd: args.cwd,
    codexHome: args.codexHome,
    sessionId: args.sessionId,
    threadId: thread?.id || "",
    model,
    reasoningEffort,
    source,
    zone,
    usageTokens,
    contextWindow: window,
    usedPercent,
    remainingPercent,
    estimated,
    rolloutPath,
    statusFile,
    message,
    handoffRecommended: zone === "orange" || zone === "red",
    stopRecommended: zone === "red",
    thresholds: {
      yellow: policy.yellow,
      orange: policy.orange,
      red: policy.red,
    },
  };
}

function writeStatus(result: BudgetResult): void {
  mkdirSync(dirname(result.statusFile), { recursive: true });
  writeFileSync(result.statusFile, `${JSON.stringify({ ...result, generatedAt: new Date().toISOString() }, null, 2)}\n`);
}

function printText(result: BudgetResult): void {
  const used =
    result.usedPercent === null
      ? "unknown"
      : `${Math.round(result.usedPercent * 1000) / 10}%`;
  console.log(`[context-budget] ${result.zone} (${used}, source=${result.source}) ${result.message}`);
}

const args = parseArgs(process.argv.slice(2));
const result = buildResult(args);
if (args.writeStatus) writeStatus(result);
if (args.format === "json") {
  console.log(JSON.stringify(result, null, 2));
} else {
  printText(result);
}
