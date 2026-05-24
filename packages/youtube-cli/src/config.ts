import { homedir } from "node:os";
import { resolve } from "node:path";

import { CliError, type RuntimeConfig } from "./types";

export const YOUTUBE_ACCOUNT = "youtube";
export const TOKEN_REFRESH_SKEW_MS = 60_000;

export const YOUTUBE_SCOPES = {
  read: "https://www.googleapis.com/auth/youtube.readonly",
  upload: "https://www.googleapis.com/auth/youtube.upload",
  operate: "https://www.googleapis.com/auth/youtube.force-ssl"
} as const;

export type ScopePreset = keyof typeof YOUTUBE_SCOPES | "full";

export function buildRuntimeConfig(input: { profile?: string; growthRoot?: string } = {}): RuntimeConfig {
  return {
    profile: assertSafeProfile(input.profile ?? process.env.YOUTUBE_PROFILE ?? "default"),
    growthRoot: expandHome(input.growthRoot ?? process.env.GROWTH_HACKER_HOME ?? "~/.growth")
  };
}

export function expandHome(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return resolve(homedir(), value.slice(2));
  return resolve(value);
}

export function assertSafeProfile(profile: string): string {
  const trimmed = profile.trim();
  if (!trimmed || trimmed === "." || trimmed === ".." || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(trimmed)) {
    throw new CliError("youtube_invalid_profile", "Profile must be a safe workspace segment such as `astrozi`.");
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
  return scopes.includes(YOUTUBE_SCOPES.read) || scopes.includes(YOUTUBE_SCOPES.operate);
}

export function requireReadScope(scopes: string[]): void {
  if (!hasReadScope(scopes)) {
    throw new CliError("youtube_scope_missing", "Token is missing read scope. Re-run auth with `--scope read`.");
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
