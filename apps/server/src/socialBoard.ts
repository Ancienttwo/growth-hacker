import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { HermesLlmSelection, JobSnapshot, SocialBoardTask, SocialBoardTaskStatus, SocialCronTaskType } from "@growth-hacker/core";

import type { AppConfig } from "./config";
import type { JobStore } from "./jobs";
import { buildSocialTaskCommand } from "./socialTaskCommands";

const SOCIAL_BOARD_SCHEMA_VERSION = 1;
const BOARD_ID = "social-media";
const RUNNABLE_STATUSES: SocialBoardTaskStatus[] = ["todo", "ready", "failed"];

interface SocialBoardStore {
  schemaVersion: typeof SOCIAL_BOARD_SCHEMA_VERSION;
  tasks: SocialBoardTask[];
}

export interface CreateSocialBoardTaskInput {
  agentId?: string;
  llm?: HermesLlmSelection;
  platform: string;
  profile: string;
  taskType: SocialCronTaskType;
  title?: string;
  source?: "manual" | "cron";
  sourceId?: string;
  status?: SocialBoardTaskStatus;
}

export interface UpdateSocialBoardTaskInput {
  status?: SocialBoardTaskStatus;
  title?: string;
}

export function listSocialAgents(config: AppConfig) {
  return config.socialAgents;
}

export function listSocialBoardTasks(config: AppConfig): SocialBoardTask[] {
  return readStore(config).tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function createSocialBoardTask(config: AppConfig, input: CreateSocialBoardTaskInput): SocialBoardTask {
  const agentId = input.agentId?.trim() || config.defaultHermesProfile;
  const runner = resolveAgentRunner(config, agentId);
  const now = new Date().toISOString();
  const task: SocialBoardTask = {
    id: `task-${randomUUID().slice(0, 8)}`,
    boardId: BOARD_ID,
    agentId,
    runner,
    llm: input.llm,
    platform: input.platform,
    profile: input.profile,
    taskType: input.taskType,
    title: input.title?.trim() || `${input.profile} ${input.taskType}`,
    status: input.status ?? "ready",
    source: input.source ?? "manual",
    sourceId: input.sourceId,
    createdAt: now,
    updatedAt: now
  };

  buildSocialTaskCommand(config, task.platform, task.profile, task.taskType, task.agentId, task.llm);
  const store = readStore(config);
  store.tasks.push(task);
  writeStore(config, store);
  return task;
}

export function updateSocialBoardTask(config: AppConfig, id: string, input: UpdateSocialBoardTaskInput): SocialBoardTask {
  const store = readStore(config);
  const index = store.tasks.findIndex((task) => task.id === id);
  if (index < 0) throw new Error(`social_board_task_not_found:${id}`);
  const current = store.tasks[index];
  const updated: SocialBoardTask = {
    ...current,
    title: input.title?.trim() || current.title,
    status: input.status ?? current.status,
    updatedAt: new Date().toISOString()
  };
  store.tasks[index] = updated;
  writeStore(config, store);
  return updated;
}

export function runSocialBoardTask(config: AppConfig, jobStore: JobStore, id: string, onFinish?: (job: JobSnapshot) => void): JobSnapshot {
  const store = readStore(config);
  const index = store.tasks.findIndex((task) => task.id === id);
  if (index < 0) throw new Error(`social_board_task_not_found:${id}`);
  const task = store.tasks[index];
  if (!RUNNABLE_STATUSES.includes(task.status)) throw new Error(`task_not_runnable:${task.status}`);
  const command = buildSocialTaskCommand(config, task.platform, task.profile, task.taskType, task.agentId, task.llm);
  const now = new Date().toISOString();
  store.tasks[index] = { ...task, status: "running", startedAt: now, error: undefined, updatedAt: now };
  writeStore(config, store);

  const snapshot = jobStore.start(`social-board-${task.taskType}`, command.command, command.args, {
    cwd: command.cwd,
    timeoutMs: 10 * 60 * 1000,
    onFinish: (finished) => {
      markSocialBoardTaskFinished(config, id, finished);
      onFinish?.(finished);
    }
  });

  patchSocialBoardTask(config, id, {
    lastJobId: snapshot.id,
    updatedAt: new Date().toISOString()
  });
  return snapshot;
}

export function deleteSocialBoardTask(config: AppConfig, id: string): boolean {
  const store = readStore(config);
  const next = store.tasks.filter((task) => task.id !== id);
  if (next.length === store.tasks.length) return false;
  writeStore(config, { ...store, tasks: next });
  return true;
}

export function resolveAgentRunner(config: AppConfig, agentId: string) {
  const agent = config.socialAgents.find((item) => item.id === agentId);
  if (!agent) throw new Error(`agent_not_allowed:${agentId}`);
  return agent.runner;
}

function markSocialBoardTaskFinished(config: AppConfig, id: string, snapshot: JobSnapshot): void {
  patchSocialBoardTask(config, id, {
    status: snapshot.status === "failed" ? "failed" : "done",
    completedAt: new Date().toISOString(),
    result: snapshot.status === "failed" ? undefined : snapshot.logs.slice(-8).join("\n"),
    error: snapshot.status === "failed" ? snapshot.logs.at(-1) ?? "task failed" : undefined,
    updatedAt: new Date().toISOString()
  });
}

function patchSocialBoardTask(config: AppConfig, id: string, patch: Partial<SocialBoardTask>): void {
  const store = readStore(config);
  const index = store.tasks.findIndex((task) => task.id === id);
  if (index < 0) return;
  store.tasks[index] = { ...store.tasks[index], ...patch };
  writeStore(config, store);
}

function readStore(config: AppConfig): SocialBoardStore {
  ensureStoreDir(config);
  const path = storePath(config);
  if (!existsSync(path)) return { schemaVersion: SOCIAL_BOARD_SCHEMA_VERSION, tasks: [] };
  const payload = JSON.parse(readFileSync(path, "utf8")) as SocialBoardStore;
  return {
    schemaVersion: SOCIAL_BOARD_SCHEMA_VERSION,
    tasks: payload.tasks ?? []
  };
}

function writeStore(config: AppConfig, store: SocialBoardStore): void {
  ensureStoreDir(config);
  const path = storePath(config);
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify({ schemaVersion: SOCIAL_BOARD_SCHEMA_VERSION, tasks: store.tasks }, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, path);
}

function ensureStoreDir(config: AppConfig): void {
  mkdirSync(join(config.growthRoot, "social-board"), { recursive: true, mode: 0o700 });
}

function storePath(config: AppConfig): string {
  return join(config.growthRoot, "social-board", "tasks.json");
}
