import { constants } from "node:fs";
import { access, chmod, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { TOKEN_REFRESH_SKEW_MS, YOUTUBE_ACCOUNT } from "./config";
import { CliError, type RuntimeConfig } from "./types";

export interface YoutubeTokenFile {
  schemaVersion: 1;
  profile: string;
  account: typeof YOUTUBE_ACCOUNT;
  clientId: string;
  clientSecret?: string;
  scopes: string[];
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  tokenType: "Bearer";
  createdAt: string;
  updatedAt: string;
}

export interface YoutubeAccountFile {
  schemaVersion: 1;
  profile: string;
  channelId: string;
  title: string;
  customUrl?: string;
  syncedAt: string;
}

export interface YoutubeUploadStateFile {
  schemaVersion: 1;
  profile: string;
  account: typeof YOUTUBE_ACCOUNT;
  uploadId: string;
  filePath: string;
  size: number;
  mimeType: string;
  metadata: Record<string, unknown>;
  sessionUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface TokenStatus {
  authenticated: boolean;
  state: "missing" | "valid" | "expired" | "expiring" | "invalid";
  tokenPath: string;
  scopes: string[];
  expiresAt?: string;
  message?: string;
}

export function youtubeRoot(config: RuntimeConfig): string {
  return join(config.growthRoot, config.profile, YOUTUBE_ACCOUNT);
}

export function authDir(config: RuntimeConfig): string {
  return join(youtubeRoot(config), "auth");
}

export function tokenPath(config: RuntimeConfig): string {
  return join(authDir(config), "token.json");
}

export function accountPath(config: RuntimeConfig): string {
  return join(youtubeRoot(config), "account.json");
}

export function uploadStateDir(config: RuntimeConfig): string {
  return join(youtubeRoot(config), "uploads");
}

export function uploadStatePath(config: RuntimeConfig, uploadId: string): string {
  assertSafeUploadId(uploadId);
  return join(uploadStateDir(config), `${uploadId}.json`);
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readToken(config: RuntimeConfig): Promise<YoutubeTokenFile> {
  const path = tokenPath(config);
  if (!(await pathExists(path))) {
    throw new CliError(
      "youtube_auth_missing",
      `Run \`yt-cli auth start --profile ${config.profile} --scope read\` first.`,
      { exitCode: 2 }
    );
  }

  const mode = (await stat(path)).mode & 0o777;
  if ((mode & 0o077) !== 0) {
    throw new CliError("youtube_token_permissions", `Token file must be private: ${path}`, {
      exitCode: 2,
      details: { mode: mode.toString(8), expected: "600" }
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new CliError("youtube_token_invalid", "Token file is not valid JSON. Re-run auth after backing it up.", {
      exitCode: 2,
      details: error instanceof Error ? error.message : String(error)
    });
  }

  return validateToken(config, parsed);
}

export async function writeToken(config: RuntimeConfig, token: YoutubeTokenFile): Promise<void> {
  validateToken(config, token);
  await mkdir(authDir(config), { recursive: true, mode: 0o700 });
  await chmod(authDir(config), 0o700);
  const path = tokenPath(config);
  const tmp = join(dirname(path), `.token.${process.pid}.${Date.now()}.tmp`);
  await writeFile(tmp, `${JSON.stringify(token, null, 2)}\n`, { mode: 0o600 });
  await chmod(tmp, 0o600);
  await rename(tmp, path);
  await chmod(path, 0o600);
}

export async function removeToken(config: RuntimeConfig): Promise<boolean> {
  const path = tokenPath(config);
  if (!(await pathExists(path))) return false;
  await rm(path);
  return true;
}

export async function writeAccount(config: RuntimeConfig, account: YoutubeAccountFile): Promise<void> {
  await mkdir(dirname(accountPath(config)), { recursive: true, mode: 0o700 });
  await writeFile(accountPath(config), `${JSON.stringify(account, null, 2)}\n`, { mode: 0o600 });
  await chmod(accountPath(config), 0o600);
}

export async function readAccount(config: RuntimeConfig): Promise<YoutubeAccountFile | undefined> {
  const path = accountPath(config);
  if (!(await pathExists(path))) return undefined;
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (!parsed || typeof parsed !== "object") return undefined;
    const item = parsed as Partial<YoutubeAccountFile>;
    if (item.schemaVersion !== 1 || item.profile !== config.profile || typeof item.channelId !== "string") return undefined;
    return item as YoutubeAccountFile;
  } catch {
    return undefined;
  }
}

export async function writeUploadState(config: RuntimeConfig, state: YoutubeUploadStateFile): Promise<string> {
  validateUploadState(config, state);
  await mkdir(uploadStateDir(config), { recursive: true, mode: 0o700 });
  await chmod(uploadStateDir(config), 0o700);
  const path = uploadStatePath(config, state.uploadId);
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
  return path;
}

export async function removeUploadState(config: RuntimeConfig, uploadId: string): Promise<void> {
  await rm(uploadStatePath(config, uploadId), { force: true });
}

export async function readUploadState(config: RuntimeConfig, uploadId: string): Promise<YoutubeUploadStateFile> {
  const path = uploadStatePath(config, uploadId);
  if (!(await pathExists(path))) {
    throw new CliError("youtube_upload_state_missing", `Upload state not found: ${uploadId}`);
  }
  const mode = (await stat(path)).mode & 0o777;
  if ((mode & 0o077) !== 0) {
    throw new CliError("youtube_upload_state_permissions", `Upload state file must be private: ${path}`, {
      details: { mode: mode.toString(8), expected: "600" }
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new CliError("youtube_upload_state_invalid", "Upload state file is not valid JSON.", {
      details: error instanceof Error ? error.message : String(error)
    });
  }
  return validateUploadState(config, parsed);
}

export async function listUploadStates(config: RuntimeConfig): Promise<YoutubeUploadStateFile[]> {
  const dir = uploadStateDir(config);
  if (!(await pathExists(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const states: YoutubeUploadStateFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const uploadId = entry.name.slice(0, -".json".length);
    try {
      states.push(await readUploadState(config, uploadId));
    } catch {
      // Ignore unrelated or corrupt files when listing; direct reads still report the exact error.
    }
  }
  return states.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getTokenStatus(config: RuntimeConfig): Promise<TokenStatus> {
  const path = tokenPath(config);
  try {
    const token = await readToken(config);
    const now = Date.now();
    const expiry = Date.parse(token.expiresAt);
    const state = expiry <= now ? "expired" : expiry - now <= TOKEN_REFRESH_SKEW_MS ? "expiring" : "valid";
    return {
      authenticated: state === "valid" || state === "expiring",
      state,
      tokenPath: path,
      scopes: token.scopes,
      expiresAt: token.expiresAt
    };
  } catch (error) {
    if (error instanceof CliError && error.code === "youtube_auth_missing") {
      return {
        authenticated: false,
        state: "missing",
        tokenPath: path,
        scopes: [],
        message: error.message
      };
    }
    if (error instanceof CliError) {
      return {
        authenticated: false,
        state: "invalid",
        tokenPath: path,
        scopes: [],
        message: error.message
      };
    }
    throw error;
  }
}

export function validateToken(config: RuntimeConfig, value: unknown): YoutubeTokenFile {
  if (!value || typeof value !== "object") {
    throw new CliError("youtube_token_invalid", "Token file is not an object.", { exitCode: 2 });
  }
  const token = value as Partial<YoutubeTokenFile>;
  const requiredStrings: Array<keyof YoutubeTokenFile> = ["profile", "account", "clientId", "accessToken", "expiresAt", "tokenType"];
  for (const key of requiredStrings) {
    if (typeof token[key] !== "string" || !token[key]) {
      throw new CliError("youtube_token_invalid", `Token file is missing ${key}.`, { exitCode: 2 });
    }
  }
  if (token.schemaVersion !== 1) {
    throw new CliError("youtube_token_invalid", "Token schema version is not supported.", { exitCode: 2 });
  }
  if (token.profile !== config.profile || token.account !== YOUTUBE_ACCOUNT) {
    throw new CliError("youtube_token_invalid", "Token belongs to a different profile or account.", { exitCode: 2 });
  }
  if (!Array.isArray(token.scopes) || token.scopes.some((scope) => typeof scope !== "string" || !scope)) {
    throw new CliError("youtube_token_invalid", "Token scopes are invalid.", { exitCode: 2 });
  }
  if (Number.isNaN(Date.parse(token.expiresAt ?? ""))) {
    throw new CliError("youtube_token_invalid", "Token expiry is invalid.", { exitCode: 2 });
  }
  if (token.tokenType !== "Bearer") {
    throw new CliError("youtube_token_invalid", "Only Bearer tokens are supported.", { exitCode: 2 });
  }
  return token as YoutubeTokenFile;
}

export function isTokenExpiring(token: YoutubeTokenFile, now = Date.now()): boolean {
  return Date.parse(token.expiresAt) - now <= TOKEN_REFRESH_SKEW_MS;
}

export function assertSafeUploadId(uploadId: string): string {
  if (!/^[a-f0-9]{16}$/.test(uploadId)) {
    throw new CliError("youtube_upload_id_invalid", "Upload id must be the 16-character id returned by upload create.");
  }
  return uploadId;
}

export function validateUploadState(config: RuntimeConfig, value: unknown): YoutubeUploadStateFile {
  if (!value || typeof value !== "object") {
    throw new CliError("youtube_upload_state_invalid", "Upload state file is not an object.");
  }
  const state = value as Partial<YoutubeUploadStateFile>;
  if (state.schemaVersion !== 1) throw new CliError("youtube_upload_state_invalid", "Upload state schema version is not supported.");
  if (state.profile !== config.profile || state.account !== YOUTUBE_ACCOUNT) {
    throw new CliError("youtube_upload_state_invalid", "Upload state belongs to a different profile or account.");
  }
  for (const key of ["uploadId", "filePath", "mimeType", "sessionUrl", "createdAt", "updatedAt"] as const) {
    if (typeof state[key] !== "string" || !state[key]) {
      throw new CliError("youtube_upload_state_invalid", `Upload state is missing ${key}.`);
    }
  }
  assertSafeUploadId(state.uploadId as string);
  if (typeof state.size !== "number" || !Number.isSafeInteger(state.size) || state.size <= 0) {
    throw new CliError("youtube_upload_state_invalid", "Upload state has invalid size.");
  }
  if (!state.metadata || typeof state.metadata !== "object" || Array.isArray(state.metadata)) {
    throw new CliError("youtube_upload_state_invalid", "Upload state has invalid metadata.");
  }
  return state as YoutubeUploadStateFile;
}
