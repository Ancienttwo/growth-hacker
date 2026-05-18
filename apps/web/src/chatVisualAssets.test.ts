import { describe, expect, test } from "bun:test";

import type { ArtifactInfo, WorkspaceProfile } from "@growth-hacker/core";

import { appendVisualAssetContext, buildVisualAssetInstructions, resolveReusableVisualAssets } from "./chatVisualAssets";

function imageArtifact(overrides: Partial<ArtifactInfo>): ArtifactInfo {
  return {
    platform: "xiaohongshu",
    profile: "demo",
    path: "artifacts/images/generated.png",
    name: "generated.png",
    kind: "file",
    mime: "image",
    size: 1024,
    updatedAt: "2026-05-18T10:00:00.000Z",
    ...overrides
  };
}

const profile: WorkspaceProfile = {
  platform: "xiaohongshu",
  profile: "demo",
  path: "/Users/chris/.growth/workspaces/xiaohongshu/demo",
  artifactCount: 1
};

describe("chat visual asset context", () => {
  test("reuses the latest generated image from prior chat output", () => {
    const assets = resolveReusableVisualAssets("用之前生成的配图写一版小红书正文", [
      {
        output: "DONE\n\n![generated image](file:///Users/chris/.hermes/cache/images/old.png)"
      },
      {
        output: "DONE\n\n![generated image](/Users/chris/.hermes/cache/images/latest.png)"
      }
    ]);

    expect(assets.map((asset) => asset.source)).toEqual([
      "/Users/chris/.hermes/cache/images/latest.png",
      "/Users/chris/.hermes/cache/images/old.png"
    ]);
    expect(assets[0]).toMatchObject({ label: "latest", origin: "chat" });
  });

  test("falls back to workspace image artifacts when chat output has no image", () => {
    const assets = resolveReusableVisualAssets(
      "继续用这张图做封面",
      [],
      [
        imageArtifact({ path: "artifacts/images/old.png", updatedAt: "2026-05-18T08:00:00.000Z" }),
        imageArtifact({ path: "artifacts/images/new.png", updatedAt: "2026-05-18T09:00:00.000Z" })
      ],
      profile
    );

    expect(assets.map((asset) => asset.source)).toEqual([
      "/Users/chris/.growth/workspaces/xiaohongshu/demo/artifacts/images/new.png",
      "/Users/chris/.growth/workspaces/xiaohongshu/demo/artifacts/images/old.png"
    ]);
  });

  test("does not attach image context for non-visual chat", () => {
    const assets = resolveReusableVisualAssets("帮我整理一下今天的待办", [
      { output: "![generated image](/Users/chris/.hermes/cache/images/latest.png)" }
    ]);

    expect(assets).toEqual([]);
  });

  test("builds a reuse contract that prefers baoyu-infographic for visual work", () => {
    const assets = [{ source: "/Users/chris/.hermes/cache/images/latest.png", label: "latest", origin: "chat" as const }];

    expect(appendVisualAssetContext("继续优化文案", assets)).toContain("Existing visual assets");
    expect(buildVisualAssetInstructions(assets)).toContain('skill_view("baoyu-infographic")');
    expect(buildVisualAssetInstructions(assets)).toContain("reuse the latest listed asset instead of creating a new image");
  });
});
