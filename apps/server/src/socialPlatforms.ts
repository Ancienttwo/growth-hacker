import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type HermesLlmSelection,
  type PlatformId,
  type SocialCronTaskType,
  type SocialPlatformCapabilities,
  type SocialPlatformInfo,
  XIAOHONGSHU_PLATFORM
} from "@growth-hacker/core";

import type { AppConfig } from "./config";
import { commandExists } from "./shell";
import { profileRoot, safeStat, xhsDocumentRoot } from "./workspace";
import { getXhsAuthStatus } from "./xhs";

const serverDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(serverDir, "../../..");
const allXhsScheduledTasks: SocialCronTaskType[] = ["workspace-diagnosis", "daily-ops-refresh", "health-report", "auto-reply"];

export interface SocialTaskCommand {
  command: string;
  args: string[];
  cwd: string;
}

export interface BuildSocialTaskCommandInput {
  platform: string;
  profile: string;
  taskType: SocialCronTaskType;
  agentId?: string;
  llm?: HermesLlmSelection;
}

export interface SocialPlatformAdapter {
  id: PlatformId;
  label: string;
  shortLabel: string;
  cliCommand?: string;
  cliMissingMessage: string;
  capabilities: SocialPlatformCapabilities;
  buildTaskCommand?: (config: AppConfig, input: BuildSocialTaskCommandInput) => SocialTaskCommand;
  cliStatus?: (config: AppConfig) => Promise<SocialPlatformInfo["cli"]>;
}

const noCliCapabilities: SocialPlatformCapabilities = {
  workspace: true,
  publishedPosts: false,
  comments: false,
  autoReplies: false,
  scheduledTasks: []
};

const socialPlatformAdapters: SocialPlatformAdapter[] = [
  {
    id: XIAOHONGSHU_PLATFORM,
    label: "Xiaohongshu",
    shortLabel: "XHS",
    cliCommand: "xhs",
    cliMissingMessage: "xhs CLI not found. Install with `uv tool install xiaohongshu-cli`.",
    capabilities: {
      workspace: true,
      publishedPosts: true,
      comments: true,
      autoReplies: true,
      scheduledTasks: allXhsScheduledTasks
    },
    buildTaskCommand: buildXiaohongshuTaskCommand,
    cliStatus: xiaohongshuCliStatus
  },
  {
    id: "facebook",
    label: "Facebook",
    shortLabel: "FB",
    cliMissingMessage: "Facebook CLI adapter is not configured yet.",
    capabilities: noCliCapabilities
  },
  {
    id: "x",
    label: "X / Twitter",
    shortLabel: "X",
    cliMissingMessage: "X / Twitter CLI adapter is not configured yet.",
    capabilities: noCliCapabilities
  },
  {
    id: "youtube",
    label: "YouTube",
    shortLabel: "YT",
    cliCommand: "yt-cli",
    cliMissingMessage: "yt-cli not found. Run `bun --silent run yt-cli -- auth status --json` from this repo or link the package bin.",
    capabilities: noCliCapabilities
  }
];

export function listSocialPlatformAdapters(): SocialPlatformAdapter[] {
  return socialPlatformAdapters;
}

export function getSocialPlatformAdapter(platform: string): SocialPlatformAdapter | undefined {
  return socialPlatformAdapters.find((adapter) => adapter.id === platform);
}

export async function listSocialPlatforms(config: AppConfig): Promise<SocialPlatformInfo[]> {
  return Promise.all(socialPlatformAdapters.map((adapter) => socialPlatformInfo(config, adapter)));
}

export function isSocialTaskSupported(platform: string, taskType: SocialCronTaskType): boolean {
  return Boolean(getSocialPlatformAdapter(platform)?.capabilities.scheduledTasks.includes(taskType));
}

export function supportedSocialTaskTypes(platform: string): SocialCronTaskType[] {
  return getSocialPlatformAdapter(platform)?.capabilities.scheduledTasks ?? [];
}

export function assertSocialTaskSupported(platform: string, taskType: SocialCronTaskType): void {
  const adapter = getSocialPlatformAdapter(platform);
  if (!adapter) throw new Error(`platform_not_supported:${platform}`);
  if (!adapter.capabilities.scheduledTasks.includes(taskType)) throw new Error(`task_not_supported:${platform}/${taskType}`);
}

export function buildSocialPlatformTaskCommand(config: AppConfig, input: BuildSocialTaskCommandInput): SocialTaskCommand {
  const adapter = getSocialPlatformAdapter(input.platform);
  if (!adapter?.buildTaskCommand) throw new Error(`platform_not_supported:${input.platform}`);
  assertSocialTaskSupported(input.platform, input.taskType);
  return adapter.buildTaskCommand(config, input);
}

async function socialPlatformInfo(config: AppConfig, adapter: SocialPlatformAdapter): Promise<SocialPlatformInfo> {
  return {
    id: adapter.id,
    label: adapter.label,
    shortLabel: adapter.shortLabel,
    cli: adapter.cliStatus ? await adapter.cliStatus(config) : await defaultCliStatus(adapter),
    capabilities: adapter.capabilities
  };
}

async function defaultCliStatus(adapter: SocialPlatformAdapter): Promise<SocialPlatformInfo["cli"]> {
  if (!adapter.cliCommand) {
    return {
      state: "not-configured",
      message: adapter.cliMissingMessage
    };
  }
  const path = await commandExists(adapter.cliCommand);
  if (!path) {
    return {
      command: adapter.cliCommand,
      state: "missing",
      message: adapter.cliMissingMessage
    };
  }
  return {
    command: adapter.cliCommand,
    path,
    state: "available"
  };
}

async function xiaohongshuCliStatus(): Promise<SocialPlatformInfo["cli"]> {
  const path = await commandExists("xhs");
  const auth = await getXhsAuthStatus();
  return {
    command: "xhs",
    path,
    state: auth.installed ? "available" : "missing",
    authenticated: auth.authenticated,
    authState: auth.state,
    message: auth.message
  };
}

function buildXiaohongshuTaskCommand(config: AppConfig, input: BuildSocialTaskCommandInput): SocialTaskCommand {
  const profile = input.profile;
  const agentId = input.agentId ?? config.defaultHermesProfile;
  const root = profileRoot(config, XIAOHONGSHU_PLATFORM, profile);
  if (!safeStat(root)?.isDirectory()) throw new Error(`profile_not_found:${XIAOHONGSHU_PLATFORM}/${profile}`);
  const documentRoot = xhsDocumentRoot(config, profile);
  const artifactRoot = safeStat(documentRoot)?.isDirectory() ? documentRoot : root;

  const python = process.env.PYTHON ?? "python3";
  const scriptRoot = config.bundledXiaohongshuSkillRoot;
  if (input.taskType === "auto-reply") {
    const llmArgs = input.llm ? ["--llm-provider", input.llm.provider, "--llm-model", input.llm.model] : [];
    return {
      command: process.execPath,
      args: [join(serverDir, "xhsAutoReplyRunner.ts"), "--profile", profile, "--agent-id", agentId, ...llmArgs],
      cwd: repoRoot
    };
  }
  if (input.taskType === "workspace-diagnosis") {
    return {
      command: python,
      args: [join(scriptRoot, "scripts", "diagnose_workspace.py"), "--client-dir", artifactRoot],
      cwd: scriptRoot
    };
  }
  if (input.taskType === "daily-ops-refresh") {
    return {
      command: python,
      args: [
        join(scriptRoot, "scripts", "build_daily_ops.py"),
        "--brief",
        join(artifactRoot, "01-client-brief.md"),
        "--calendar",
        join(artifactRoot, "04-content-calendar.md"),
        "--output",
        join(artifactRoot, "05-daily-ops.md")
      ],
      cwd: scriptRoot
    };
  }
  return {
    command: python,
    args: [
      join(scriptRoot, "scripts", "score_health.py"),
      "--metrics",
      join(artifactRoot, "metrics.csv"),
      "--output",
      join(artifactRoot, "06-health-report.md")
    ],
    cwd: scriptRoot
  };
}
