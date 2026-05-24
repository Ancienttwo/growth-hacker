import { describe, expect, test } from "bun:test";

import { isSocialTaskSupported, listSocialPlatformAdapters, supportedSocialTaskTypes } from "../src/socialPlatforms";

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
});
