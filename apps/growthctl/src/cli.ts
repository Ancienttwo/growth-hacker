#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

interface ParsedArgs {
  words: string[];
  flags: Map<string, string | true>;
}

class UsageError extends Error {}

const parsed = parseArgs(process.argv.slice(2));
let baseUrl = "http://127.0.0.1:8787";

try {
  baseUrl = normalizeBaseUrl(
    flagString(parsed, "server") ?? process.env.GROWTH_HACKER_API_BASE_URL ?? baseUrl,
    parsed.flags.has("allow-remote-server"),
  );
  await dispatch(parsed);
} catch (error) {
  const usageError = error instanceof UsageError;
  const message = error instanceof Error ? error.message : String(error);
  writeJson({
    ok: false,
    schemaVersion: "1",
    command: "growthctl",
    requestId: `cli_${crypto.randomUUID().replace(/-/g, "")}`,
    error: { code: usageError ? "invalid_input" : "cli_error", message, retryable: false },
  });
  process.exitCode = usageError ? 2 : 10;
}

async function dispatch(args: ParsedArgs): Promise<void> {
  const [a, b, c, d] = args.words;
  if (!a || a === "help" || args.flags.has("help")) return usage(0);

  if (a === "capabilities" || (a === "tool" && b === "list")) {
    return printApi(await api("GET", "/api/video/commands"));
  }

  if (a === "video" && b === "project" && c === "create") {
    return printApi(await api("POST", "/api/video/projects", readInputJson(requiredFlag(args, "input"))));
  }
  if (a === "video" && b === "project" && c === "list") {
    return printApi(await api("GET", withQuery("/api/video/projects", { limit: flagString(args, "limit") })));
  }
  if (a === "video" && b === "project" && c === "show" && d) {
    return printApi(await api("GET", withQuery(`/api/video/projects/${encodeURIComponent(d)}`, { revision: flagString(args, "revision") })));
  }
  if (a === "video" && b === "project" && c === "revise" && d) {
    return printApi(await api("PATCH", `/api/video/projects/${encodeURIComponent(d)}`, readInputJson(requiredFlag(args, "input"))));
  }
  if (a === "video" && b === "workflow" && c === "start" && d) {
    const headers: Record<string, string> = {};
    const idempotencyKey = flagString(args, "idempotency-key");
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
    return printApi(await api("POST", `/api/video/projects/${encodeURIComponent(d)}/preproduction-runs`, {
      revision: flagInteger(args, "revision"),
      agentId: flagString(args, "agent"),
      provider: flagString(args, "provider"),
      model: flagString(args, "model"),
      maxAttempts: flagInteger(args, "max-attempts"),
    }, headers));
  }
  if (a === "video" && b === "artifacts" && c === "list" && d) {
    return printApi(await api("GET", withQuery(`/api/video/projects/${encodeURIComponent(d)}/artifacts`, { revision: flagString(args, "revision") })));
  }

  if (a === "video" && b === "package" && c === "export" && d) {
    return printApi(await api("POST", `/api/video/projects/${encodeURIComponent(d)}/package-exports`, {
      revision: flagInteger(args, "revision"),
    }));
  }

  if (a === "workflow" && b === "status" && c) {
    return printApi(await api("GET", `/api/video/runs/${encodeURIComponent(c)}`));
  }
  if (a === "workflow" && b === "tick" && c) {
    return printApi(await api("POST", `/api/video/runs/${encodeURIComponent(c)}/tick`, {}));
  }
  if (a === "workflow" && b === "events" && c) {
    if (args.flags.has("follow")) return followEvents(c, flagInteger(args, "after") ?? 0);
    return printApi(await api("GET", withQuery(`/api/video/runs/${encodeURIComponent(c)}/events`, {
      after: flagString(args, "after"),
      limit: flagString(args, "limit"),
    })));
  }
  if (a === "workflow" && b === "retry" && c) {
    return printApi(await api("POST", `/api/video/runs/${encodeURIComponent(c)}/retry`, { stage: flagString(args, "stage") }));
  }
  if (a === "workflow" && b === "cancel" && c) {
    return printApi(await api("POST", `/api/video/runs/${encodeURIComponent(c)}/cancel`, {}));
  }
  if (a === "workflow" && b === "approve" && c) {
    const decision = requiredFlag(args, "decision");
    if (decision !== "approve" && decision !== "reject") throw new UsageError("--decision must be approve or reject");
    const expectedRevision = flagInteger(args, "expected-revision");
    if (!expectedRevision) throw new UsageError("--expected-revision is required");
    return printApi(await api("POST", `/api/video/runs/${encodeURIComponent(c)}/approval`, {
      decision,
      expectedRevision,
      decidedBy: flagString(args, "actor") ?? "operator",
      note: flagString(args, "note"),
    }));
  }

  if (a === "artifact" && b === "get" && c) {
    const out = requiredFlag(args, "out");
    return downloadArtifact(c, out);
  }

  throw new UsageError(`Unknown command: ${args.words.join(" ")}`);
}

async function api(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<{ response: Response; value: unknown }> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "x-request-id": `cli_${crypto.randomUUID().replace(/-/g, "")}`,
    ...extraHeaders,
  };
  let encoded: string | undefined;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    encoded = JSON.stringify(stripUndefined(body));
  }
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: encoded });
  const text = await response.text();
  let value: unknown;
  try {
    value = text ? JSON.parse(text) : {};
  } catch {
    value = {
      ok: false,
      schemaVersion: "1",
      command: "growthctl.http",
      requestId: headers["x-request-id"],
      error: { code: "invalid_server_response", message: text.slice(0, 2_000), retryable: response.status >= 500 },
    };
  }
  return { response, value };
}

function printApi(result: { response: Response; value: unknown }): void {
  writeJson(result.value);
  process.exitCode = exitCode(result.response.status, result.value);
}

async function followEvents(runId: string, after: number): Promise<void> {
  const response = await fetch(`${baseUrl}/api/video/runs/${encodeURIComponent(runId)}/events?follow=1&after=${after}`, {
    headers: { Accept: "text/event-stream" },
  });
  if (!response.ok || !response.body) {
    const value = await response.json().catch(() => ({ error: { code: "event_stream_failed", message: response.statusText } }));
    writeJson(value);
    process.exitCode = exitCode(response.status, value);
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const data = chunk.split(/\r?\n/).find((line) => line.startsWith("data: "))?.slice(6);
      if (!data) continue;
      try {
        process.stdout.write(`${JSON.stringify(JSON.parse(data))}\n`);
      } catch {
        process.stdout.write(`${JSON.stringify({ type: "invalid_event", raw: data })}\n`);
      }
    }
  }
}

async function downloadArtifact(artifactId: string, target: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/video/artifacts/${encodeURIComponent(artifactId)}/raw`);
  if (!response.ok) {
    const value = await response.json().catch(() => ({ error: { code: "artifact_download_failed", message: response.statusText } }));
    writeJson(value);
    process.exitCode = exitCode(response.status, value);
    return;
  }
  const path = resolve(target);
  if (existsSync(path)) throw new UsageError(`Refusing to overwrite existing file: ${path}`);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actualSha256 = createHash("sha256").update(bytes).digest("hex");
  const expectedSha256 = response.headers.get("x-artifact-sha256")?.trim().toLowerCase();
  if (expectedSha256 && expectedSha256 !== actualSha256) {
    throw new Error(`Artifact checksum mismatch: expected ${expectedSha256}, received ${actualSha256}`);
  }
  writeFileSync(path, bytes, { mode: 0o600, flag: "wx" });
  writeJson({
    ok: true,
    schemaVersion: "1",
    command: "video.artifact.download",
    requestId: `cli_${crypto.randomUUID().replace(/-/g, "")}`,
    data: {
      artifactId,
      path,
      filename: basename(path),
      byteSize: bytes.byteLength,
      sha256: actualSha256,
      mediaType: response.headers.get("content-type"),
    },
    artifacts: [],
    warnings: [],
  });
}

function readInputJson(selector: string): unknown {
  const text = selector === "-"
    ? readFileSync(0, "utf8")
    : readFileSync(resolve(selector.startsWith("@") ? selector.slice(1) : selector), "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new UsageError(`Input is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseArgs(values: string[]): ParsedArgs {
  const words: string[] = [];
  const flags = new Map<string, string | true>();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      words.push(value);
      continue;
    }
    const equal = value.indexOf("=");
    if (equal > 2) {
      flags.set(value.slice(2, equal), value.slice(equal + 1));
      continue;
    }
    const key = value.slice(2);
    const next = values[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags.set(key, next);
      index += 1;
    } else {
      flags.set(key, true);
    }
  }
  return { words, flags };
}

function requiredFlag(args: ParsedArgs, name: string): string {
  const value = flagString(args, name);
  if (!value) throw new UsageError(`--${name} is required`);
  return value;
}

function flagString(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function flagInteger(args: ParsedArgs, name: string): number | undefined {
  const value = flagString(args, name);
  if (!value) return undefined;
  if (!/^[1-9]\d*$/.test(value)) throw new UsageError(`--${name} must be a positive integer`);
  return Number(value);
}

function normalizeBaseUrl(value: string, allowRemote: boolean): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UsageError("Server URL must be an absolute http(s) URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new UsageError("Server URL must use http or https");
  if (url.username || url.password) throw new UsageError("Server URL must not contain credentials");
  if (url.search || url.hash) throw new UsageError("Server URL must not contain a query or fragment");
  if (url.pathname !== "/" && url.pathname !== "") throw new UsageError("Server URL must not contain a path prefix");

  const hostname = url.hostname.toLowerCase();
  const loopback = hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "[::1]"
    || hostname.endsWith(".localhost");
  if (!loopback && !allowRemote) {
    throw new UsageError("Refusing a non-loopback server; pass --allow-remote-server explicitly after reviewing transport and authentication");
  }
  if (!loopback && url.protocol !== "https:") {
    throw new UsageError("A remote server must use https");
  }
  return url.origin;
}

function withQuery(path: string, values: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) query.set(key, value);
  const encoded = query.toString();
  return encoded ? `${path}?${encoded}` : path;
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .map(([key, item]) => [key, stripUndefined(item)]));
}

function exitCode(status: number, value: unknown): number {
  if (status >= 200 && status < 300) return 0;
  const code = errorCode(value);
  if (status === 404) return 3;
  if (status === 409) return 4;
  if (status === 428 || code === "approval_required") return 5;
  if (status === 502 || code === "external_provider_failed") return 6;
  if (code === "workflow_terminal" || code === "invalid_state_transition") return 7;
  if (status >= 400 && status < 500) return 2;
  return 10;
}

function errorCode(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const error = (value as { error?: unknown }).error;
  return error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : undefined;
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function usage(exit = 2): void {
  process.stderr.write(`growthctl — Growth Hacker local command adapter\n\nCommands:\n  capabilities\n  video project create --input @project.json\n  video project list [--limit N]\n  video project show <projectId> [--revision N]\n  video project revise <projectId> --input @revision.json\n  video workflow start <projectId> [--revision N] [--idempotency-key KEY] [--agent AGENT] [--provider PROVIDER] [--model MODEL] [--max-attempts N]\n  video artifacts list <projectId> [--revision N]\n  video package export <projectId> [--revision N]\n  workflow status <runId>\n  workflow events <runId> [--after N] [--follow]\n  workflow tick <runId>\n  workflow retry <runId> [--stage NAME]\n  workflow cancel <runId>\n  workflow approve <runId> --decision approve|reject --expected-revision N\n  artifact get <artifactId> --out FILE\n\nWorkflow start options:\n  --agent AGENT       Hermes agent/profile override; defaults to server config\n  --provider PROVIDER Hermes provider override, for example xai-oauth\n  --model MODEL       Provider model override, for example grok-4.3\n  --max-attempts N    Positive integer retry cap for each preproduction step\n\nGlobal:\n  --server URL             Default: GROWTH_HACKER_API_BASE_URL or http://127.0.0.1:8787\n  --allow-remote-server    Permit an explicit non-loopback https server URL\n`);
  process.exitCode = exit;
}
