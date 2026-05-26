import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { SocialPlatformInfo } from "@growth-hacker/core";

import type { AppConfig } from "./config";
import { runCommand } from "./shell";

const serverDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(serverDir, "../../..");
const youtubeCliEntrypoint = join(repoRoot, "packages/youtube-cli/src/cli.ts");

interface CliEnvelope<T = unknown> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

interface AuthStatusData {
  authenticated?: boolean;
  state?: string;
  tokenPath?: string;
  scopes?: string[];
  message?: string;
}

interface ChannelMineData {
  channel?: {
    id?: string;
    title?: string;
    customUrl?: string;
  };
}

export interface YoutubeProfileStatus {
  profile: string;
  cli: SocialPlatformInfo["cli"];
  auth: {
    authenticated: boolean;
    state: string;
    scopes: string[];
    tokenPath?: string;
    message?: string;
  };
  channel?: {
    id: string;
    title: string;
    customUrl?: string;
  };
  channelError?: {
    code: string;
    message: string;
  };
}

export async function getYoutubeCliStatus(): Promise<SocialPlatformInfo["cli"]> {
  if (!existsSync(youtubeCliEntrypoint)) {
    return {
      command: "yt-cli",
      state: "missing",
      message: "Repo-local yt-cli entrypoint is missing."
    };
  }
  return {
    command: "yt-cli",
    path: youtubeCliEntrypoint,
    state: "available"
  };
}

export async function getYoutubeProfileStatus(config: AppConfig, profile: string): Promise<YoutubeProfileStatus> {
  const cli = await getYoutubeCliStatus();
  if (cli.state !== "available") {
    return {
      profile,
      cli,
      auth: {
        authenticated: false,
        state: "missing",
        scopes: [],
        message: cli.message
      }
    };
  }

  const auth = await runYoutubeCli<AuthStatusData>(config, ["auth", "status", "--profile", profile, "--json"]);
  const authData = auth.envelope.data;
  const status: YoutubeProfileStatus = {
    profile,
    cli,
    auth: {
      authenticated: Boolean(auth.envelope.ok && authData?.authenticated),
      state: authData?.state ?? (auth.envelope.ok ? "unknown" : "unavailable"),
      scopes: Array.isArray(authData?.scopes) ? authData.scopes : [],
      ...(authData?.tokenPath ? { tokenPath: authData.tokenPath } : {}),
      ...(authData?.message ? { message: authData.message } : auth.envelope.error?.message ? { message: auth.envelope.error.message } : {})
    }
  };

  if (!status.auth.authenticated) return status;

  const channel = await runYoutubeCli<ChannelMineData>(config, ["channel", "mine", "--profile", profile, "--json"]);
  if (!channel.envelope.ok || !channel.envelope.data?.channel?.id || !channel.envelope.data.channel.title) {
    return {
      ...status,
      channelError: {
        code: channel.envelope.error?.code ?? "youtube_channel_unavailable",
        message: channel.envelope.error?.message ?? "Could not verify the authenticated YouTube channel."
      }
    };
  }

  return {
    ...status,
    channel: {
      id: channel.envelope.data.channel.id,
      title: channel.envelope.data.channel.title,
      ...(channel.envelope.data.channel.customUrl ? { customUrl: channel.envelope.data.channel.customUrl } : {})
    }
  };
}

async function runYoutubeCli<T>(config: AppConfig, args: string[]): Promise<{ envelope: CliEnvelope<T> }> {
  const result = await runCommand(process.execPath, ["--silent", youtubeCliEntrypoint, ...args, "--growth-root", config.growthRoot], {
    cwd: repoRoot,
    timeoutMs: 20_000
  });
  return { envelope: parseEnvelope<T>(result.stdout, result.exitCode) };
}

function parseEnvelope<T>(stdout: string, exitCode: number | null): CliEnvelope<T> {
  try {
    return JSON.parse(stdout) as CliEnvelope<T>;
  } catch {
    return {
      ok: false,
      error: {
        code: "youtube_cli_json_invalid",
        message: `yt-cli returned invalid JSON${exitCode === null ? "" : ` with exit code ${exitCode}`}.`
      }
    };
  }
}
