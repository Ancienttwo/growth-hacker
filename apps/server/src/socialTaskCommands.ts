import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { HermesLlmSelection, SocialCronTaskType } from "@growth-hacker/core";
import { XIAOHONGSHU_PLATFORM } from "@growth-hacker/core";

import type { AppConfig } from "./config";
import { profileRoot, safeStat } from "./workspace";

const serverDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(serverDir, "../../..");

export interface SocialTaskCommand {
  command: string;
  args: string[];
  cwd: string;
}

export function buildSocialTaskCommand(
  config: AppConfig,
  platform: string,
  profile: string,
  taskType: SocialCronTaskType,
  agentId = config.defaultHermesProfile,
  llm?: HermesLlmSelection
): SocialTaskCommand {
  if (platform !== XIAOHONGSHU_PLATFORM) throw new Error(`platform_not_supported:${platform}`);
  const root = profileRoot(config, platform, profile);
  if (!safeStat(root)?.isDirectory()) throw new Error(`profile_not_found:${platform}/${profile}`);

  const python = process.env.PYTHON ?? "python3";
  const scriptRoot = config.bundledXiaohongshuSkillRoot;
  if (taskType === "auto-reply") {
    const llmArgs = llm ? ["--llm-provider", llm.provider, "--llm-model", llm.model] : [];
    return {
      command: process.execPath,
      args: [join(serverDir, "xhsAutoReplyRunner.ts"), "--profile", profile, "--agent-id", agentId, ...llmArgs],
      cwd: repoRoot
    };
  }
  if (taskType === "workspace-diagnosis") {
    return {
      command: python,
      args: [join(scriptRoot, "scripts", "diagnose_workspace.py"), "--client-dir", root],
      cwd: scriptRoot
    };
  }
  if (taskType === "daily-ops-refresh") {
    return {
      command: python,
      args: [
        join(scriptRoot, "scripts", "build_daily_ops.py"),
        "--brief",
        join(root, "01-client-brief.md"),
        "--calendar",
        join(root, "04-content-calendar.md"),
        "--output",
        join(root, "05-daily-ops.md")
      ],
      cwd: scriptRoot
    };
  }
  return {
    command: python,
    args: [
      join(scriptRoot, "scripts", "score_health.py"),
      "--metrics",
      join(root, "metrics.csv"),
      "--output",
      join(root, "06-health-report.md")
    ],
    cwd: scriptRoot
  };
}
