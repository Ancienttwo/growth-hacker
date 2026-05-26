import { describe, expect, test } from "bun:test";

import { isSocialTaskSupported, listSocialPlatformAdapters, supportedSocialTaskTypes } from "../src/socialPlatforms";
import type { AppConfig } from "../src/config";

describe("social platform adapters", () => {
  test("registers current and planned CLI-backed platform modes", () => {
    expect(listSocialPlatformAdapters().map((adapter) => adapter.id)).toEqual(["xiaohongshu", "facebook", "x", "youtube"]);
  });

  test("keeps Xiaohongshu as the only scheduled task adapter until other CLIs are configured", () => {
    expect(supportedSocialTaskTypes("xiaohongshu")).toContain("auto-reply");
    expect(isSocialTaskSupported("xiaohongshu", "workspace-diagnosis")).toBe(true);
    expect(isSocialTaskSupported("facebook", "workspace-diagnosis")).toBe(false);
    expect(supportedSocialTaskTypes("youtube")).toEqual([]);
  });

  test("registers yt-cli as the YouTube account adapter command", () => {
    const youtube = listSocialPlatformAdapters().find((adapter) => adapter.id === "youtube");
    expect(youtube?.cliCommand).toBe("yt-cli");
    expect(youtube?.capabilities).toMatchObject({
      workspace: true,
      publishedPosts: false,
      comments: false,
      autoReplies: false,
      scheduledTasks: []
    });
  });

  test("detects the repo-local yt-cli entrypoint", async () => {
    const youtube = listSocialPlatformAdapters().find((adapter) => adapter.id === "youtube");
    const status = await youtube?.cliStatus?.(testConfig());

    expect(status).toMatchObject({
      command: "yt-cli",
      state: "available"
    });
    expect(status?.path).toContain("packages/youtube-cli/src/cli.ts");
  });
});

function testConfig(): AppConfig {
  return {
    growthRoot: "/tmp/growth-hacker-test",
    hermesHome: "/tmp/hermes-test",
    hermesApiBaseUrl: "http://127.0.0.1:8642",
    hermesApiKey: "",
    defaultHermesProfile: "growth-agent",
    socialAgents: [{ id: "growth-agent", runner: "local" }],
    socialCronAgents: ["growth-agent"],
    bundledXiaohongshuSkillRoot: "/tmp/xhs-skill",
    legacyXiaohongshuRoot: "/tmp/xhs-legacy",
    port: 8787
  };
}
