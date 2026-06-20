import type { HermesLlmSelection, SocialCronTaskType } from "@growth-hacker/core";

import type { AppConfig } from "./config";
import { resolvePlatformHermesAgent } from "./hermesProfiles";
import { buildSocialPlatformTaskCommand, type SocialTaskCommand } from "./socialPlatforms";

export type { SocialTaskCommand };

export function buildSocialTaskCommand(
  config: AppConfig,
  platform: string,
  profile: string,
  taskType: SocialCronTaskType,
  agentId = resolvePlatformHermesAgent(config, platform).id,
  llm?: HermesLlmSelection
): SocialTaskCommand {
  return buildSocialPlatformTaskCommand(config, { platform, profile, taskType, agentId, llm });
}
