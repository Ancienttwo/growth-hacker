import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_GROWTH_AGENT } from "@growth-hacker/core";
import type { AgentRunnerKind, SocialAgent } from "@growth-hacker/core";

export interface AppConfig {
  growthRoot: string;
  hermesHome: string;
  defaultHermesProfile: string;
  socialAgents: SocialAgent[];
  socialCronAgents: string[];
  bundledXiaohongshuSkillRoot: string;
  legacyXiaohongshuRoot: string;
  port: number;
}

interface RawConfig {
  growthRoot?: string;
  hermesHome?: string;
  defaultHermesProfile?: string;
  socialAgents?: Array<string | { id: string; runner?: AgentRunnerKind }>;
  socialCronAgents?: string[];
  bundledXiaohongshuSkillRoot?: string;
  legacyXiaohongshuRoot?: string;
  port?: number;
}

const serverDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(serverDir, "../../..");

export function expandHome(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return resolve(homedir(), value.slice(2));
  return resolve(value);
}

function readRawConfig(cwd = process.cwd()): RawConfig {
  const path = resolve(cwd, "growth-hacker.config.json");
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as RawConfig;
}

export function loadConfig(cwd = process.cwd()): AppConfig {
  const raw = readRawConfig(cwd);
  const defaultBundled = resolve(repoRoot, "skills/social-media/xiaohongshu-skill");
  const localHermesSkill = resolve(homedir(), ".hermes/skills/social-media/xiaohongshu-skill");
  const bundledRoot = raw.bundledXiaohongshuSkillRoot
    ? expandHome(raw.bundledXiaohongshuSkillRoot)
    : existsSync(defaultBundled)
      ? defaultBundled
      : localHermesSkill;

  const defaultHermesProfile = raw.defaultHermesProfile ?? DEFAULT_GROWTH_AGENT;
  const socialAgents = normalizeSocialAgents(raw.socialAgents, raw.socialCronAgents, defaultHermesProfile);

  return {
    growthRoot: expandHome(raw.growthRoot ?? process.env.GROWTH_HACKER_HOME ?? "~/.growth"),
    hermesHome: expandHome(raw.hermesHome ?? "~/.hermes"),
    defaultHermesProfile,
    socialAgents,
    socialCronAgents: socialAgents.map((agent) => agent.id),
    bundledXiaohongshuSkillRoot: bundledRoot,
    legacyXiaohongshuRoot: expandHome(raw.legacyXiaohongshuRoot ?? "~/.xiaohongshu/client"),
    port: Number(process.env.PORT ?? raw.port ?? 8787)
  };
}

function normalizeSocialAgents(
  socialAgents: RawConfig["socialAgents"],
  legacyAgents: string[] | undefined,
  defaultAgent: string
): SocialAgent[] {
  const entries = socialAgents?.length ? socialAgents : [defaultAgent, ...(legacyAgents ?? [])];
  const byId = new Map<string, SocialAgent>();
  for (const entry of entries) {
    const agent = typeof entry === "string" ? { id: entry, runner: "local" as const } : { id: entry.id, runner: entry.runner ?? "local" };
    const id = agent.id.trim();
    if (!id) continue;
    byId.set(id, { id, runner: agent.runner });
  }
  if (!byId.has(defaultAgent)) byId.set(defaultAgent, { id: defaultAgent, runner: "local" });
  return [...byId.values()];
}
