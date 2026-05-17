import {
  XIAOHONGSHU_PLATFORM,
  type PlatformId,
  type SocialCronTaskType,
  type SocialPlatformInfo,
  type WorkspaceProfile
} from "@growth-hacker/core";

export type DashboardView =
  | "workspace"
  | "knowledge"
  | "published"
  | "replies"
  | "calendar"
  | "board"
  | "chat"
  | "hermes"
  | "skills"
  | "jobs"
  | "setup";

export const platformModeStorageKey = "growth-hacker.platformMode";
export const defaultPlatformMode: PlatformId = XIAOHONGSHU_PLATFORM;
export const platformModeIds: PlatformId[] = [XIAOHONGSHU_PLATFORM, "facebook", "x", "youtube"];
export const sharedDashboardViews: DashboardView[] = ["workspace", "knowledge", "calendar", "board", "chat", "hermes", "skills", "jobs", "setup"];
const platformLogoPaths: Partial<Record<PlatformId, string>> = {
  [XIAOHONGSHU_PLATFORM]: "/platform-logos/xiaohongshu.svg",
  facebook: "/platform-logos/facebook.svg",
  x: "/platform-logos/x.svg",
  youtube: "/platform-logos/youtube.svg"
};

const allXhsScheduledTasks: SocialCronTaskType[] = ["workspace-diagnosis", "daily-ops-refresh", "health-report", "auto-reply"];
const noCliCapabilities: SocialPlatformInfo["capabilities"] = {
  workspace: true,
  publishedPosts: false,
  comments: false,
  autoReplies: false,
  scheduledTasks: []
};

export const fallbackSocialPlatforms: SocialPlatformInfo[] = [
  {
    id: XIAOHONGSHU_PLATFORM,
    label: "Xiaohongshu",
    shortLabel: "XHS",
    cli: { command: "xhs", state: "degraded", message: "platform status unavailable" },
    capabilities: {
      workspace: true,
      publishedPosts: true,
      comments: true,
      autoReplies: true,
      scheduledTasks: allXhsScheduledTasks
    }
  },
  {
    id: "facebook",
    label: "Facebook",
    shortLabel: "FB",
    cli: { state: "not-configured", message: "Facebook CLI adapter is not configured yet." },
    capabilities: noCliCapabilities
  },
  {
    id: "x",
    label: "X / Twitter",
    shortLabel: "X",
    cli: { state: "not-configured", message: "X / Twitter CLI adapter is not configured yet." },
    capabilities: noCliCapabilities
  },
  {
    id: "youtube",
    label: "YouTube",
    shortLabel: "YT",
    cli: { state: "not-configured", message: "YouTube CLI adapter is not configured yet." },
    capabilities: noCliCapabilities
  }
];

export function normalizePlatformMode(value: string | null | undefined, platforms: SocialPlatformInfo[] = fallbackSocialPlatforms): PlatformId {
  const candidates = new Set(platforms.map((platform) => platform.id));
  return value && candidates.has(value as PlatformId) ? (value as PlatformId) : defaultPlatformMode;
}

export function socialPlatformInfo(platforms: SocialPlatformInfo[], id: PlatformId): SocialPlatformInfo {
  return platforms.find((platform) => platform.id === id) ?? fallbackSocialPlatforms.find((platform) => platform.id === id) ?? fallbackSocialPlatforms[0];
}

export function platformLogoSrc(id: PlatformId): string | undefined {
  return platformLogoPaths[id];
}

export function platformSpecificDashboardViews(platform: SocialPlatformInfo): DashboardView[] {
  const views: DashboardView[] = [];
  if (platform.capabilities.publishedPosts) views.push("published");
  if (platform.capabilities.autoReplies) views.push("replies");
  return views;
}

export function visibleDashboardViews(platform: SocialPlatformInfo): DashboardView[] {
  return [...platformSpecificDashboardViews(platform), ...sharedDashboardViews];
}

export function viewSupportedByPlatform(view: DashboardView, platform: SocialPlatformInfo): boolean {
  if (sharedDashboardViews.includes(view)) return true;
  return platformSpecificDashboardViews(platform).includes(view);
}

export function resolveDashboardViewForPlatform(view: DashboardView, platform: SocialPlatformInfo): DashboardView {
  return viewSupportedByPlatform(view, platform) ? view : "workspace";
}

export function selectProfileForPlatform(
  profiles: WorkspaceProfile[],
  platform: PlatformId,
  preferred?: WorkspaceProfile | null
): WorkspaceProfile | null {
  if (preferred?.platform === platform && profiles.some((profile) => isSameWorkspace(profile, preferred))) return preferred;
  return profiles.find((profile) => profile.platform === platform) ?? null;
}

export function isSameWorkspace(left: WorkspaceProfile | null | undefined, right: WorkspaceProfile | null | undefined): boolean {
  return Boolean(left && right && left.platform === right.platform && left.profile === right.profile);
}
