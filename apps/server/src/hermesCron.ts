import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  XIAOHONGSHU_PLATFORM,
  type HermesLlmSelection,
  type SocialBoardTask,
  type SocialCronJob,
  type SocialCronSchedule,
  type SocialCronTaskType
} from "@growth-hacker/core";

import type { AppConfig } from "./config";

interface HermesCronPayload {
  jobs?: HermesCronJob[];
}

interface HermesCronJob {
  id?: unknown;
  name?: unknown;
  prompt?: unknown;
  skills?: unknown;
  skill?: unknown;
  provider?: unknown;
  model?: unknown;
  schedule?: unknown;
  schedule_display?: unknown;
  repeat?: unknown;
  enabled?: unknown;
  state?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  next_run_at?: unknown;
  last_run_at?: unknown;
  last_status?: unknown;
  last_error?: unknown;
  deliver?: unknown;
  origin?: unknown;
  workdir?: unknown;
}

interface HermesCronRunLedger {
  schemaVersion: 1;
  updatedAt: string;
  tasks: SocialBoardTask[];
}

interface HermesCronSessionLink {
  id: string;
  path: string;
}

interface DiscordOrigin {
  platform: "discord";
  chat_id: string;
  chat_name?: string | null;
  thread_id?: string | null;
}

interface DiscordRouting {
  channelProfiles: Record<string, string>;
  growthOrigin?: DiscordOrigin;
}

const HERMES_RUN_SCAN_LIMIT_PER_JOB = 200;
const MAX_HERMES_RUN_RESULT_CHARS = 4_000;
const HERMES_CRON_LEDGER_SCHEMA_VERSION = 1;
const HERMES_SESSION_OUTPUT_MATCH_WINDOW_MS = 15 * 60 * 1_000;

export function listHermesSocialCronJobs(config: AppConfig): SocialCronJob[] {
  const path = join(config.hermesHome, "cron", "jobs.json");
  if (!existsSync(path)) return [];

  try {
    const payload = JSON.parse(readFileSync(path, "utf8")) as HermesCronPayload;
    repairHermesSocialCronOrigins(config, payload, path);
    return (payload.jobs ?? []).flatMap((job) => mapHermesSocialCronJob(config, job) ?? []);
  } catch {
    return [];
  }
}

export function listHermesSocialCronRunTasks(config: AppConfig): SocialBoardTask[] {
  syncHermesSocialCronRunLedger(config);
  return readHermesCronRunLedger(config).tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function mapHermesSocialCronJob(config: AppConfig, job: HermesCronJob): SocialCronJob | null {
  if (!isXiaohongshuHermesCron(job)) return null;

  const id = stringValue(job.id);
  const name = stringValue(job.name);
  const schedule = normalizeHermesSchedule(job.schedule, stringValue(job.schedule_display));
  if (!id || !name || !schedule) return null;

  const haystack = cronHaystack(job);
  const createdAt = normalizeDate(stringValue(job.created_at)) ?? new Date(0).toISOString();
  const updatedAt = normalizeDate(stringValue(job.updated_at)) ?? createdAt;
  const lastStatus = stringValue(job.last_status);
  const enabled = job.enabled !== false;
  const state = normalizeHermesState(stringValue(job.state), enabled);

  return {
    id: `hermes:${id}`,
    source: "hermes",
    readOnly: true,
    agentId: config.defaultHermesProfile,
    llm: normalizeHermesLlm(job),
    platform: XIAOHONGSHU_PLATFORM,
    profile: inferXiaohongshuProfile(haystack, name),
    name,
    taskType: inferHermesTaskType(haystack),
    schedule,
    enabled,
    state,
    createdAt,
    updatedAt,
    nextRunAt: normalizeDate(stringValue(job.next_run_at)),
    lastRunAt: normalizeDate(stringValue(job.last_run_at)),
    lastStatus: lastStatus === "ok" ? "succeeded" : lastStatus ? "failed" : undefined,
    lastError: stringValue(job.last_error),
    runCount: repeatCompleted(job.repeat)
  };
}

function syncHermesSocialCronRunLedger(config: AppConfig): void {
  const existing = readHermesCronRunLedger(config);
  const current = listHermesSocialCronJobs(config).flatMap((job) => listHermesCronRunTasksForJob(config, job));
  if (!current.length && !existing.tasks.length) return;

  const byId = new Map(existing.tasks.map((task) => [task.id, task]));
  for (const task of current) {
    const previous = byId.get(task.id);
    byId.set(task.id, {
      ...previous,
      ...task,
      syncedAt: new Date().toISOString()
    });
  }

  writeHermesCronRunLedger(config, {
    schemaVersion: HERMES_CRON_LEDGER_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    tasks: [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  });
}

function listHermesCronRunTasksForJob(config: AppConfig, job: SocialCronJob): SocialBoardTask[] {
  const sourceJobId = sourceHermesJobId(job.id);
  if (!sourceJobId) return [];

  const outputDir = join(config.hermesHome, "cron", "output", sourceJobId);
  if (!existsSync(outputDir)) return [];

  try {
    return readdirSync(outputDir)
      .filter((name) => name.endsWith(".md"))
      .sort()
      .slice(-HERMES_RUN_SCAN_LIMIT_PER_JOB)
      .flatMap((name) => mapHermesCronRunTask(config, job, sourceJobId, name, join(outputDir, name)) ?? []);
  } catch {
    return [];
  }
}

function mapHermesCronRunTask(config: AppConfig, job: SocialCronJob, sourceJobId: string, fileName: string, path: string): SocialBoardTask | null {
  const timestamp = parseHermesOutputTimestamp(fileName);
  if (!timestamp) return null;

  let content = "";
  let sourceMtimeMs: number | undefined;
  try {
    content = readFileSync(path, "utf8");
    sourceMtimeMs = statSync(path).mtimeMs;
  } catch {
    return null;
  }

  const failed = isFailedHermesRunOutput(content);
  const hermesSession = findHermesCronSessionForOutput(config, sourceJobId, timestamp);
  return {
    id: `hermes-run:${sourceJobId}:${fileName.replace(/\.md$/, "")}`,
    boardId: "social-media",
    agentId: job.agentId,
    runner: "hermes",
    cronSource: "hermes",
    readOnly: true,
    llm: job.llm,
    platform: job.platform,
    profile: job.profile,
    taskType: job.taskType,
    title: job.name,
    status: failed ? "failed" : "done",
    source: "cron",
    sourceId: job.id,
    createdAt: timestamp,
    updatedAt: timestamp,
    startedAt: timestamp,
    completedAt: timestamp,
    lastJobId: sourceJobId,
    sourceOutputPath: path,
    sourceMtimeMs,
    hermesSessionId: hermesSession?.id,
    hermesSessionPath: hermesSession?.path,
    result: failed ? undefined : extractHermesRunResult(content),
    error: failed ? extractHermesRunError(content) : undefined
  };
}

function findHermesCronSessionForOutput(config: AppConfig, sourceJobId: string, outputTimestamp: string): HermesCronSessionLink | undefined {
  const sessionsRoot = join(config.hermesHome, "sessions");
  if (!existsSync(sessionsRoot)) return undefined;

  const outputTime = new Date(outputTimestamp).getTime();
  if (!Number.isFinite(outputTime)) return undefined;

  try {
    let best: { link: HermesCronSessionLink; distance: number } | undefined;
    for (const name of readdirSync(sessionsRoot)) {
      if (!name.startsWith(`session_cron_${sourceJobId}_`) || !name.endsWith(".json")) continue;

      const path = join(sessionsRoot, name);
      const payload = recordValue(JSON.parse(readFileSync(path, "utf8")));
      const id = stringValue(payload.session_id) || name.replace(/^session_/, "").replace(/\.json$/, "");
      const sessionTime = parseHermesSessionTime(payload.last_updated) ?? parseHermesSessionTime(payload.session_start);
      if (!id || sessionTime === undefined) continue;

      const distance = Math.abs(sessionTime - outputTime);
      if (!best || distance < best.distance) {
        best = { link: { id, path }, distance };
      }
    }

    return best && best.distance <= HERMES_SESSION_OUTPUT_MATCH_WINDOW_MS ? best.link : undefined;
  } catch {
    return undefined;
  }
}

function readHermesCronRunLedger(config: AppConfig): HermesCronRunLedger {
  const path = hermesCronRunLedgerPath(config);
  if (!existsSync(path)) return { schemaVersion: HERMES_CRON_LEDGER_SCHEMA_VERSION, updatedAt: new Date(0).toISOString(), tasks: [] };

  try {
    const payload = JSON.parse(readFileSync(path, "utf8")) as Partial<HermesCronRunLedger>;
    return {
      schemaVersion: HERMES_CRON_LEDGER_SCHEMA_VERSION,
      updatedAt: stringValue(payload.updatedAt) || new Date(0).toISOString(),
      tasks: Array.isArray(payload.tasks) ? payload.tasks.filter(isSocialBoardTask) : []
    };
  } catch {
    return { schemaVersion: HERMES_CRON_LEDGER_SCHEMA_VERSION, updatedAt: new Date(0).toISOString(), tasks: [] };
  }
}

function writeHermesCronRunLedger(config: AppConfig, ledger: HermesCronRunLedger): void {
  const path = hermesCronRunLedgerPath(config);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(ledger, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, path);
}

function hermesCronRunLedgerPath(config: AppConfig): string {
  return join(config.growthRoot, "social-board", "agents", config.defaultHermesProfile, "hermes-cron-runs.json");
}

function isSocialBoardTask(value: unknown): value is SocialBoardTask {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && record.boardId === "social-media" && typeof record.agentId === "string";
}

function repairHermesSocialCronOrigins(config: AppConfig, payload: HermesCronPayload, path: string): void {
  const routing = readDiscordRouting(config);
  if (!routing.growthOrigin || !payload.jobs?.length) return;

  let changed = false;
  for (const job of payload.jobs) {
    if (!isXiaohongshuHermesCron(job)) continue;
    if (!shouldRepairHermesCronOrigin(config, routing, job)) continue;

    job.deliver = "origin";
    job.origin = routing.growthOrigin;
    changed = true;
  }

  if (!changed) return;
  writeHermesCronJobsPayload(path, payload);
}

function shouldRepairHermesCronOrigin(config: AppConfig, routing: DiscordRouting, job: HermesCronJob): boolean {
  const deliver = stringValue(job.deliver) || "local";
  if (deliver !== "origin") return false;

  const origin = objectValue(job.origin);
  if (!origin) return true;
  if (stringValue(origin.platform) !== "discord") return false;

  const channelProfile = routing.channelProfiles[stringValue(origin.chat_id)];
  if (!channelProfile || channelProfile === config.defaultHermesProfile) return false;
  return channelProfile === "default";
}

function writeHermesCronJobsPayload(path: string, payload: HermesCronPayload): void {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(payload, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, path);
}

function readDiscordRouting(config: AppConfig): DiscordRouting {
  const path = join(config.hermesHome, "config.yaml");
  if (!existsSync(path)) return { channelProfiles: {} };

  try {
    const parsed = recordValue(Bun.YAML.parse(readFileSync(path, "utf8")));
    const discord = recordValue(parsed.discord);
    const channelProfiles = Object.fromEntries(
      Object.entries(recordValue(discord.channel_profiles)).flatMap(([channelId, profile]) => {
        const id = channelId.trim();
        const value = stringValue(profile);
        return id && value ? [[id, value]] : [];
      })
    );
    const growthChannelId = Object.entries(channelProfiles).find(([, profile]) => profile === config.defaultHermesProfile)?.[0];
    return {
      channelProfiles,
      growthOrigin: growthChannelId
        ? {
            platform: "discord",
            chat_id: growthChannelId,
            chat_name: `Growth Hacker / ${config.defaultHermesProfile}`,
            thread_id: growthChannelId
          }
        : undefined
    };
  } catch {
    return { channelProfiles: {} };
  }
}

function sourceHermesJobId(id: string): string | undefined {
  return id.startsWith("hermes:") ? id.slice("hermes:".length) : undefined;
}

function parseHermesOutputTimestamp(fileName: string): string | undefined {
  const match = fileName.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.md$/);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function isFailedHermesRunOutput(content: string): boolean {
  return /^# Cron Job: .*\(FAILED\)/m.test(content) || /\*\*Status:\*\*\s*script failed/i.test(content) || /\n## Error\n/i.test(content);
}

function extractHermesRunResult(content: string): string | undefined {
  const match = content.match(/\n## Response\s*\n+([\s\S]*)$/);
  return truncateOutput(match?.[1] ?? "");
}

function extractHermesRunError(content: string): string | undefined {
  const match = content.match(/\n## Error\s*\n+([\s\S]*)$/) ?? content.match(/\*\*Status:\*\*\s*([^\n]+)/i);
  return truncateOutput(match?.[1] ?? "Hermes cron run failed") ?? "Hermes cron run failed";
}

function truncateOutput(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_HERMES_RUN_RESULT_CHARS ? `${trimmed.slice(0, MAX_HERMES_RUN_RESULT_CHARS).trimEnd()}\n...` : trimmed;
}

function isXiaohongshuHermesCron(job: HermesCronJob): boolean {
  const skills = Array.isArray(job.skills) ? job.skills.map(String) : [];
  if (stringValue(job.skill) === "xiaohongshu-skill" || skills.includes("xiaohongshu-skill")) return true;
  return cronHaystack(job).includes("xiaohongshu-skill");
}

function cronHaystack(job: HermesCronJob): string {
  return [job.name, job.prompt, job.workdir].map((value) => stringValue(value)).filter(Boolean).join("\n");
}

function normalizeHermesSchedule(rawSchedule: unknown, display: string): SocialCronSchedule | undefined {
  const schedule = objectValue(rawSchedule);
  const kind = stringValue(schedule?.kind);

  if (kind === "interval") {
    const minutes = numberValue(schedule?.minutes);
    if (minutes && minutes > 0) return { kind: "interval", value: display || `every ${minutes}m`, display: display || `every ${minutes}m`, minutes };
  }

  const expr = stringValue(schedule?.expr) || display;
  const daily = expr.match(/^([0-5]?\d)\s+([01]?\d|2[0-3])\s+\*\s+\*\s+\*$/);
  if (daily) {
    const time = `${daily[2].padStart(2, "0")}:${daily[1].padStart(2, "0")}`;
    return { kind: "daily", value: expr, display: `daily ${time}`, time };
  }

  const dailyDisplay = display.match(/^daily\s+([01]\d|2[0-3]):([0-5]\d)$/i);
  if (dailyDisplay) {
    const time = `${dailyDisplay[1]}:${dailyDisplay[2]}`;
    return { kind: "daily", value: display, display: `daily ${time}`, time };
  }

  if (display) return { kind: "daily", value: display, display };
  return undefined;
}

function inferXiaohongshuProfile(haystack: string, name: string): string {
  const patterns = [
    /\/vault\/([^/\s`]+)\/xiaohongshu\//,
    /\/xiaohongshu\/([^/\s`]+)(?:\/|\s|`|$)/,
    /clients\/([^/\s`]+)/,
    /users\/([^/\s`]+)\/\.xiaohongshu\//
  ];
  for (const pattern of patterns) {
    const match = haystack.match(pattern);
    if (match?.[1]) return match[1];
  }

  const nameParts = name.split("-");
  if (nameParts[0] === "xhs" && nameParts[1]) return nameParts[1];
  return "unknown";
}

function inferHermesTaskType(haystack: string): SocialCronTaskType {
  const lower = haystack.toLowerCase();
  if (lower.includes("topic-harvest") || lower.includes("candidate topics") || haystack.includes("候选题")) return "topic-harvest";
  if (lower.includes("auto-reply")) return "auto-reply";
  if (lower.includes("health-report") || lower.includes("score_health")) return "health-report";
  if (lower.includes("daily-ops") || lower.includes("nurture")) return "daily-ops-refresh";
  return "workspace-diagnosis";
}

function normalizeHermesLlm(job: HermesCronJob): HermesLlmSelection | undefined {
  const provider = stringValue(job.provider);
  const model = stringValue(job.model);
  if (!provider || !model) return undefined;
  return { provider, model };
}

function normalizeHermesState(state: string, enabled: boolean): SocialCronJob["state"] {
  if (!enabled || state === "paused") return "paused";
  if (state === "running") return "running";
  if (state === "failed") return "failed";
  return "scheduled";
}

function repeatCompleted(value: unknown): number {
  const completed = numberValue(objectValue(value)?.completed);
  return completed && completed > 0 ? completed : 0;
}

function normalizeDate(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function parseHermesSessionTime(value: unknown): number | undefined {
  const raw = stringValue(value);
  if (!raw) return undefined;
  const normalized = raw.replace(/\.(\d{3})\d+/, ".$1");
  const date = new Date(normalized);
  const time = date.getTime();
  return Number.isNaN(time) ? undefined : time;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function recordValue(value: unknown): Record<string, unknown> {
  return objectValue(value) ?? {};
}
