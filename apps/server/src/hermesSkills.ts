import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import type { HermesSkillInfo } from "@growth-hacker/core";

import type { AppConfig } from "./config";

interface ProfileSkillConfig {
  path: string;
  data: Record<string, unknown>;
}

export function listHermesProfileSkills(config: AppConfig, agentId: string): HermesSkillInfo[] {
  assertAllowedAgent(config, agentId);
  const skillsRoot = profileSkillsRoot(config, agentId);
  if (!existsSync(skillsRoot)) return [];

  const disabled = readDisabledSkills(config, agentId);
  return findSkillFiles(skillsRoot)
    .map((path) => skillInfoFromFile(skillsRoot, path, disabled))
    .sort(sortHermesSkills);
}

export function updateHermesProfileSkill(config: AppConfig, agentId: string, skillName: string, enabled: boolean): HermesSkillInfo {
  const skills = listHermesProfileSkills(config, agentId);
  const skill = skills.find((item) => item.name === skillName);
  if (!skill) throw new Error(`skill_not_found:${skillName}`);

  const profileConfig = readProfileSkillConfig(config, agentId);
  const skillsConfig = recordValue(profileConfig.data.skills);
  const disabled = normalizeStringSet(skillsConfig.disabled);
  if (enabled) {
    disabled.delete(skillName);
  } else {
    disabled.add(skillName);
  }
  skillsConfig.disabled = [...disabled].sort((a, b) => a.localeCompare(b));
  profileConfig.data.skills = skillsConfig;

  mkdirSync(dirname(profileConfig.path), { recursive: true });
  writeFileSync(profileConfig.path, Bun.YAML.stringify(profileConfig.data, null, 2), "utf8");

  return {
    ...skill,
    enabled,
    status: enabled ? "enabled" : "disabled"
  };
}

function assertAllowedAgent(config: AppConfig, agentId: string): void {
  if (!config.socialAgents.some((agent) => agent.id === agentId)) {
    throw new Error(`agent_not_allowed:${agentId}`);
  }
  if (!/^[a-zA-Z0-9_.:-]+$/.test(agentId)) {
    throw new Error(`invalid_agent_id:${agentId}`);
  }
}

function profileSkillsRoot(config: AppConfig, agentId: string): string {
  return join(config.hermesHome, "profiles", agentId, "skills");
}

function profileConfigPath(config: AppConfig, agentId: string): string {
  return join(config.hermesHome, "profiles", agentId, "config.yaml");
}

function readDisabledSkills(config: AppConfig, agentId: string): Set<string> {
  const profileConfig = readProfileSkillConfig(config, agentId);
  return normalizeStringSet(recordValue(profileConfig.data.skills).disabled);
}

function readProfileSkillConfig(config: AppConfig, agentId: string): ProfileSkillConfig {
  assertAllowedAgent(config, agentId);
  const path = profileConfigPath(config, agentId);
  if (!existsSync(path)) return { path, data: {} };
  const parsed = Bun.YAML.parse(readFileSync(path, "utf8"));
  return { path, data: recordValue(parsed) };
}

function findSkillFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    if (entry.startsWith(".")) continue;
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...findSkillFiles(path));
    } else if (entry === "SKILL.md") {
      files.push(path);
    }
  }
  return files;
}

function skillInfoFromFile(skillsRoot: string, path: string, disabled: Set<string>): HermesSkillInfo {
  const content = readFileSync(path, "utf8");
  const frontmatter = parseFrontmatter(content);
  const relativeDir = relative(skillsRoot, dirname(path));
  const parts = relativeDir.split("/").filter(Boolean);
  const name = stringValue(frontmatter.name) || parts.at(-1) || "skill";
  const category = stringValue(frontmatter.category) || (parts.length > 1 ? parts.slice(0, -1).join("/") : "");
  const description = stringValue(frontmatter.description);
  const enabled = !disabled.has(name);
  return {
    name,
    category,
    description,
    path,
    enabled,
    status: enabled ? "enabled" : "disabled"
  };
}

function parseFrontmatter(content: string): Record<string, unknown> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!match) return {};
  try {
    return recordValue(Bun.YAML.parse(match[1]));
  } catch {
    return {};
  }
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeStringSet(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()));
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sortHermesSkills(a: HermesSkillInfo, b: HermesSkillInfo): number {
  if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
  return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
}
