import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";

import { CliError, type RuntimeConfig } from "./types";

export const YOUTUBE_ACCOUNT = "youtube";
export const TOKEN_REFRESH_SKEW_MS = 60_000;

export const YOUTUBE_SCOPES = {
  read: "https://www.googleapis.com/auth/youtube.readonly",
  upload: "https://www.googleapis.com/auth/youtube.upload",
  operate: "https://www.googleapis.com/auth/youtube.force-ssl"
} as const;

const YOUTUBE_FULL_SCOPE = "https://www.googleapis.com/auth/youtube";

export type ScopePreset = keyof typeof YOUTUBE_SCOPES | "full";

export interface YoutubeCliSettings {
  defaultProfile?: string;
  oauthClientFile?: string;
  defaultAuthScope?: string;
  authOpenBrowser?: boolean;
  authForceConsent?: boolean;
  authTimeoutMs?: number;
  authLoginHint?: string;
  expectedChannelId?: string;
  expectedChannelTitle?: string;
}

export interface ProjectSettings {
  configDir: string;
  growthRoot?: string;
  youtube: YoutubeCliSettings;
}

export function buildRuntimeConfig(input: {
  profile?: string;
  growthRoot?: string;
  cwd?: string;
  expectedChannelId?: string;
  expectedChannelTitle?: string;
} = {}): RuntimeConfig {
  const project = loadProjectSettings(input.cwd);
  const configuredGrowthRoot = input.growthRoot ?? process.env.GROWTH_HACKER_HOME;
  const expectedChannelId = firstNonEmpty(input.expectedChannelId, process.env.YT_CLI_EXPECTED_CHANNEL_ID, project.youtube.expectedChannelId);
  const expectedChannelTitle = firstNonEmpty(input.expectedChannelTitle, process.env.YT_CLI_EXPECTED_CHANNEL_TITLE, project.youtube.expectedChannelTitle);
  return {
    profile: assertSafeProfile(input.profile ?? process.env.YOUTUBE_PROFILE ?? project.youtube.defaultProfile ?? "default"),
    growthRoot: configuredGrowthRoot
      ? expandHome(configuredGrowthRoot)
      : project.growthRoot
        ? expandConfigPath(project.growthRoot, project.configDir)
        : expandHome("~/.growth"),
    ...(expectedChannelId ? { expectedChannelId } : {}),
    ...(expectedChannelTitle ? { expectedChannelTitle } : {})
  };
}

export function expandHome(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return resolve(homedir(), value.slice(2));
  return resolve(value);
}

export function expandConfigPath(value: string, baseDir: string): string {
  if (value === "~" || value.startsWith("~/")) return expandHome(value);
  if (isAbsolute(value)) return value;
  return resolve(baseDir, value);
}

export function loadProjectSettings(cwd = process.cwd()): ProjectSettings {
  const configPath = resolve(cwd, "growth-hacker.config.json");
  if (!existsSync(configPath)) return { configDir: cwd, youtube: {} };

  const raw = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new CliError("youtube_config_invalid", "growth-hacker.config.json must be a JSON object.", { exitCode: 2 });
  }
  const record = raw as Record<string, unknown>;
  return {
    configDir: dirname(configPath),
    growthRoot: optionalString(record, "growthRoot"),
    youtube: normalizeYoutubeSettings(record.youtube)
  };
}

export function loadYoutubeSettings(cwd = process.cwd()): YoutubeCliSettings {
  return loadProjectSettings(cwd).youtube;
}

export function assertSafeProfile(profile: string): string {
  const trimmed = profile.trim();
  if (!trimmed || trimmed === "." || trimmed === ".." || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(trimmed)) {
    throw new CliError("youtube_invalid_profile", "Profile must be a safe workspace segment such as `workspace-user`.");
  }
  return trimmed;
}

export function expandScopeInput(value: string | undefined): string[] {
  const raw = value?.trim() || "read";
  const scopes = new Set<string>();
  for (const item of raw.split(",").map((part) => part.trim()).filter(Boolean)) {
    if (item === "full") {
      scopes.add(YOUTUBE_SCOPES.read);
      scopes.add(YOUTUBE_SCOPES.upload);
      scopes.add(YOUTUBE_SCOPES.operate);
    } else if (item in YOUTUBE_SCOPES) {
      scopes.add(YOUTUBE_SCOPES[item as keyof typeof YOUTUBE_SCOPES]);
    } else if (item.startsWith("https://www.googleapis.com/auth/")) {
      scopes.add(item);
    } else {
      throw new CliError("youtube_invalid_scope", `Unknown YouTube scope preset: ${item}`);
    }
  }
  return [...scopes];
}

export function hasReadScope(scopes: string[]): boolean {
  return scopes.includes(YOUTUBE_SCOPES.read) || scopes.includes(YOUTUBE_SCOPES.operate) || scopes.includes(YOUTUBE_FULL_SCOPE);
}

export function requireReadScope(scopes: string[]): void {
  if (!hasReadScope(scopes)) {
    throw new CliError("youtube_scope_missing", "Token is missing read scope. Re-run auth with `--scope read`.");
  }
}

export function hasUploadScope(scopes: string[]): boolean {
  return scopes.includes(YOUTUBE_SCOPES.upload) || scopes.includes(YOUTUBE_SCOPES.operate) || scopes.includes(YOUTUBE_FULL_SCOPE);
}

export function requireUploadScope(scopes: string[]): void {
  if (!hasUploadScope(scopes)) {
    throw new CliError("youtube_scope_missing", "Token is missing upload scope. Re-run auth with `--scope upload`.");
  }
}

export function hasOperateScope(scopes: string[]): boolean {
  return scopes.includes(YOUTUBE_SCOPES.operate) || scopes.includes(YOUTUBE_FULL_SCOPE);
}

export function requireOperateScope(scopes: string[]): void {
  if (!hasOperateScope(scopes)) {
    throw new CliError("youtube_scope_missing", "Token is missing operate scope. Re-run auth with `--scope operate`.");
  }
}

export function parseMaxResults(value: string | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new CliError("youtube_invalid_max_results", `--max-results must be an integer from 1 to ${max}.`);
  }
  return parsed;
}

function normalizeYoutubeSettings(value: unknown): YoutubeCliSettings {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CliError("youtube_config_invalid", "`youtube` config must be an object.", { exitCode: 2 });
  }
  const record = value as Record<string, unknown>;
  const defaultAuthScope = optionalString(record, "defaultAuthScope");
  if (defaultAuthScope) expandScopeInput(defaultAuthScope);
  return {
    defaultProfile: optionalString(record, "defaultProfile"),
    oauthClientFile: optionalString(record, "oauthClientFile"),
    ...(defaultAuthScope ? { defaultAuthScope } : {}),
    authOpenBrowser: optionalBoolean(record, "authOpenBrowser"),
    authForceConsent: optionalBoolean(record, "authForceConsent"),
    authTimeoutMs: optionalInteger(record, "authTimeoutMs", 1000, 600_000),
    authLoginHint: optionalString(record, "authLoginHint"),
    expectedChannelId: optionalString(record, "expectedChannelId"),
    expectedChannelTitle: optionalString(record, "expectedChannelTitle")
  };
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new CliError("youtube_config_invalid", `Config field ${key} must be a string.`, { exitCode: 2 });
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new CliError("youtube_config_invalid", `Config field ${key} must be a boolean.`, { exitCode: 2 });
  return value;
}

function optionalInteger(record: Record<string, unknown>, key: string, min: number, max: number): number | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new CliError("youtube_config_invalid", `Config field ${key} must be an integer from ${min} to ${max}.`, { exitCode: 2 });
  }
  return value;
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}
