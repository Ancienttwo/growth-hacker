import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { HermesLlmSelection, JobSnapshot, SocialCronJob, SocialCronSchedule, SocialCronTaskType } from "@growth-hacker/core";
import { XIAOHONGSHU_PLATFORM } from "@growth-hacker/core";

import type { AppConfig } from "./config";
import type { JobStore } from "./jobs";
import { createSocialBoardTask, listSocialAgents, runSocialBoardTask } from "./socialBoard";
import { profileRoot, safeStat } from "./workspace";

const SOCIAL_CRON_SCHEMA_VERSION = 1;
const TASK_LABELS: Record<SocialCronTaskType, string> = {
  "workspace-diagnosis": "Workspace diagnosis",
  "daily-ops-refresh": "Daily ops refresh",
  "health-report": "Health report",
  "auto-reply": "Auto replies"
};

interface SocialCronStore {
  schemaVersion: typeof SOCIAL_CRON_SCHEMA_VERSION;
  jobs: SocialCronJob[];
}

export interface CreateSocialCronJobInput {
  agentId?: string;
  llm?: HermesLlmSelection;
  platform: string;
  profile: string;
  taskType: SocialCronTaskType;
  schedule: string;
  name?: string;
}

export interface UpdateSocialCronJobInput {
  enabled?: boolean;
  llm?: HermesLlmSelection | null;
  schedule?: string;
  name?: string;
}

export const SOCIAL_CRON_TASK_TYPES = Object.keys(TASK_LABELS) as SocialCronTaskType[];

export function listSocialCronAgents(config: AppConfig): string[] {
  return listSocialAgents(config).map((agent) => agent.id);
}

export function listSocialCronJobs(config: AppConfig): SocialCronJob[] {
  return readStore(config).jobs.sort((a, b) => {
    const left = a.nextRunAt ?? a.updatedAt;
    const right = b.nextRunAt ?? b.updatedAt;
    return left.localeCompare(right);
  });
}

export function createSocialCronJob(config: AppConfig, input: CreateSocialCronJobInput): SocialCronJob {
  const agentId = input.agentId?.trim() || config.defaultHermesProfile;
  assertAllowedAgent(config, agentId);
  assertSupportedTask(input.platform, input.taskType);
  const root = profileRoot(config, input.platform, input.profile);
  if (!safeStat(root)?.isDirectory()) {
    throw new Error(`profile_not_found:${input.platform}/${input.profile}`);
  }

  const now = new Date();
  const schedule = parseSocialCronSchedule(input.schedule);
  const job: SocialCronJob = {
    id: `scron-${randomUUID().slice(0, 8)}`,
    agentId,
    llm: input.llm,
    platform: input.platform,
    profile: input.profile,
    name: input.name?.trim() || defaultJobName(input.profile, input.taskType),
    taskType: input.taskType,
    schedule,
    enabled: true,
    state: "scheduled",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    nextRunAt: computeNextSocialCronRun(schedule, now),
    runCount: 0
  };

  const store = readStore(config);
  store.jobs.push(job);
  writeStore(config, store);
  return job;
}

export function updateSocialCronJob(config: AppConfig, id: string, input: UpdateSocialCronJobInput): SocialCronJob {
  const store = readStore(config);
  const index = store.jobs.findIndex((job) => job.id === id);
  if (index < 0) throw new Error(`social_cron_job_not_found:${id}`);

  const current = store.jobs[index];
  const updated: SocialCronJob = {
    ...current,
    updatedAt: new Date().toISOString()
  };

  if (typeof input.enabled === "boolean") {
    updated.enabled = input.enabled;
    updated.state = input.enabled ? "scheduled" : "paused";
    updated.nextRunAt = input.enabled ? computeNextSocialCronRun(updated.schedule, new Date()) : undefined;
  }
  if (input.llm !== undefined) {
    updated.llm = input.llm ?? undefined;
  }
  if (input.schedule !== undefined) {
    updated.schedule = parseSocialCronSchedule(input.schedule);
    updated.nextRunAt = updated.enabled ? computeNextSocialCronRun(updated.schedule, new Date()) : undefined;
  }
  if (input.name !== undefined) {
    updated.name = input.name.trim() || current.name;
  }

  store.jobs[index] = updated;
  writeStore(config, store);
  return updated;
}

export function deleteSocialCronJob(config: AppConfig, id: string): boolean {
  const store = readStore(config);
  const next = store.jobs.filter((job) => job.id !== id);
  if (next.length === store.jobs.length) return false;
  writeStore(config, { ...store, jobs: next });
  return true;
}

export function runDueSocialCronJobs(config: AppConfig, jobStore: JobStore, now = new Date()): JobSnapshot[] {
  const jobs = listSocialCronJobs(config).filter((job) => {
    if (!job.enabled || job.state === "running" || !job.nextRunAt) return false;
    return new Date(job.nextRunAt).getTime() <= now.getTime();
  });
  return jobs.map((job) => runSocialCronJob(config, jobStore, job.id));
}

export function runSocialCronJob(config: AppConfig, jobStore: JobStore, id: string): JobSnapshot {
  const store = readStore(config);
  const index = store.jobs.findIndex((job) => job.id === id);
  if (index < 0) throw new Error(`social_cron_job_not_found:${id}`);

  const job = store.jobs[index];
  assertAllowedAgent(config, job.agentId);
  const now = new Date();
  const nextJob: SocialCronJob = {
    ...job,
    state: "running",
    lastRunAt: now.toISOString(),
    lastError: undefined,
    updatedAt: now.toISOString(),
    nextRunAt: job.enabled ? computeNextSocialCronRun(job.schedule, now) : undefined
  };
  store.jobs[index] = nextJob;
  writeStore(config, store);

  const task = createSocialBoardTask(config, {
    agentId: job.agentId,
    llm: job.llm,
    platform: job.platform,
    profile: job.profile,
    taskType: job.taskType,
    title: job.name,
    source: "cron",
    sourceId: job.id,
    status: "ready"
  });
  const snapshot = runSocialBoardTask(config, jobStore, task.id, (finished) => markSocialCronFinished(config, id, finished));

  patchSocialCronJob(config, id, {
    lastJobId: snapshot.id,
    updatedAt: new Date().toISOString()
  });
  return snapshot;
}

export function startSocialCronScheduler(config: AppConfig, jobStore: JobStore, intervalMs = 60_000): () => void {
  const tick = () => {
    try {
      runDueSocialCronJobs(config, jobStore);
    } catch (error) {
      console.error("social cron tick failed:", error);
    }
  };
  const timer = setInterval(tick, intervalMs);
  (timer as { unref?: () => void }).unref?.();
  tick();
  return () => clearInterval(timer);
}

export function parseSocialCronSchedule(value: string): SocialCronSchedule {
  const raw = value.trim();
  const lower = raw.toLowerCase();
  if (!raw) throw new Error("schedule_required");

  const interval = lower.match(/^every\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/);
  if (interval) {
    const count = Number(interval[1]);
    const unit = interval[2][0];
    const minutes = count * (unit === "d" ? 1440 : unit === "h" ? 60 : 1);
    if (!Number.isFinite(minutes) || minutes <= 0) throw new Error(`invalid_schedule:${value}`);
    return { kind: "interval", value: raw, display: `every ${minutes}m`, minutes };
  }

  const daily = lower.match(/^daily\s+([01]\d|2[0-3]):([0-5]\d)$/);
  if (daily) {
    const time = `${daily[1]}:${daily[2]}`;
    return { kind: "daily", value: raw, display: `daily ${time}`, time };
  }

  const cron = raw.match(/^([0-5]?\d)\s+([01]?\d|2[0-3])\s+\*\s+\*\s+\*$/);
  if (cron) {
    const time = `${cron[2].padStart(2, "0")}:${cron[1].padStart(2, "0")}`;
    return { kind: "daily", value: raw, display: `daily ${time}`, time };
  }

  throw new Error(`invalid_schedule:${value}`);
}

export function computeNextSocialCronRun(schedule: SocialCronSchedule, from = new Date()): string {
  if (schedule.kind === "interval") {
    const minutes = schedule.minutes ?? 0;
    return new Date(from.getTime() + minutes * 60_000).toISOString();
  }

  if (!schedule.time) throw new Error("daily_schedule_missing_time");
  const [hour, minute] = schedule.time.split(":").map(Number);
  const next = new Date(from);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

function markSocialCronFinished(config: AppConfig, id: string, snapshot: JobSnapshot): void {
  patchSocialCronJob(config, id, {
    state: snapshot.status === "failed" ? "failed" : "scheduled",
    lastStatus: snapshot.status === "failed" ? "failed" : "succeeded",
    lastError: snapshot.status === "failed" ? snapshot.logs.at(-1) ?? "job failed" : undefined,
    runCountDelta: 1,
    updatedAt: new Date().toISOString()
  });
}

function patchSocialCronJob(config: AppConfig, id: string, patch: Partial<SocialCronJob> & { runCountDelta?: number }): void {
  const store = readStore(config);
  const index = store.jobs.findIndex((job) => job.id === id);
  if (index < 0) return;
  const current = store.jobs[index];
  const runCountDelta = patch.runCountDelta ?? 0;
  const { runCountDelta: _ignored, ...fields } = patch;
  store.jobs[index] = {
    ...current,
    ...fields,
    runCount: current.runCount + runCountDelta
  };
  writeStore(config, store);
}

function assertAllowedAgent(config: AppConfig, agentId: string): void {
  if (!listSocialCronAgents(config).includes(agentId)) {
    throw new Error(`agent_not_allowed:${agentId}`);
  }
}

function assertSupportedTask(platform: string, taskType: SocialCronTaskType): void {
  if (platform !== XIAOHONGSHU_PLATFORM) {
    throw new Error(`platform_not_supported:${platform}`);
  }
  if (!SOCIAL_CRON_TASK_TYPES.includes(taskType)) {
    throw new Error(`task_not_supported:${taskType}`);
  }
}

function defaultJobName(profile: string, taskType: SocialCronTaskType): string {
  return `${profile} ${TASK_LABELS[taskType]}`;
}

function readStore(config: AppConfig): SocialCronStore {
  ensureStoreDir(config);
  const path = storePath(config);
  if (!existsSync(path)) return { schemaVersion: SOCIAL_CRON_SCHEMA_VERSION, jobs: [] };
  const payload = JSON.parse(readFileSync(path, "utf8")) as SocialCronStore;
  return {
    schemaVersion: SOCIAL_CRON_SCHEMA_VERSION,
    jobs: (payload.jobs ?? []).map(normalizeJob)
  };
}

function writeStore(config: AppConfig, store: SocialCronStore): void {
  ensureStoreDir(config);
  const path = storePath(config);
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify({ schemaVersion: SOCIAL_CRON_SCHEMA_VERSION, jobs: store.jobs }, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, path);
}

function normalizeJob(job: SocialCronJob): SocialCronJob {
  return {
    ...job,
    llm: normalizeStoredLlm(job.llm),
    enabled: job.enabled ?? true,
    state: job.state ?? "scheduled",
    runCount: job.runCount ?? 0
  };
}

function normalizeStoredLlm(value: unknown): HermesLlmSelection | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const provider = (value as Record<string, unknown>).provider;
  const model = (value as Record<string, unknown>).model;
  if (typeof provider !== "string" || typeof model !== "string") return undefined;
  if (!provider.trim() || !model.trim()) return undefined;
  return { provider: provider.trim(), model: model.trim() };
}

function ensureStoreDir(config: AppConfig): void {
  mkdirSync(join(config.growthRoot, "social-cron"), { recursive: true, mode: 0o700 });
}

function storePath(config: AppConfig): string {
  return join(config.growthRoot, "social-cron", "jobs.json");
}
