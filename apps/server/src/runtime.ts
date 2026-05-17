import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import type { RuntimeStatus } from "@growth-hacker/core";

import type { AppConfig } from "./config";
import { commandExists, runCommand } from "./shell";

export async function getRuntimeStatuses(config: AppConfig): Promise<RuntimeStatus[]> {
  return [await getHermesStatus(config), await getOpenClawStatus()];
}

export async function getHermesStatus(config: AppConfig): Promise<RuntimeStatus> {
  const command = await commandExists("hermes");
  if (!command) {
    return {
      kind: "hermes",
      state: "missing",
      guidance: "Install Hermes before running agent workflows."
    };
  }
  const [status, profiles, skills] = await Promise.all([
    runCommand(command, ["status", "--all"], { timeoutMs: 15000 }),
    runCommand(command, ["profile", "list"], { timeoutMs: 10000 }),
    runCommand(command, ["-p", config.defaultHermesProfile, "skills", "list", "--enabled-only"], { timeoutMs: 15000 })
  ]);
  const profileExists = profiles.stdout.includes(config.defaultHermesProfile);
  const skillInstalled =
    skills.stdout.includes("xiaohongshu-skill") ||
    existsSync(join(config.hermesHome, "profiles", config.defaultHermesProfile, "skills", "social-media", "xiaohongshu-skill"));
  return {
    kind: "hermes",
    state: status.exitCode === 0 ? "available" : "degraded",
    command,
    profileExists,
    skillInstalled,
    raw: redactRuntimeOutput([status.stdout, profiles.stdout, skills.stdout || skills.stderr].filter(Boolean).join("\n\n"))
  };
}

export async function getOpenClawStatus(): Promise<RuntimeStatus> {
  const command = (await commandExists("openclaw")) ?? (await commandExists("claw"));
  if (!command) {
    return {
      kind: "openclaw",
      state: "missing",
      guidance: "OpenClaw runtime is optional in v1; Hermes is the default runner."
    };
  }
  const result = await runCommand(command, ["--version"], { timeoutMs: 10000 });
  return {
    kind: "openclaw",
    state: result.exitCode === 0 ? "available" : "degraded",
    command,
    version: result.stdout.trim() || result.stderr.trim(),
    guidance: "OpenClaw is detected but v1 uses Hermes as the default runner."
  };
}

function redactRuntimeOutput(value: string): string {
  return value
    .replace(/(Auth file:\s+).+/g, "$1[REDACTED]")
    .replace(/(home:\s+)[^\s)]+/g, "$1[REDACTED]")
    .replace(/(PID\(s\):\s+).+/g, "$1[REDACTED]");
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

  const target = join(config.hermesHome, "profiles", config.defaultHermesProfile, "skills", "social-media", "xiaohongshu-skill");
  let syncedSkill = false;
  if (!existsSync(target) && existsSync(config.bundledXiaohongshuSkillRoot)) {
    mkdirSync(join(config.hermesHome, "profiles", config.defaultHermesProfile, "skills", "social-media"), { recursive: true });
    cpSync(config.bundledXiaohongshuSkillRoot, target, {
      recursive: true,
      filter: (source) => {
        const parts = relative(config.bundledXiaohongshuSkillRoot, source).split(sep);
        return !parts.some((part) => part === "__pycache__" || part === ".pytest_cache" || part === "dist");
      }
    });
    syncedSkill = true;
  }

  return {
    ok: true,
    createdProfile,
    syncedSkill,
    profile: config.defaultHermesProfile,
    skillTarget: target
  };
}
