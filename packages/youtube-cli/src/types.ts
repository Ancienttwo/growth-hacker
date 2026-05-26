export type JsonObject = Record<string, unknown>;

export interface CliMeta {
  profile?: string;
  account?: "youtube";
  scopes?: string[];
  nextPageToken?: string;
  [key: string]: unknown;
}

export interface CliSuccess<T = unknown> {
  ok: true;
  data: T;
  meta?: CliMeta;
}

export interface CliFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: CliMeta;
}

export type CliEnvelope<T = unknown> = CliSuccess<T> | CliFailure;

export class CliError extends Error {
  readonly code: string;
  readonly exitCode: number;
  readonly details?: unknown;

  constructor(code: string, message: string, options: { exitCode?: number; details?: unknown } = {}) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.exitCode = options.exitCode ?? 1;
    this.details = options.details;
  }
}

export interface RuntimeConfig {
  profile: string;
  growthRoot: string;
  expectedChannelId?: string;
  expectedChannelTitle?: string;
}
