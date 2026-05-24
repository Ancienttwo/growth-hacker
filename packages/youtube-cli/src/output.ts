import { CliError, type CliEnvelope, type CliFailure, type CliMeta, type CliSuccess } from "./types";

export interface OutputMode {
  json: boolean;
  stdout?: Pick<typeof process.stdout, "write">;
  stderr?: Pick<typeof process.stderr, "write">;
}

const SECRET_PATTERNS = [
  /(access_token["']?\s*[:=]\s*["']?)[^"',\s}]+/gi,
  /(refresh_token["']?\s*[:=]\s*["']?)[^"',\s}]+/gi,
  /(client_secret["']?\s*[:=]\s*["']?)[^"',\s}]+/gi,
  /(Authorization:\s*Bearer\s+)[^\s]+/gi
];

export function success<T>(data: T, meta?: CliMeta): CliSuccess<T> {
  return meta ? { ok: true, data, meta } : { ok: true, data };
}

export function failure(error: unknown, meta?: CliMeta): CliFailure {
  if (error instanceof CliError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {})
      },
      ...(meta ? { meta } : {})
    };
  }
  return {
    ok: false,
    error: {
      code: "youtube_cli_failed",
      message: error instanceof Error ? error.message : String(error)
    },
    ...(meta ? { meta } : {})
  };
}

export function exitCodeFor(error: unknown): number {
  return error instanceof CliError ? error.exitCode : 1;
}

export function writeEnvelope(envelope: CliEnvelope, mode: OutputMode): void {
  const stdout = mode.stdout ?? process.stdout;
  const stderr = mode.stderr ?? process.stderr;
  if (mode.json) {
    stdout.write(`${redact(JSON.stringify(envelope, null, 2))}\n`);
    return;
  }
  if (envelope.ok) {
    stdout.write(`${humanize(envelope.data)}\n`);
  } else {
    stderr.write(`${envelope.error.code}: ${redact(envelope.error.message)}\n`);
  }
}

export function redact(value: string): string {
  return SECRET_PATTERNS.reduce((next, pattern) => next.replace(pattern, "$1[REDACTED]"), value);
}

function humanize(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const lines = Object.entries(value as Record<string, unknown>).map(([key, item]) => `${key}: ${formatValue(item)}`);
    return lines.length ? lines.join("\n") : "{}";
  }
  return String(value);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
