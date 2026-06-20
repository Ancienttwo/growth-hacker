import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";

import type { RuntimeStatus } from "@growth-hacker/core";

import type { AppConfig } from "./config";
import { commandExists, runCommand } from "./shell";
import { invalidateStatusCache, readThroughStatusCache } from "./statusCache";

const STATUS_CACHE_TTL_MS = 5000;
const STATUS_COMMAND_TIMEOUT_MS = 4500;
const STATUS_COMMAND_KILL_GRACE_MS = 500;
const hermesStatusCache = new Map<string, { expiresAt: number; inFlight?: Promise<RuntimeStatus>; value?: RuntimeStatus }>();
const openClawStatusCache = new Map<string, { expiresAt: number; inFlight?: Promise<RuntimeStatus>; value?: RuntimeStatus }>();

export async function getRuntimeStatuses(config: AppConfig): Promise<RuntimeStatus[]> {
  const [hermes, openclaw] = await Promise.all([getHermesStatus(config), getOpenClawStatus()]);
  return [hermes, openclaw];
}

export async function getHermesStatus(config: AppConfig): Promise<RuntimeStatus> {
  return readThroughStatusCache(hermesStatusCache, hermesStatusCacheKey(config), STATUS_CACHE_TTL_MS, () => readHermesStatus(config));
}

export function invalidateRuntimeStatusCache(config?: AppConfig): void {
  if (config) invalidateStatusCache(hermesStatusCache, hermesStatusCacheKey(config));
  else invalidateStatusCache(hermesStatusCache);
  invalidateStatusCache(openClawStatusCache);
}

async function readHermesStatus(config: AppConfig): Promise<RuntimeStatus> {
  const command = await commandExists("hermes");
  if (!command) {
    return {
      kind: "hermes",
      state: "missing",
      guidance: "Install Hermes before running agent workflows."
    };
  }
  const [status, profiles, skills] = await Promise.all([
    runStatusCommand(command, ["status", "--all"]),
    runStatusCommand(command, ["profile", "list"]),
    runStatusCommand(command, ["-p", config.defaultHermesProfile, "skills", "list", "--enabled-only"])
  ]);
  const timedOut = status.timedOut || profiles.timedOut || skills.timedOut;
  const profileExists = profiles.stdout.includes(config.defaultHermesProfile) || existsSync(join(config.hermesHome, "profiles", config.defaultHermesProfile));
  const skillInstalled =
    skills.stdout.includes("xiaohongshu-skill") ||
    existsSync(join(config.hermesHome, "profiles", config.defaultHermesProfile, "skills", "social-media", "xiaohongshu-skill"));
  return {
    kind: "hermes",
    state: status.exitCode === 0 && !timedOut ? "available" : "degraded",
    command,
    profileExists,
    skillInstalled,
    guidance: timedOut ? "Hermes runtime status check timed out; retry after the CLI is responsive." : undefined,
    raw: redactRuntimeOutput(
      [
        commandStatusOutput("hermes status --all", status),
        commandStatusOutput("hermes profile list", profiles),
        commandStatusOutput(`hermes -p ${config.defaultHermesProfile} skills list --enabled-only`, skills)
      ]
        .filter(Boolean)
        .join("\n\n")
    )
  };
}

export async function getOpenClawStatus(): Promise<RuntimeStatus> {
  return readThroughStatusCache(openClawStatusCache, "openclaw", STATUS_CACHE_TTL_MS, readOpenClawStatus);
}

async function readOpenClawStatus(): Promise<RuntimeStatus> {
  const command = (await commandExists("openclaw")) ?? (await commandExists("claw"));
  if (!command) {
    return {
      kind: "openclaw",
      state: "missing",
      guidance: "OpenClaw runtime is optional in v1; Hermes is the default runner."
    };
  }
  const result = await runStatusCommand(command, ["--version"]);
  return {
    kind: "openclaw",
    state: result.exitCode === 0 && !result.timedOut ? "available" : "degraded",
    command,
    version: result.stdout.trim() || result.stderr.trim(),
    guidance: result.timedOut
      ? "OpenClaw version check timed out; Hermes remains the default runner."
      : "OpenClaw is detected but v1 uses Hermes as the default runner."
  };
}

function redactRuntimeOutput(value: string): string {
  return value
    .replace(/(Auth file:\s+).+/g, "$1[REDACTED]")
    .replace(/(home:\s+)[^\s)]+/g, "$1[REDACTED]")
    .replace(/(PID\(s\):\s+).+/g, "$1[REDACTED]");
}

function runStatusCommand(command: string, args: string[]) {
  return runCommand(command, args, {
    timeoutMs: statusCommandTimeoutMs(),
    timeoutKillGraceMs: STATUS_COMMAND_KILL_GRACE_MS
  });
}

function commandStatusOutput(label: string, result: Awaited<ReturnType<typeof runStatusCommand>>): string {
  const lines = [];
  if (result.timedOut) lines.push(`${label}: timed out after ${statusCommandTimeoutMs()}ms`);
  if (result.error) lines.push(`${label}: ${result.error}`);
  const output = result.stdout || result.stderr;
  if (output) lines.push(output);
  return lines.join("\n");
}

function statusCommandTimeoutMs(): number {
  const override = Number(process.env.GROWTH_HACKER_STATUS_COMMAND_TIMEOUT_MS);
  return Number.isInteger(override) && override > 0 ? override : STATUS_COMMAND_TIMEOUT_MS;
}

function hermesStatusCacheKey(config: AppConfig): string {
  return [config.hermesHome, config.defaultHermesProfile].join("|");
}

export async function bootstrapGrowthAgent(config: AppConfig) {
  const hermes = await commandExists("hermes");
  if (!hermes) {
    return { ok: false, createdProfile: false, syncedSkill: false, message: "Hermes not found on PATH." };
  }

  let createdProfile = false;
  const before = await runCommand(hermes, ["profile", "list"], { timeoutMs: 10000 });
  if (!before.stdout.includes(config.defaultHermesProfile)) {
    const created = await runCommand(hermes, ["profile", "create", config.defaultHermesProfile, "--clone"], { timeoutMs: 60000 });
    if (created.exitCode !== 0) {
      return {
        ok: false,
        createdProfile,
        syncedSkill: false,
        message: created.stderr || created.stdout || "Failed to create Hermes profile."
      };
    }
    createdProfile = true;
  }

  const syncedSkills: string[] = [];
  const skillTargets: string[] = [];
  for (const skill of discoverBundledSkills(config)) {
    const target = join(config.hermesHome, "profiles", config.defaultHermesProfile, "skills", skill.relativeDir);
    skillTargets.push(target);
    if (existsSync(target)) continue;
    mkdirSync(join(config.hermesHome, "profiles", config.defaultHermesProfile, "skills", dirnameFromRelative(skill.relativeDir)), {
      recursive: true
    });
    cpSync(skill.source, target, {
      recursive: true,
      filter: (source) => {
        const parts = relative(skill.source, source).split(sep);
        return !parts.some((part) => part === ".git" || part === "node_modules" || part === "__pycache__" || part === ".pytest_cache" || part === "dist");
      }
    });
    syncedSkills.push(skill.relativeDir);
  }

  return {
    ok: true,
    createdProfile,
    syncedSkill: syncedSkills.length > 0,
    syncedSkills,
    profile: config.defaultHermesProfile,
    skillTarget: skillTargets.find((target) => target.endsWith("xiaohongshu-skill")) ?? skillTargets[0],
    skillTargets
  };
}

interface BundledSkill {
  source: string;
  relativeDir: string;
}

function discoverBundledSkills(config: AppConfig): BundledSkill[] {
  const skillsRoot = config.bundledHermesSkillsRoot;
  if (skillsRoot && existsSync(skillsRoot)) {
    return findSkillDirs(skillsRoot).map((source) => ({
      source,
      relativeDir: relativeDirFromSkillRoot(skillsRoot, source)
    }));
  }
  if (existsSync(config.bundledXiaohongshuSkillRoot)) {
    return [{ source: config.bundledXiaohongshuSkillRoot, relativeDir: "social-media/xiaohongshu-skill" }];
  }
  return [];
}

function findSkillDirs(root: string): string[] {
  const dirs: string[] = [];
  if (existsSync(join(root, "SKILL.md"))) return [root];
  for (const entry of readdirSync(root)) {
    if (entry.startsWith(".")) continue;
    const path = join(root, entry);
    if (!statSync(path).isDirectory()) continue;
    dirs.push(...findSkillDirs(path));
  }
  return dirs;
}

function relativeDirFromSkillRoot(root: string, source: string): string {
  const relativeDir = relative(root, source).split(sep).filter(Boolean).join("/");
  return relativeDir || basename(source);
}

function dirnameFromRelative(value: string): string {
  const parts = value.split("/").filter(Boolean);
  return parts.slice(0, -1).join("/");
}
