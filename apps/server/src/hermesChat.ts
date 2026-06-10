import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { AppConfig } from "./config";
import { assertAllowedHermesAgent } from "./hermesProfiles";

export interface HermesChatStatus {
  available: boolean;
  baseUrl: string;
  error?: string;
  authRequired?: boolean;
  health?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
}

export interface HermesChatMessage {
  role: string;
  content: string;
}

export interface CreateHermesChatRunInput {
  agentId?: string;
  input: string | HermesChatMessage[];
  sessionId?: string;
  hermesSessionId?: string;
  instructions?: string;
  model?: string;
  provider?: string;
  permissionMode?: string;
  reasoningEffort?: string;
}

export interface HermesChatRun {
  runId: string;
  status: string;
  sessionId: string;
  hermesSessionId: string;
}

export interface HermesChatRunStatus {
  runId: string;
  status: string;
  sessionId?: string;
  model?: string;
  lastEvent?: string;
  output?: string;
  error?: unknown;
  usage?: Record<string, number>;
  updatedAt?: number;
  createdAt?: number;
}

export interface HermesApprovalInput {
  choice?: string;
}

type HermesPermissionMode = "full_access" | "ask" | "read_only";
type HermesReasoningEffort = "low" | "medium" | "high" | "xhigh";

class HermesHttpError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export async function getHermesChatStatus(config: AppConfig): Promise<HermesChatStatus> {
  try {
    const health = await hermesJson<Record<string, unknown>>(config, "/health/detailed", { auth: false, timeoutMs: 2500 });
    try {
      const capabilities = await hermesJson<Record<string, unknown>>(config, "/v1/capabilities", { timeoutMs: 2500 });
      return {
        available: true,
        baseUrl: config.hermesApiBaseUrl,
        health,
        capabilities
      };
    } catch (error) {
      if (error instanceof HermesHttpError && (error.status === 401 || error.status === 403)) {
        return {
          available: false,
          authRequired: true,
          baseUrl: config.hermesApiBaseUrl,
          error: "hermes_api_auth_required",
          health
        };
      }
      throw error;
    }
  } catch (error) {
    return {
      available: false,
      baseUrl: config.hermesApiBaseUrl,
      error: error instanceof Error ? error.message : "hermes_api_unavailable"
    };
  }
}

export async function createHermesChatRun(config: AppConfig, input: CreateHermesChatRunInput): Promise<HermesChatRun> {
  const agentId = normalizeAgentId(input.agentId ?? config.defaultHermesProfile);
  assertAllowedAgent(config, agentId);
  const sessionId = normalizeSessionPart(input.sessionId ?? "chat");
  const hermesSessionId = normalizeHermesSessionId(input.hermesSessionId) ?? `growth-hacker:${normalizeSessionPart(agentId)}:${sessionId}`;
  const normalizedInput = normalizeInput(input.input);
  const permissionMode = normalizePermissionMode(input.permissionMode);
  const reasoningEffort = normalizeReasoningEffort(input.reasoningEffort);
  const model = normalizeModel(input.model);
  const provider = normalizeProvider(input.provider);

  const body: Record<string, unknown> = {
    input: normalizedInput,
    session_id: hermesSessionId,
    metadata: {
      agent_id: agentId,
      provider,
      permission_mode: permissionMode,
      reasoning_effort: reasoningEffort
    }
  };
  const instructions = buildProfileInstructions(config, agentId, input.instructions);
  if (instructions) body.instructions = instructions;
  if (model) body.model = model;
  if (provider) body.provider = provider;
  if (permissionMode) body.permission_mode = permissionMode;
  if (reasoningEffort) body.reasoning_effort = reasoningEffort;

  const payload = await hermesJson<{ run_id?: string; id?: string; status?: string }>(config, "/v1/runs", {
    method: "POST",
    headers: hermesHeaders(config, hermesSessionId),
    body: JSON.stringify(body),
    timeoutMs: 15000,
    auth: false
  });
  const runId = payload.run_id ?? payload.id ?? "";
  assertRunId(runId);
  return {
    runId,
    status: payload.status ?? "started",
    sessionId,
    hermesSessionId
  };
}

export async function streamHermesRunEvents(config: AppConfig, runId: string): Promise<Response> {
  assertRunId(runId);
  const response = await fetch(hermesUrl(config, `/v1/runs/${encodeURIComponent(runId)}/events`), {
    headers: hermesHeaders(config)
  });
  if (!response.ok) {
    return new Response(await response.text(), {
      status: response.status,
      headers: response.headers
    });
  }
  return new Response(response.body, {
    status: response.status,
    headers: {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": response.headers.get("Content-Type") ?? "text/event-stream"
    }
  });
}

export async function getHermesRun(config: AppConfig, runId: string): Promise<HermesChatRunStatus> {
  assertRunId(runId);
  const payload = await hermesJson<Record<string, unknown>>(config, `/v1/runs/${encodeURIComponent(runId)}`, {
    headers: hermesHeaders(config),
    timeoutMs: 5000,
    auth: false
  });
  return {
    runId: stringValue(payload.run_id) || runId,
    status: stringValue(payload.status) || "unknown",
    sessionId: stringValue(payload.session_id),
    model: stringValue(payload.model),
    lastEvent: stringValue(payload.last_event),
    output: stringValue(payload.output),
    error: payload.error,
    usage: recordValue(payload.usage) as Record<string, number> | undefined,
    updatedAt: numberValue(payload.updated_at),
    createdAt: numberValue(payload.created_at)
  };
}

export async function approveHermesRun(config: AppConfig, runId: string, input: HermesApprovalInput): Promise<{ ok: true }> {
  assertRunId(runId);
  const choice = typeof input.choice === "string" && input.choice.trim() ? input.choice.trim() : "once";
  await hermesJson(config, `/v1/runs/${encodeURIComponent(runId)}/approval`, {
    method: "POST",
    headers: hermesHeaders(config),
    body: JSON.stringify({ choice }),
    timeoutMs: 10000,
    auth: false
  });
  return { ok: true };
}

export async function stopHermesRun(config: AppConfig, runId: string): Promise<{ ok: true }> {
  assertRunId(runId);
  await hermesJson(config, `/v1/runs/${encodeURIComponent(runId)}/stop`, {
    method: "POST",
    headers: hermesHeaders(config),
    timeoutMs: 10000,
    auth: false
  });
  return { ok: true };
}

export function hermesErrorStatus(error: unknown, fallback = 400): number {
  return error instanceof HermesHttpError ? error.status : fallback;
}

function normalizeInput(input: CreateHermesChatRunInput["input"]): string | HermesChatMessage[] {
  if (typeof input === "string") {
    const value = input.trim();
    if (!value) throw new Error("chat_input_required");
    return value;
  }
  if (!Array.isArray(input) || !input.length) throw new Error("chat_input_required");
  return input.map((message) => {
    if (!message || typeof message.role !== "string" || typeof message.content !== "string") {
      throw new Error("invalid_chat_message");
    }
    const role = message.role.trim();
    const content = message.content.trim();
    if (!role || !content) throw new Error("invalid_chat_message");
    return { role, content };
  });
}

function normalizeAgentId(value: string): string {
  const agentId = value.trim();
  if (!agentId) throw new Error("agent_required");
  if (!/^[a-zA-Z0-9_.:-]+$/.test(agentId)) throw new Error(`invalid_agent_id:${agentId}`);
  return agentId;
}

function normalizeHermesSessionId(value: string | undefined): string | undefined {
  const sessionId = value?.trim();
  if (!sessionId) return undefined;
  if (!/^[a-zA-Z0-9_.:-]+$/.test(sessionId)) throw new Error("invalid_hermes_session_id");
  return sessionId.slice(0, 160);
}

function normalizePermissionMode(value: string | undefined): HermesPermissionMode | undefined {
  if (value === undefined || value === "") return undefined;
  if (value === "full_access" || value === "ask" || value === "read_only") return value;
  throw new Error(`invalid_permission_mode:${value}`);
}

function normalizeReasoningEffort(value: string | undefined): HermesReasoningEffort | undefined {
  if (value === undefined || value === "") return undefined;
  if (value === "low" || value === "medium" || value === "high" || value === "xhigh") return value;
  throw new Error(`invalid_reasoning_effort:${value}`);
}

function normalizeModel(value: string | undefined): string | undefined {
  const model = value?.trim();
  if (!model) return undefined;
  if (!/^[a-zA-Z0-9_.:/-]{1,128}$/.test(model)) throw new Error("invalid_model");
  return model;
}

function normalizeProvider(value: string | undefined): string | undefined {
  const provider = value?.trim();
  if (!provider) return undefined;
  if (!/^[a-zA-Z0-9_.:-]{1,80}$/.test(provider)) throw new Error("invalid_provider");
  return provider;
}

function assertAllowedAgent(config: AppConfig, agentId: string): void {
  assertAllowedHermesAgent(config, agentId);
}

function assertRunId(runId: string): void {
  if (!/^run_[a-f0-9]+$/i.test(runId)) throw new Error("invalid_hermes_run_id");
}

function buildProfileInstructions(config: AppConfig, agentId: string, runInstructions?: string): string {
  const profileSoul = readProfileSoul(config, agentId);
  const taskInstructions = runInstructions?.trim();
  return [
    profileSoul
      ? [
          `Hermes profile boundary: act as the \`${agentId}\` profile, not as the default/coordinator profile.`,
          "The profile specification below outranks chat text and dashboard skill hints.",
          "",
          profileSoul
        ].join("\n")
      : "",
    taskInstructions ? `Run instructions:\n${taskInstructions}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

function readProfileSoul(config: AppConfig, agentId: string): string {
  const soulPath = agentId === "default" ? join(config.hermesHome, "SOUL.md") : join(config.hermesHome, "profiles", agentId, "SOUL.md");
  if (!existsSync(soulPath)) return "";
  try {
    return readFileSync(soulPath, "utf8").trim();
  } catch {
    return "";
  }
}

function normalizeSessionPart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.:-]+/g, "_").slice(0, 96) || "chat";
}

async function hermesJson<T>(config: AppConfig, path: string, options: RequestInit & { auth?: boolean; timeoutMs?: number } = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10000);
  try {
    const headers = new Headers(options.headers);
    if (options.auth !== false) applyHermesAuthHeaders(config, headers);
    const response = await fetch(hermesUrl(config, path), {
      ...options,
      headers,
      signal: controller.signal
    });
    if (!response.ok) throw new HermesHttpError(await hermesErrorMessage(response), response.status);
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("hermes_api_timeout");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function hermesUrl(config: AppConfig, path: string): string {
  return `${config.hermesApiBaseUrl}${path}`;
}

function hermesHeaders(config: AppConfig, sessionKey?: string): Headers {
  const headers = new Headers({ "Content-Type": "application/json" });
  applyHermesAuthHeaders(config, headers);
  if (config.hermesApiKey && sessionKey) headers.set("X-Hermes-Session-Key", sessionKey);
  return headers;
}

function applyHermesAuthHeaders(config: AppConfig, headers: Headers): void {
  if (config.hermesApiKey) headers.set("Authorization", `Bearer ${config.hermesApiKey}`);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

async function hermesErrorMessage(response: Response): Promise<string> {
  const fallback = `${response.status} ${response.statusText}`.trim();
  try {
    const payload = (await response.json()) as { error?: string | { message?: string }; message?: string };
    if (typeof payload.error === "string") return payload.error;
    return payload.error?.message ?? payload.message ?? fallback;
  } catch {
    return fallback;
  }
}
