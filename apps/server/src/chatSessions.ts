import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { Database } from "bun:sqlite";
import type { DashboardChatSession, DashboardChatSessionState } from "@growth-hacker/core";

import type { AppConfig } from "./config";

interface ChatSessionRow {
  id: string;
  title: string;
  agent_id: string | null;
  parent_session_id: string | null;
  hermes_session_id: string | null;
  handoff_summary: string | null;
  events_json: string;
  created_at: number;
  updated_at: number;
}

interface ChatSessionInput {
  id?: unknown;
  title?: unknown;
  agentId?: unknown;
  parentSessionId?: unknown;
  hermesSessionId?: unknown;
  handoffSummary?: unknown;
  events?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

interface ChatSessionPatch {
  title?: unknown;
  agentId?: unknown;
  parentSessionId?: unknown;
  hermesSessionId?: unknown;
  handoffSummary?: unknown;
  events?: unknown;
}

const DEFAULT_SESSION_TITLE = "New session";
const SESSION_LIMIT = 24;
const MAX_TITLE_LENGTH = 80;
const MAX_EVENTS = 500;
const MAX_EVENT_JSON_CHARS = 250_000;
const MAX_HANDOFF_CHARS = 40_000;

export function listChatSessions(config: AppConfig): DashboardChatSessionState {
  return withChatDb(config, (db) => {
    const sessions = db
      .query<ChatSessionRow, { $limit: number }>(
        `select id, title, agent_id, parent_session_id, hermes_session_id, handoff_summary,
                events_json, created_at, updated_at
           from chat_sessions
          order by updated_at desc
          limit $limit`
      )
      .all({ $limit: SESSION_LIMIT })
      .map(mapSessionRow);
    const activeId = stringSetting(db, "active_session_id");
    return {
      sessions,
      activeId: activeId && sessions.some((session) => session.id === activeId) ? activeId : sessions[0]?.id
    };
  });
}

export function createChatSession(config: AppConfig, input: ChatSessionInput = {}): DashboardChatSessionState {
  return withChatDb(config, (db) => {
    const session = normalizeSessionInput(input, config.defaultHermesProfile);
    upsertSession(db, session);
    setActiveSessionId(db, session.id);
    return listChatSessionsFromDb(db);
  });
}

export function importChatSessions(config: AppConfig, input: { sessions?: unknown; activeId?: unknown }): DashboardChatSessionState {
  return withChatDb(config, (db) => {
    const existing = countSessions(db);
    if (existing > 0) return listChatSessionsFromDb(db);

    const sessionsInput = Array.isArray(input.sessions) ? input.sessions : [];
    const sessions = sessionsInput
      .map((item) => normalizeSessionInput(item, config.defaultHermesProfile))
      .filter((session) => session.events.length > 0)
      .slice(0, SESSION_LIMIT);
    if (!sessions.length) return listChatSessionsFromDb(db);

    const insertMany = db.transaction((items: DashboardChatSession[]) => {
      for (const session of items) upsertSession(db, session);
    });
    insertMany(sessions);
    const activeId = normalizeId(input.activeId) ?? sessions[0]?.id;
    setActiveSessionId(db, sessions.some((session) => session.id === activeId) ? activeId : sessions[0].id);
    return listChatSessionsFromDb(db);
  });
}

export function updateChatSession(config: AppConfig, sessionId: string, patch: ChatSessionPatch): DashboardChatSession {
  return withChatDb(config, (db) => {
    const current = requireSession(db, sessionId);
    const next: DashboardChatSession = {
      ...current,
      title: patch.title === undefined ? current.title : normalizeTitle(patch.title),
      agentId: patch.agentId === undefined ? current.agentId : normalizeOptionalId(patch.agentId, "agent_id"),
      parentSessionId:
        patch.parentSessionId === undefined ? current.parentSessionId : normalizeOptionalId(patch.parentSessionId, "parent_session_id"),
      hermesSessionId: patch.hermesSessionId === undefined ? current.hermesSessionId : normalizeOptionalId(patch.hermesSessionId, "hermes_session_id"),
      handoffSummary:
        patch.handoffSummary === undefined ? current.handoffSummary : normalizeOptionalText(patch.handoffSummary, MAX_HANDOFF_CHARS),
      events: patch.events === undefined ? current.events : normalizeEvents(patch.events),
      updatedAt: Date.now()
    };
    upsertSession(db, next);
    return next;
  });
}

export function deleteChatSession(config: AppConfig, sessionId: string): DashboardChatSessionState {
  return withChatDb(config, (db) => {
    db.query("delete from chat_sessions where id = $id").run({ $id: normalizeExistingId(sessionId) });
    const state = listChatSessionsFromDb(db);
    if (state.sessions.length) {
      setActiveSessionId(db, state.activeId ?? state.sessions[0].id);
      return listChatSessionsFromDb(db);
    }
    const replacement = normalizeSessionInput({ agentId: config.defaultHermesProfile }, config.defaultHermesProfile);
    upsertSession(db, replacement);
    setActiveSessionId(db, replacement.id);
    return listChatSessionsFromDb(db);
  });
}

export function activateChatSession(config: AppConfig, sessionId: string): DashboardChatSessionState {
  return withChatDb(config, (db) => {
    const session = requireSession(db, sessionId);
    setActiveSessionId(db, session.id);
    return listChatSessionsFromDb(db);
  });
}

export function handoffChatSession(config: AppConfig, sessionId: string, input: { agentId?: unknown } = {}): DashboardChatSessionState {
  return withChatDb(config, (db) => {
    const source = requireSession(db, sessionId);
    const now = Date.now();
    const handoffSummary = buildHandoffSummary(source);
    const agentId = normalizeOptionalId(input.agentId, "agent_id") ?? source.agentId ?? config.defaultHermesProfile;
    const next: DashboardChatSession = {
      id: createSessionId(),
      title: `Handoff: ${displaySessionTitle(source)}`.slice(0, MAX_TITLE_LENGTH),
      agentId,
      parentSessionId: source.id,
      handoffSummary,
      createdAt: now,
      updatedAt: now,
      events: [
        {
          event: "message.user",
          message: `Continue from handoff: ${displaySessionTitle(source)}`,
          agentMessage: handoffSummary,
          timestamp: now / 1000
        }
      ]
    };
    upsertSession(db, next);
    setActiveSessionId(db, next.id);
    return listChatSessionsFromDb(db);
  });
}

function listChatSessionsFromDb(db: Database): DashboardChatSessionState {
  const sessions = db
    .query<ChatSessionRow, { $limit: number }>(
      `select id, title, agent_id, parent_session_id, hermes_session_id, handoff_summary,
              events_json, created_at, updated_at
         from chat_sessions
        order by updated_at desc
        limit $limit`
    )
    .all({ $limit: SESSION_LIMIT })
    .map(mapSessionRow);
  const activeId = stringSetting(db, "active_session_id");
  return {
    sessions,
    activeId: activeId && sessions.some((session) => session.id === activeId) ? activeId : sessions[0]?.id
  };
}

function withChatDb<T>(config: AppConfig, run: (db: Database) => T): T {
  const db = openChatDb(config);
  try {
    return run(db);
  } finally {
    db.close();
  }
}

function openChatDb(config: AppConfig): Database {
  const dashboardRoot = join(config.growthRoot, "dashboard");
  mkdirSync(dashboardRoot, { recursive: true });
  const db = new Database(join(dashboardRoot, "chat-sessions.sqlite"), { create: true });
  db.run("pragma journal_mode = WAL");
  db.run("pragma foreign_keys = ON");
  db.run(`
    create table if not exists chat_sessions (
      id text primary key,
      title text not null,
      agent_id text,
      parent_session_id text,
      hermes_session_id text,
      handoff_summary text,
      events_json text not null,
      created_at integer not null,
      updated_at integer not null
    )
  `);
  db.run("create index if not exists chat_sessions_updated_at_idx on chat_sessions(updated_at desc)");
  db.run(`
    create table if not exists chat_settings (
      key text primary key,
      value text not null
    )
  `);
  return db;
}

function upsertSession(db: Database, session: DashboardChatSession): void {
  db.query(
    `insert into chat_sessions (
       id, title, agent_id, parent_session_id, hermes_session_id, handoff_summary,
       events_json, created_at, updated_at
     ) values (
       $id, $title, $agentId, $parentSessionId, $hermesSessionId, $handoffSummary,
       $eventsJson, $createdAt, $updatedAt
     )
     on conflict(id) do update set
       title = excluded.title,
       agent_id = excluded.agent_id,
       parent_session_id = excluded.parent_session_id,
       hermes_session_id = excluded.hermes_session_id,
       handoff_summary = excluded.handoff_summary,
       events_json = excluded.events_json,
       created_at = excluded.created_at,
       updated_at = excluded.updated_at`
  ).run({
    $id: session.id,
    $title: session.title ?? DEFAULT_SESSION_TITLE,
    $agentId: session.agentId ?? null,
    $parentSessionId: session.parentSessionId ?? null,
    $hermesSessionId: session.hermesSessionId ?? null,
    $handoffSummary: session.handoffSummary ?? null,
    $eventsJson: JSON.stringify(session.events ?? []),
    $createdAt: session.createdAt ?? Date.now(),
    $updatedAt: session.updatedAt ?? Date.now()
  });
}

function requireSession(db: Database, sessionId: string): DashboardChatSession {
  const row = db
    .query<ChatSessionRow, { $id: string }>(
      `select id, title, agent_id, parent_session_id, hermes_session_id, handoff_summary,
              events_json, created_at, updated_at
         from chat_sessions
        where id = $id`
    )
    .get({ $id: normalizeExistingId(sessionId) });
  if (!row) throw new Error("chat_session_not_found");
  return mapSessionRow(row);
}

function countSessions(db: Database): number {
  const row = db.query<{ count: number }, []>("select count(*) as count from chat_sessions").get();
  return row?.count ?? 0;
}

function stringSetting(db: Database, key: string): string | undefined {
  const row = db.query<{ value: string }, { $key: string }>("select value from chat_settings where key = $key").get({ $key: key });
  return row?.value;
}

function setActiveSessionId(db: Database, sessionId: string): void {
  db.query(
    `insert into chat_settings(key, value)
     values('active_session_id', $sessionId)
     on conflict(key) do update set value = excluded.value`
  ).run({ $sessionId: sessionId });
}

function mapSessionRow(row: ChatSessionRow): DashboardChatSession {
  return {
    id: row.id,
    title: row.title,
    agentId: row.agent_id ?? undefined,
    parentSessionId: row.parent_session_id ?? undefined,
    hermesSessionId: row.hermes_session_id ?? undefined,
    handoffSummary: row.handoff_summary ?? undefined,
    events: parseEvents(row.events_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeSessionInput(input: unknown, defaultAgentId: string): DashboardChatSession {
  const record = isRecord(input) ? (input as ChatSessionInput) : {};
  const now = Date.now();
  const id = normalizeId(record.id) ?? createSessionId();
  const events = normalizeEvents(record.events);
  return {
    id,
    title: normalizeTitle(record.title ?? titleFromEvents(events)),
    agentId: normalizeOptionalId(record.agentId, "agent_id") ?? defaultAgentId,
    parentSessionId: normalizeOptionalId(record.parentSessionId, "parent_session_id"),
    hermesSessionId: normalizeOptionalId(record.hermesSessionId, "hermes_session_id"),
    handoffSummary: normalizeOptionalText(record.handoffSummary, MAX_HANDOFF_CHARS),
    events,
    createdAt: normalizeTimestamp(record.createdAt) ?? now,
    updatedAt: normalizeTimestamp(record.updatedAt) ?? now
  };
}

function normalizeEvents(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  const events = value.filter(isRecord).slice(-MAX_EVENTS) as Record<string, unknown>[];
  const json = JSON.stringify(events);
  if (json.length <= MAX_EVENT_JSON_CHARS) return events;

  const trimmed: Record<string, unknown>[] = [];
  let total = 2;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    const length = JSON.stringify(event).length + 1;
    if (total + length > MAX_EVENT_JSON_CHARS) break;
    trimmed.unshift(event);
    total += length;
  }
  return trimmed;
}

function parseEvents(value: string): Record<string, unknown>[] {
  try {
    return normalizeEvents(JSON.parse(value));
  } catch {
    return [];
  }
}

function normalizeTitle(value: unknown): string {
  const title = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return (title || DEFAULT_SESSION_TITLE).slice(0, MAX_TITLE_LENGTH);
}

function normalizeId(value: unknown): string | undefined {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id) return undefined;
  if (!/^[a-zA-Z0-9_.:-]{1,160}$/.test(id)) throw new Error("invalid_chat_session_id");
  return id;
}

function normalizeExistingId(value: string): string {
  const id = normalizeId(value);
  if (!id) throw new Error("invalid_chat_session_id");
  return id;
}

function normalizeOptionalId(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const id = typeof value === "string" ? value.trim() : "";
  if (!id) return undefined;
  if (!/^[a-zA-Z0-9_.:-]{1,180}$/.test(id)) throw new Error(`invalid_${label}`);
  return id;
}

function normalizeOptionalText(value: unknown, limit: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, limit) : undefined;
}

function normalizeTimestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function createSessionId(): string {
  return `chat-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

function titleFromEvents(events: Record<string, unknown>[]): string {
  const firstUser = events.find((event) => event.event === "message.user" && typeof event.message === "string");
  return normalizeTitle(firstUser?.message);
}

function displaySessionTitle(session: DashboardChatSession): string {
  return session.title && session.title !== DEFAULT_SESSION_TITLE ? session.title : session.id;
}

function buildHandoffSummary(session: DashboardChatSession): string {
  const messages = transcriptMessages(session.events);
  const recent = messages.slice(-12);
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant")?.content;
  const lastUser = [...messages].reverse().find((message) => message.role === "user")?.content;
  const terminal = [...session.events].reverse().find((event) => typeof event.run_id === "string" && isTerminalEventName(event.event));
  return [
    "# Chat Handoff",
    "",
    "## Goal",
    displaySessionTitle(session),
    "",
    "## Current State",
    lastAssistant ? truncateForHandoff(lastAssistant, 4000) : "No assistant response captured yet.",
    "",
    "## Decisions",
    "No automatic decision extraction was attempted. Treat the recent transcript below as the authoritative context slice.",
    "",
    "## Files / Artifacts Mentioned",
    extractMentionedPaths(messages).join("\n") || "(none detected)",
    "",
    "## Commands / Tools Run",
    toolEvents(session.events).join("\n") || "(none detected)",
    "",
    "## Open Risks",
    terminal ? `Last terminal run event: ${String(terminal.event)}` : "No completed run event captured in this session.",
    "",
    "## Exact Next Step",
    lastUser ? `Continue from the latest user intent: ${truncateForHandoff(lastUser, 1200)}` : "Ask for the next user request.",
    "",
    "## Recent Transcript",
    recent.map((message) => `### ${message.role}\n\n${truncateForHandoff(message.content, 6000)}`).join("\n\n")
  ]
    .join("\n")
    .slice(0, MAX_HANDOFF_CHARS);
}

function transcriptMessages(events: Record<string, unknown>[]): Array<{ role: "user" | "assistant"; content: string }> {
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  let assistant = "";
  const closeAssistant = () => {
    if (assistant.trim()) messages.push({ role: "assistant", content: assistant.trim() });
    assistant = "";
  };
  for (const event of events) {
    const name = typeof event.event === "string" ? event.event : typeof event.type === "string" ? event.type : "";
    if (name === "message.user") {
      closeAssistant();
      const content = typeof event.agentMessage === "string" ? event.agentMessage : typeof event.message === "string" ? event.message : "";
      if (content.trim()) messages.push({ role: "user", content: content.trim() });
      continue;
    }
    if ((name === "message.delta" || name === "response.output_text.delta") && typeof event.delta === "string") {
      assistant += event.delta;
      continue;
    }
    if (name === "run.completed" || name === "response.completed") {
      closeAssistant();
      const output = typeof event.output === "string" ? event.output.trim() : "";
      if (output) messages.push({ role: "assistant", content: output });
    }
  }
  closeAssistant();
  return messages;
}

function extractMentionedPaths(messages: Array<{ content: string }>): string[] {
  const paths = new Set<string>();
  for (const message of messages) {
    for (const match of message.content.matchAll(/(?:\/Users\/chris|~\/\.growth|[\w.-]+\/[\w./-]+\.(?:md|json|csv|txt|log|tsx?|py))/g)) {
      paths.add(`- ${match[0]}`);
      if (paths.size >= 20) return [...paths];
    }
  }
  return [...paths];
}

function toolEvents(events: Record<string, unknown>[]): string[] {
  const lines: string[] = [];
  for (const event of events) {
    const name = typeof event.event === "string" ? event.event : typeof event.type === "string" ? event.type : "";
    const tool = typeof event.tool === "string" ? event.tool : typeof event.name === "string" ? event.name : undefined;
    if (!tool || (!name.includes("tool") && !name.includes("function"))) continue;
    lines.push(`- ${tool}: ${name}`);
    if (lines.length >= 20) break;
  }
  return lines;
}

function isTerminalEventName(value: unknown): boolean {
  return value === "run.completed" || value === "run.failed" || value === "run.cancelled" || value === "response.completed" || value === "response.failed";
}

function truncateForHandoff(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 20)}\n[truncated]`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
