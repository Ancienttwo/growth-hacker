import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";

import {
  type AgentRunnerKind,
  type HermesProfileConfig,
  type PlatformHermesProfile,
  type PlatformId,
  type SocialAgent,
  WORKSPACE_PLATFORMS,
  XIAOHONGSHU_PLATFORM
} from "@growth-hacker/core";

import type { AppConfig } from "./config";
import type { JobStore } from "./jobs";
import { commandExists, runCommand } from "./shell";

const HERMES_PROFILE_CONFIG_SCHEMA_VERSION = 1;
const DEFAULT_PLATFORM_PROFILE_SUFFIX = "growth-agent";

interface HermesProfileConfigStore {
  schemaVersion: typeof HERMES_PROFILE_CONFIG_SCHEMA_VERSION;
  platforms?: Record<string, StoredPlatformHermesProfile>;
}

interface StoredPlatformHermesProfile {
  agentId?: unknown;
  runner?: unknown;
  updatedAt?: unknown;
}

export function listHermesProfileConfig(config: AppConfig): HermesProfileConfig {
  const store = readStore(config);
  const profiles = WORKSPACE_PLATFORMS.map((platform) => platformProfile(config, platform, store.platforms?.[platform]));
  return {
    schemaVersion: HERMES_PROFILE_CONFIG_SCHEMA_VERSION,
    defaultAgentId: config.defaultHermesProfile,
    profiles,
    agents: mergeSocialAgents(config.socialAgents, profiles),
    configPath: storePath(config)
  };
}

export function listConfiguredSocialAgents(config: AppConfig): SocialAgent[] {
  return listHermesProfileConfig(config).agents;
}

export function resolvePlatformHermesAgent(config: AppConfig, platform: string): SocialAgent {
  const profile = listHermesProfileConfig(config).profiles.find((item) => item.platform === platform);
  if (profile) return { id: profile.agentId, runner: profile.runner };
  const fallback = config.socialAgents.find((agent) => agent.id === config.defaultHermesProfile) ?? config.socialAgents[0];
  return fallback ?? { id: config.defaultHermesProfile, runner: "hermes" };
}

export function assertAllowedHermesAgent(config: AppConfig, agentId: string): void {
  const normalized = normalizeAgentId(agentId);
  if (!listConfiguredSocialAgents(config).some((agent) => agent.id === normalized)) {
    throw new Error(`agent_not_allowed:${normalized}`);
  }
}

export function updatePlatformHermesProfile(
  config: AppConfig,
  platform: string,
  input: { agentId?: unknown; runner?: unknown }
): PlatformHermesProfile {
  assertKnownPlatform(platform);
  const store = readStore(config);
  const agentId = normalizeAgentId(input.agentId);
  const runner = normalizeRunner(input.runner, "hermes");
  const updatedAt = new Date().toISOString();
  store.platforms = {
    ...(store.platforms ?? {}),
    [platform]: { agentId, runner, updatedAt }
  };
  writeStore(config, store);
  return platformProfile(config, platform as PlatformId, store.platforms[platform]);
}

export async function startHermesPlatformProfileBootstrap(config: AppConfig, jobs: JobStore) {
  return jobs.startTask("hermes-profile-bootstrap", ["hermes", "profile", "create", "--platforms"], async (log) => {
    const hermes = await commandExists("hermes");
    if (!hermes) throw new Error("Hermes CLI not found on PATH.");

    const profiles = uniqueProfiles(listHermesProfileConfig(config).profiles);
    const env = { HERMES_HOME: config.hermesHome };
    const profileList = await runCommand(hermes, ["profile", "list"], { env, timeoutMs: 10000 });
    if (profileList.exitCode !== 0) {
      throw new Error((profileList.stderr || profileList.stdout || "Failed to list Hermes profiles.").trim());
    }

    for (const profile of profiles) {
      const exists = profile.profileExists || outputMentionsProfile(profileList.stdout, profile.agentId);
      if (exists) {
        log(`${profile.platform}: ${profile.agentId} already exists`);
      } else {
        log(`${profile.platform}: create Hermes profile ${profile.agentId}`);
        const created = await runCommand(hermes, ["profile", "create", profile.agentId, "--clone"], {
          env,
          timeoutMs: 60000,
          onLine: log
        });
        if (created.exitCode !== 0) {
          throw new Error((created.stderr || created.stdout || `Failed to create ${profile.agentId}.`).trim());
        }
      }
      syncBundledSkillsToProfile(config, profile.agentId, log);
    }
  });
}

function platformProfile(config: AppConfig, platform: PlatformId, stored?: StoredPlatformHermesProfile): PlatformHermesProfile {
  const defaultAgentId = defaultPlatformAgentId(config, platform);
  const agentId = stringValue(stored?.agentId) ? normalizeAgentId(stored?.agentId) : defaultAgentId;
  const existingAgent = config.socialAgents.find((agent) => agent.id === agentId);
  const runner = normalizeRunner(stored?.runner, existingAgent?.runner ?? (platform === XIAOHONGSHU_PLATFORM ? "local" : "hermes"));
  const profilePath = join(config.hermesHome, "profiles", agentId);
  return {
    platform,
    agentId,
    runner,
    profilePath,
    profileExists: existsSync(profilePath),
    source: stringValue(stored?.agentId) ? "stored" : "default",
    updatedAt: stringValue(stored?.updatedAt) || undefined
  };
}

function defaultPlatformAgentId(config: AppConfig, platform: PlatformId): string {
  if (platform === XIAOHONGSHU_PLATFORM) return normalizeAgentId(config.defaultHermesProfile);
  return normalizeAgentId(`${platform}-${DEFAULT_PLATFORM_PROFILE_SUFFIX}`);
}

function mergeSocialAgents(configAgents: SocialAgent[], profiles: PlatformHermesProfile[]): SocialAgent[] {
  const byId = new Map<string, SocialAgent>();
  for (const agent of configAgents) {
    const id = stringValue(agent.id);
    if (!id) continue;
    byId.set(id, { id, runner: normalizeRunner(agent.runner, "local") });
  }
  for (const profile of profiles) {
    const existing = byId.get(profile.agentId);
    byId.set(profile.agentId, { id: profile.agentId, runner: existing?.runner ?? profile.runner });
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function uniqueProfiles(profiles: PlatformHermesProfile[]): PlatformHermesProfile[] {
  const byAgentId = new Map<string, PlatformHermesProfile>();
  for (const profile of profiles) {
    if (!byAgentId.has(profile.agentId)) byAgentId.set(profile.agentId, profile);
  }
  return [...byAgentId.values()];
}

function syncBundledSkillsToProfile(config: AppConfig, agentId: string, log: (line: string) => void): void {
  for (const skill of discoverBundledSkills(config)) {
    const target = join(config.hermesHome, "profiles", agentId, "skills", skill.relativeDir);
    if (existsSync(target)) {
      log(`${agentId}: skill ${skill.relativeDir} already synced`);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    cpSync(skill.source, target, {
      recursive: true,
      filter: (source) => {
        const parts = relative(skill.source, source).split(sep);
        return !parts.some((part) => part === ".git" || part === "node_modules" || part === "__pycache__" || part === ".pytest_cache" || part === "dist");
      }
    });
    log(`${agentId}: synced skill ${skill.relativeDir}`);
  }
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

function outputMentionsProfile(output: string, agentId: string): boolean {
  return new RegExp(`(^|\\s)${escapeRegExp(agentId)}($|\\s)`).test(output);
}

function assertKnownPlatform(platform: string): asserts platform is PlatformId {
  if (!WORKSPACE_PLATFORMS.includes(platform as PlatformId)) {
    throw new Error(`platform_not_supported:${platform}`);
  }
}

function normalizeAgentId(value: unknown): string {
  const agentId = stringValue(value);
  if (!agentId) throw new Error("agent_required");
  if (!/^[a-zA-Z0-9_.:-]+$/.test(agentId)) throw new Error(`invalid_agent_id:${agentId}`);
  return agentId;
}

function normalizeRunner(value: unknown, fallback: AgentRunnerKind): AgentRunnerKind {
  if (value === "hermes" || value === "openclaw" || value === "local") return value;
  return fallback;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readStore(config: AppConfig): HermesProfileConfigStore {
  const path = storePath(config);
  if (!existsSync(path)) {
    return { schemaVersion: HERMES_PROFILE_CONFIG_SCHEMA_VERSION, platforms: {} };
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as HermesProfileConfigStore;
  return {
    schemaVersion: HERMES_PROFILE_CONFIG_SCHEMA_VERSION,
    platforms: parsed.platforms ?? {}
  };
}

function writeStore(config: AppConfig, store: HermesProfileConfigStore): void {
  const path = storePath(config);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify({ schemaVersion: HERMES_PROFILE_CONFIG_SCHEMA_VERSION, platforms: store.platforms ?? {} }, null, 2) + "\n", {
    mode: 0o600
  });
  renameSync(tmp, path);
}

function storePath(config: AppConfig): string {
  return join(config.growthRoot, "config", "hermes-profiles.json");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
