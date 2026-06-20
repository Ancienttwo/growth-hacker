import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { AppConfig } from "./config";
import type { JobStore } from "./jobs";
import { commandExists, runCommand } from "./shell";
import { invalidateStatusCache, readThroughStatusCache } from "./statusCache";

export interface HermesVideoAuthStatus {
  installed: boolean;
  configured: boolean;
  authenticated: boolean;
  pluginEnabled: boolean;
  apiServerToolEnabled: boolean;
  provider?: string;
  model?: string;
  command?: string;
  message?: string;
}

const VIDEO_PROVIDER = "xai";
const VIDEO_MODEL = "grok-imagine-video";
const AUTH_NAME = "xai-oauth";
const VIDEO_PLUGIN = "video_gen/xai";
const STATUS_CACHE_TTL_MS = 5000;
const STATUS_COMMAND_TIMEOUT_MS = 4500;
const STATUS_COMMAND_KILL_GRACE_MS = 500;
const videoAuthStatusCache = new Map<string, { expiresAt: number; inFlight?: Promise<HermesVideoAuthStatus>; value?: HermesVideoAuthStatus }>();

export async function getHermesVideoAuthStatus(config: AppConfig): Promise<HermesVideoAuthStatus> {
  return readThroughStatusCache(videoAuthStatusCache, videoAuthStatusCacheKey(config), STATUS_CACHE_TTL_MS, () => readHermesVideoAuthStatus(config));
}

export function invalidateHermesVideoAuthStatus(config?: AppConfig): void {
  if (config) invalidateStatusCache(videoAuthStatusCache, videoAuthStatusCacheKey(config));
  else invalidateStatusCache(videoAuthStatusCache);
}

async function readHermesVideoAuthStatus(config: AppConfig): Promise<HermesVideoAuthStatus> {
  const hermes = await resolveHermesCli();
  if (!hermes) {
    return {
      installed: false,
      configured: false,
      authenticated: false,
      pluginEnabled: false,
      apiServerToolEnabled: false,
      message: "Hermes CLI not found on PATH."
    };
  }

  const env = hermesEnv(config);
  const [auth, tools, plugins] = await Promise.all([
    runStatusCommand(hermes, ["auth", "status", AUTH_NAME], env),
    runStatusCommand(hermes, ["tools", "list", "--platform", "api_server"], env),
    runStatusCommand(hermes, ["plugins", "list"], env)
  ]);
  const timedOut = auth.timedOut || tools.timedOut || plugins.timedOut;
  const videoConfig = readVideoConfig(config);
  const authenticated = isAuthLoggedIn(auth.stdout || auth.stderr);
  const pluginEnabled = isPluginEnabled(plugins.stdout || plugins.stderr) || videoConfig.plugins.includes(VIDEO_PLUGIN);
  const apiServerToolEnabled = isApiServerVideoGenEnabled(tools.stdout || tools.stderr) || videoConfig.apiServerTools.includes("video_gen");
  const provider = videoConfig.provider;
  const model = videoConfig.model;
  const configured = authenticated && pluginEnabled && apiServerToolEnabled && provider === VIDEO_PROVIDER && model === VIDEO_MODEL;

  return {
    installed: true,
    configured,
    authenticated,
    pluginEnabled,
    apiServerToolEnabled,
    provider,
    model,
    command: hermes,
    message: timedOut
      ? "Hermes video auth status check timed out; retry after the CLI is responsive."
      : configured
        ? undefined
        : videoAuthStatusMessage({ authenticated, pluginEnabled, apiServerToolEnabled, provider, model })
  };
}

export async function startHermesVideoAuth(config: AppConfig, jobs: JobStore, force = false) {
  invalidateHermesVideoAuthStatus(config);
  const hermes = await resolveHermesCli();
  return jobs.startTask("hermes-video-auth", ["hermes", "video", "auth", "xai"], async (log) => {
    if (!hermes) throw new Error("Hermes CLI not found on PATH.");

    const env = hermesEnv(config);
    await runHermesStep(hermes, ["plugins", "enable", VIDEO_PLUGIN], env, log, "Enable xAI video plugin");
    await runHermesStep(hermes, ["tools", "enable", "video", "video_gen", "--platform", "api_server"], env, log, "Enable API server video tools");
    await runHermesStep(hermes, ["config", "set", "video_gen.provider", VIDEO_PROVIDER], env, log, "Set video provider");
    await runHermesStep(hermes, ["config", "set", "video_gen.model", VIDEO_MODEL], env, log, "Set video model");

    const before = await runCommand(hermes, ["auth", "status", AUTH_NAME], { env, timeoutMs: 10000 });
    if (!force && before.exitCode === 0 && isAuthLoggedIn(before.stdout || before.stderr)) {
      log(`${AUTH_NAME}: already logged in`);
      return;
    }

    log("Open the authorization URL from this job log, then finish the xAI browser consent flow.");
    await runHermesStep(
      hermes,
      ["auth", "add", AUTH_NAME, "--type", "oauth", "--no-browser", "--timeout", "300"],
      { ...env, PYTHONUNBUFFERED: "1" },
      log,
      "Start xAI OAuth",
      15 * 60 * 1000
    );

    const after = await runCommand(hermes, ["auth", "status", AUTH_NAME], { env, timeoutMs: 10000 });
    if (after.exitCode !== 0 || !isAuthLoggedIn(after.stdout || after.stderr)) {
      throw new Error(`${AUTH_NAME}: auth did not complete`);
    }
    log(`${AUTH_NAME}: logged in`);
    invalidateHermesVideoAuthStatus(config);
  });
}

async function runHermesStep(
  hermes: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  log: (line: string) => void,
  label: string,
  timeoutMs = 60000
): Promise<void> {
  log(`${label}: hermes ${args.join(" ")}`);
  const result = await runCommand(hermes, args, {
    env,
    timeoutMs,
    onLine: log
  });
  if (result.exitCode !== 0) {
    const detail = (result.stderr || result.stdout || result.error || "unknown error").trim();
    throw new Error(`${label} failed: ${detail.slice(0, 800)}`);
  }
}

async function resolveHermesCli(): Promise<string | undefined> {
  const fromPath = await commandExists("hermes");
  if (fromPath) return fromPath;
  const local = join(homedir(), ".local", "bin", "hermes");
  return existsSync(local) ? local : undefined;
}

function hermesEnv(config: AppConfig): NodeJS.ProcessEnv {
  return { HERMES_HOME: config.hermesHome };
}

function runStatusCommand(command: string, args: string[], env: NodeJS.ProcessEnv) {
  return runCommand(command, args, {
    env,
    timeoutMs: statusCommandTimeoutMs(),
    timeoutKillGraceMs: STATUS_COMMAND_KILL_GRACE_MS
  });
}

function statusCommandTimeoutMs(): number {
  const override = Number(process.env.GROWTH_HACKER_STATUS_COMMAND_TIMEOUT_MS);
  return Number.isInteger(override) && override > 0 ? override : STATUS_COMMAND_TIMEOUT_MS;
}

function videoAuthStatusCacheKey(config: AppConfig): string {
  return [config.hermesHome, config.defaultHermesProfile].join("|");
}

function isAuthLoggedIn(output: string): boolean {
  const normalized = output.toLowerCase();
  return normalized.includes("logged in") && !normalized.includes("not logged in");
}

function isPluginEnabled(output: string): boolean {
  return new RegExp(`${escapeRegExp(VIDEO_PLUGIN)}\\s+[^\\n]*\\benabled\\b`, "i").test(output);
}

function isApiServerVideoGenEnabled(output: string): boolean {
  return /enabled\s+video_gen\b/i.test(output);
}

function readVideoConfig(config: AppConfig): { provider?: string; model?: string; plugins: string[]; apiServerTools: string[] } {
  const paths = [
    join(config.hermesHome, "config.yaml"),
    join(config.hermesHome, "profiles", config.defaultHermesProfile, "config.yaml")
  ];
  const merged = { provider: undefined as string | undefined, model: undefined as string | undefined, plugins: [] as string[], apiServerTools: [] as string[] };
  for (const path of paths) {
    if (!existsSync(path)) continue;
    const parsed = parseVideoConfig(readFileSync(path, "utf8"));
    merged.provider ??= parsed.provider;
    merged.model ??= parsed.model;
    merged.plugins.push(...parsed.plugins);
    merged.apiServerTools.push(...parsed.apiServerTools);
  }
  return merged;
}

export function parseVideoConfig(input: string): { provider?: string; model?: string; plugins: string[]; apiServerTools: string[] } {
  const pluginConfig = sectionBlock(input, "plugins");
  const plugins = pluginConfig ? valuesInListSection(pluginConfig, "enabled") : [];
  const platformToolsets = sectionBlock(input, "platform_toolsets");
  const apiServerTools = platformToolsets ? valuesInListSection(platformToolsets, "api_server") : [];
  const videoGen = sectionBlock(input, "video_gen");
  return {
    provider: videoGen ? scalarValue(videoGen, "provider") : undefined,
    model: videoGen ? scalarValue(videoGen, "model") : undefined,
    plugins,
    apiServerTools
  };
}

function sectionBlock(input: string, key: string): string | undefined {
  const lines = input.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `${key}:`);
  if (start < 0) return undefined;
  const startIndent = lines[start].match(/^(\s*)/)?.[1].length ?? 0;
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const lineIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (line.trim() && lineIndent <= startIndent && !line.trim().startsWith("-")) break;
    body.push(line);
  }
  return body.join("\n");
}

function valuesInListSection(input: string, key: string): string[] {
  const block = sectionBlock(input, key);
  if (!block) return [];
  return block
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s*(.+?)\s*$/)?.[1]?.trim())
    .filter((value): value is string => Boolean(value));
}

function scalarValue(input: string, key: string): string | undefined {
  const match = input.match(new RegExp(`^\\s*${escapeRegExp(key)}:\\s*(.+?)\\s*$`, "m"));
  return match?.[1]?.replace(/^["']|["']$/g, "").trim() || undefined;
}

function videoAuthStatusMessage(input: {
  authenticated: boolean;
  pluginEnabled: boolean;
  apiServerToolEnabled: boolean;
  provider?: string;
  model?: string;
}): string {
  const missing = [
    input.authenticated ? undefined : "xAI OAuth",
    input.pluginEnabled ? undefined : VIDEO_PLUGIN,
    input.apiServerToolEnabled ? undefined : "api_server video_gen",
    input.provider === VIDEO_PROVIDER ? undefined : "video_gen.provider",
    input.model === VIDEO_MODEL ? undefined : "video_gen.model"
  ].filter(Boolean);
  return `Missing: ${missing.join(", ")}`;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
