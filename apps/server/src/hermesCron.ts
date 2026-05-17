import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { XIAOHONGSHU_PLATFORM, type HermesLlmSelection, type SocialCronJob, type SocialCronSchedule, type SocialCronTaskType } from "@growth-hacker/core";

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
  workdir?: unknown;
}

export function listHermesSocialCronJobs(config: AppConfig): SocialCronJob[] {
  const path = join(config.hermesHome, "cron", "jobs.json");
  if (!existsSync(path)) return [];

  try {
    const payload = JSON.parse(readFileSync(path, "utf8")) as HermesCronPayload;
    return (payload.jobs ?? []).flatMap((job) => mapHermesSocialCronJob(config, job) ?? []);
  } catch {
    return [];
  }
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
    agentId: "hermes-cron",
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

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}
