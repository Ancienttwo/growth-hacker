import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import { join } from "node:path";

import { Database } from "bun:sqlite";
import type {
  HermesContextSnapshot,
  HermesGatewayEvent,
  HermesGatewayEventKind,
  HermesMessageSummary,
  HermesSessionSummary,
  HermesToolCallSummary
} from "@growth-hacker/core";

import type { AppConfig } from "./config";

export interface HermesContextOptions {
  gatewayLimit?: number;
  limit?: number;
  messageLimit?: number;
  query?: string;
  sessionId?: string;
  source?: string;
}

interface HermesSessionRow {
  id: string;
  source: string;
  user_id: string | null;
  model: string | null;
  parent_session_id: string | null;
  started_at: number | null;
  ended_at: number | null;
  end_reason: string | null;
  message_count: number | null;
  tool_call_count: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  reasoning_tokens: number | null;
  title: string | null;
  api_call_count: number | null;
}

interface HermesMessageRow {
  id: number;
  session_id: string;
  role: string;
  content: string | null;
  tool_call_id: string | null;
  tool_calls: string | null;
  tool_name: string | null;
  timestamp: number | null;
  token_count: number | null;
  finish_reason: string | null;
}

const DEFAULT_SESSION_LIMIT = 16;
const DEFAULT_MESSAGE_LIMIT = 80;
const DEFAULT_GATEWAY_LIMIT = 80;
const MAX_SESSION_LIMIT = 80;
const MAX_MESSAGE_LIMIT = 200;
const MAX_GATEWAY_LIMIT = 240;
const MAX_MESSAGE_PREVIEW = 2400;
const MAX_TOOL_ARGS_PREVIEW = 1200;
const MAX_LOG_TAIL_BYTES = 768 * 1024;

export function readHermesContextSnapshot(config: AppConfig, options: HermesContextOptions = {}): HermesContextSnapshot {
  const stateDbPath = join(config.hermesHome, "state.db");
  const gatewayLogPath = join(config.hermesHome, "logs", "gateway.log");
  const query = normalizeQuery(options.query);
  const source = normalizeSource(options.source);
  const limit = clampInteger(options.limit, DEFAULT_SESSION_LIMIT, 1, MAX_SESSION_LIMIT);
  const messageLimit = clampInteger(options.messageLimit, DEFAULT_MESSAGE_LIMIT, 1, MAX_MESSAGE_LIMIT);
  const gatewayLimit = clampInteger(options.gatewayLimit, DEFAULT_GATEWAY_LIMIT, 1, MAX_GATEWAY_LIMIT);

  const stateDbAvailable = existsSync(stateDbPath);
  const gatewayLogAvailable = existsSync(gatewayLogPath);
  const sessions = stateDbAvailable ? readHermesSessions(stateDbPath, { limit, query, source }) : [];
  let selectedSessionId = normalizeSessionId(options.sessionId) ?? sessions.find((session) => session.messageCount > 0)?.id ?? sessions[0]?.id;
  let messages =
    stateDbAvailable && selectedSessionId ? readHermesMessages(stateDbPath, { limit: messageLimit, query, sessionId: selectedSessionId }) : [];
  if (stateDbAvailable && !options.sessionId && !messages.length) {
    for (const session of sessions) {
      if (session.id === selectedSessionId) continue;
      const nextMessages = readHermesMessages(stateDbPath, { limit: messageLimit, query, sessionId: session.id });
      if (nextMessages.length) {
        selectedSessionId = session.id;
        messages = nextMessages;
        break;
      }
    }
  }
  const gatewayEvents = gatewayLogAvailable
    ? readHermesGatewayEvents(gatewayLogPath, { limit: gatewayLimit, query, sessionId: options.sessionId ? selectedSessionId : undefined })
    : [];

  return {
    generatedAt: new Date().toISOString(),
    sourcePaths: {
      stateDb: stateDbPath,
      gatewayLog: gatewayLogPath
    },
    available: {
      stateDb: stateDbAvailable,
      gatewayLog: gatewayLogAvailable
    },
    query,
    selectedSessionId,
    sessions,
    messages,
    gatewayEvents
  };
}

function readHermesSessions(
  dbPath: string,
  options: { limit: number; query?: string; source?: string }
): HermesSessionSummary[] {
  const clauses: string[] = [];
  const params: Record<string, string | number> = { limit: options.limit };
  if (options.source) {
    clauses.push("source = $source");
    params.source = options.source;
  }
  if (options.query) {
    clauses.push(`(
      id LIKE $query OR source LIKE $query OR model LIKE $query OR title LIKE $query OR exists (
        select 1 from messages
         where messages.session_id = sessions.id
           and (messages.content LIKE $query OR messages.tool_calls LIKE $query OR messages.tool_name LIKE $query)
      )
    )`);
    params.query = `%${escapeLike(options.query)}%`;
  }

  const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
  const db = new Database(dbPath, { readonly: true, strict: true });
  try {
    const rows = db
      .query<HermesSessionRow, Record<string, string | number>>(
        `select id, source, user_id, model, parent_session_id, started_at, ended_at, end_reason,
                message_count, tool_call_count, input_tokens, output_tokens, cache_read_tokens,
                cache_write_tokens, reasoning_tokens, title, api_call_count
           from sessions
           ${where}
           order by started_at desc
           limit $limit`
      )
      .all(params);
    return rows.map(mapSessionRow);
  } finally {
    db.close();
  }
}

function readHermesMessages(
  dbPath: string,
  options: { limit: number; query?: string; sessionId: string }
): HermesMessageSummary[] {
  const clauses = ["session_id = $sessionId"];
  const params: Record<string, string | number> = { limit: options.limit, sessionId: options.sessionId };
  if (options.query) {
    clauses.push("(content LIKE $query OR tool_calls LIKE $query OR tool_name LIKE $query OR role LIKE $query)");
    params.query = `%${escapeLike(options.query)}%`;
  }

  const db = new Database(dbPath, { readonly: true, strict: true });
  try {
    const rows = db
      .query<HermesMessageRow, Record<string, string | number>>(
        `select id, session_id, role, content, tool_call_id, tool_calls, tool_name, timestamp, token_count, finish_reason
           from messages
          where ${clauses.join(" and ")}
          order by timestamp desc, id desc
          limit $limit`
      )
      .all(params);
    return rows.reverse().map(mapMessageRow);
  } finally {
    db.close();
  }
}

function readHermesGatewayEvents(
  path: string,
  options: { limit: number; query?: string; sessionId?: string }
): HermesGatewayEvent[] {
  const tail = readTail(path, MAX_LOG_TAIL_BYTES);
  const lines = tail.split(/\r?\n/).filter(Boolean);
  const events = lines.flatMap((line, index) => parseGatewayLogLine(line, index) ?? []);
  const query = options.query?.toLowerCase();
  const filtered = events.filter((event) => {
    if (options.sessionId && !gatewayEventText(event).includes(options.sessionId)) return false;
    if (query && !gatewayEventText(event).toLowerCase().includes(query)) return false;
    return true;
  });
  return filtered.slice(-options.limit);
}

function mapSessionRow(row: HermesSessionRow): HermesSessionSummary {
  return {
    id: row.id,
    source: row.source,
    model: stringValue(row.model),
    title: stringValue(row.title),
    userId: stringValue(row.user_id),
    parentSessionId: stringValue(row.parent_session_id),
    startedAt: timestampToIso(row.started_at),
    endedAt: timestampToIso(row.ended_at),
    endReason: stringValue(row.end_reason),
    messageCount: numberValue(row.message_count),
    toolCallCount: numberValue(row.tool_call_count),
    apiCallCount: numberValue(row.api_call_count),
    tokens: {
      input: numberValue(row.input_tokens),
      output: numberValue(row.output_tokens),
      cacheRead: numberValue(row.cache_read_tokens),
      cacheWrite: numberValue(row.cache_write_tokens),
      reasoning: numberValue(row.reasoning_tokens)
    }
  };
}

function mapMessageRow(row: HermesMessageRow): HermesMessageSummary {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    contentPreview: truncate(redactSecrets(row.content ?? ""), MAX_MESSAGE_PREVIEW),
    toolCallId: stringValue(row.tool_call_id),
    toolName: stringValue(row.tool_name),
    toolCalls: parseToolCalls(row.tool_calls),
    timestamp: timestampToIso(row.timestamp),
    tokenCount: optionalNumber(row.token_count),
    finishReason: stringValue(row.finish_reason)
  };
}

function parseToolCalls(raw: string | null): HermesToolCallSummary[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const values = Array.isArray(parsed) ? parsed : [parsed];
    return values.flatMap((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const record = value as Record<string, unknown>;
      const fn = record.function && typeof record.function === "object" ? (record.function as Record<string, unknown>) : undefined;
      const name = stringValue(fn?.name) ?? stringValue(record.name) ?? "tool";
      const args = fn?.arguments ?? record.arguments ?? record.args;
      return [
        {
          id: stringValue(record.id) ?? stringValue(record.call_id) ?? stringValue(record.tool_call_id),
          name,
          argumentsPreview: args === undefined ? undefined : truncate(redactSecrets(typeof args === "string" ? args : JSON.stringify(args)), MAX_TOOL_ARGS_PREVIEW)
        }
      ];
    });
  } catch {
    return [{ name: "tool", argumentsPreview: truncate(redactSecrets(raw), MAX_TOOL_ARGS_PREVIEW) }];
  }
}

function parseGatewayLogLine(line: string, index: number): HermesGatewayEvent | null {
  const match = /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},\d{3})\s+([A-Z]+)\s+(?:(\[[^\]]+\])\s+)?([^:]+):\s+(.*)$/.exec(line);
  if (!match) {
    const message = truncate(redactSecrets(line), MAX_MESSAGE_PREVIEW);
    return { id: `log-${index}`, kind: "log", level: "INFO", message };
  }

  const [, rawTimestamp, level, contextRaw, logger, rawMessage] = match;
  const message = truncate(redactSecrets(rawMessage), MAX_MESSAGE_PREVIEW);
  const event: HermesGatewayEvent = {
    id: `${rawTimestamp}-${index}`,
    kind: gatewayEventKind(message),
    level,
    timestamp: logTimestampToIso(rawTimestamp),
    logger,
    context: contextRaw?.slice(1, -1),
    message
  };

  const inbound = /inbound message:\s+platform=(\S+)\s+user=(.*?)\s+chat=(\S+)\s+msg='([\s\S]*)'$/.exec(message);
  if (inbound) {
    event.kind = "inbound";
    event.platform = inbound[1];
    event.user = inbound[2];
    event.chat = inbound[3];
    event.message = truncate(`${inbound[4]}`, MAX_MESSAGE_PREVIEW);
  }

  const response = /response ready:\s+platform=(\S+)\s+chat=(\S+)\s+time=([\d.]+)s\s+api_calls=(\d+)\s+response=(\d+)\s+chars/.exec(message);
  if (response) {
    event.kind = "response";
    event.platform = response[1];
    event.chat = response[2];
    event.durationSeconds = Number(response[3]);
    event.apiCalls = Number(response[4]);
    event.responseChars = Number(response[5]);
  }

  const split = /Session split detected:\s+(\S+)\s+→\s+(\S+)\s+\(([^)]+)\)/.exec(message);
  if (split) {
    event.kind = "compression";
    event.fromSessionId = split[1];
    event.toSessionId = split[2];
  }

  return event;
}

function gatewayEventKind(message: string): HermesGatewayEventKind {
  if (message.includes("inbound message:")) return "inbound";
  if (message.includes("response ready:")) return "response";
  if (message.includes("Session split detected:")) return "compression";
  if (message.includes("provider") || message.includes("Provider")) return "provider";
  if (message.includes("Connected") || message.includes("Disconnected") || message.includes("Gateway")) return "lifecycle";
  return "log";
}

function gatewayEventText(event: HermesGatewayEvent): string {
  return [
    event.message,
    event.context,
    event.logger,
    event.platform,
    event.chat,
    event.user,
    event.fromSessionId,
    event.toSessionId
  ]
    .filter(Boolean)
    .join("\n");
}

function readTail(path: string, maxBytes: number): string {
  const size = statSync(path).size;
  const length = Math.min(size, maxBytes);
  const start = Math.max(size - length, 0);
  const buffer = Buffer.alloc(length);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buffer, 0, length, start);
  } finally {
    closeSync(fd);
  }
  const text = buffer.toString("utf8");
  const firstNewline = text.indexOf("\n");
  return start > 0 && firstNewline >= 0 ? text.slice(firstNewline + 1) : text;
}

function logTimestampToIso(value: string): string | undefined {
  const date = new Date(value.replace(",", "."));
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function timestampToIso(value: number | null): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return new Date(value * 1000).toISOString();
}

function normalizeQuery(value: unknown): string | undefined {
  const query = typeof value === "string" ? value.trim() : "";
  return query ? query.slice(0, 160) : undefined;
}

function normalizeSessionId(value: unknown): string | undefined {
  const sessionId = typeof value === "string" ? value.trim() : "";
  if (!sessionId) return undefined;
  if (!/^[a-zA-Z0-9_.:-]+$/.test(sessionId)) throw new Error("invalid_hermes_session_id");
  return sessionId.slice(0, 180);
}

function normalizeSource(value: unknown): string | undefined {
  const source = typeof value === "string" ? value.trim() : "";
  if (!source) return undefined;
  if (!/^[a-zA-Z0-9_.:-]+$/.test(source)) throw new Error("invalid_hermes_source");
  return source.slice(0, 80);
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed as number, min), max);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function numberValue(value: unknown): number {
  return optionalNumber(value) ?? 0;
}

function truncate(value: string, maxChars: number): string {
  const normalized = value.replace(/\0/g, "").trim();
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}\n[truncated:${normalized.length - maxChars} chars]` : normalized;
}

function redactSecrets(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|authorization|cookie|password|secret|token)\s*[:=]\s*)[^\s'",)]+/gi, "$1[REDACTED]")
    .replace(/(Auth file:\s+).+/gi, "$1[REDACTED]");
}

function escapeLike(value: string): string {
  return value.replace(/[%_]/g, "\\$&");
}
