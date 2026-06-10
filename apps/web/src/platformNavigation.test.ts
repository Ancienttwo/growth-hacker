import { describe, expect, test } from "bun:test";

import type { WorkspaceProfile } from "@growth-hacker/core";

import {
  fallbackSocialPlatforms,
  normalizePlatformMode,
  platformLogoSrc,
  resolveDashboardViewForPlatform,
  selectProfileForPlatform,
  socialPlatformInfo,
  visibleDashboardViews
} from "./platformNavigation";

const platforms = fallbackSocialPlatforms;

describe("platform navigation", () => {
  test("falls back to Xiaohongshu for stale stored modes", () => {
    expect(normalizePlatformMode("unknown-platform", platforms)).toBe("xiaohongshu");
    expect(normalizePlatformMode(null, platforms)).toBe("xiaohongshu");
  });

  test("keeps Xiaohongshu-only tools visible only for the Xiaohongshu adapter", () => {
    expect(visibleDashboardViews(socialPlatformInfo(platforms, "xiaohongshu"))).toEqual([
      "published",
      "replies",
      "workspace",
      "knowledge",
      "calendar",
      "board",
      "chat",
      "hermes",
      "skills",
      "config",
      "setup"
    ]);
    expect(visibleDashboardViews(socialPlatformInfo(platforms, "facebook"))).toEqual([
      "workspace",
      "knowledge",
      "calendar",
      "board",
      "chat",
      "hermes",
      "skills",
      "config",
      "setup"
    ]);
  });

  test("moves an unsupported mode-specific view back to workspace", () => {
    expect(resolveDashboardViewForPlatform("replies", socialPlatformInfo(platforms, "youtube"))).toBe("workspace");
    expect(resolveDashboardViewForPlatform("chat", socialPlatformInfo(platforms, "youtube"))).toBe("chat");
  });

  test("preserves per-platform profile selection when the profile still exists", () => {
    const profiles: WorkspaceProfile[] = [
      profile("xiaohongshu", "astrozi"),
      profile("facebook", "astrozi"),
      profile("facebook", "backup")
    ];

    expect(selectProfileForPlatform(profiles, "facebook", profile("facebook", "backup"))).toMatchObject({
      platform: "facebook",
      profile: "backup"
    });
    expect(selectProfileForPlatform(profiles, "youtube", profile("facebook", "backup"))).toBeNull();
  });

  test("maps switcher modes to local logo assets", () => {
    expect(platformLogoSrc("xiaohongshu")).toBe("/platform-logos/xiaohongshu.svg");
    expect(platformLogoSrc("facebook")).toBe("/platform-logos/facebook.svg");
    expect(platformLogoSrc("x")).toBe("/platform-logos/x.svg");
    expect(platformLogoSrc("youtube")).toBe("/platform-logos/youtube.svg");
  });
});

function profile(platform: WorkspaceProfile["platform"], name: string): WorkspaceProfile {
  return {
    platform,
    profile: name,
    path: `/tmp/${name}/${platform}`,
    artifactCount: 1
  };
}
