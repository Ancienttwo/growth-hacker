import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type { AppConfig } from "../src/config";
import { artifactContentType, listArtifacts, listWorkspaces, readArtifact } from "../src/workspace";

function config(): AppConfig {
  const root = mkdtempSync(join(tmpdir(), "growth-hacker-workspace-"));
  return {
    growthRoot: join(root, ".growth"),
    hermesHome: join(root, ".hermes"),
    hermesApiBaseUrl: "http://127.0.0.1:8642",
    hermesApiKey: "",
    defaultHermesProfile: "growth-agent",
    socialAgents: [{ id: "growth-agent", runner: "local" }],
    socialCronAgents: ["growth-agent"],
    bundledXiaohongshuSkillRoot: join(root, "skill"),
    legacyXiaohongshuRoot: join(root, ".xiaohongshu", "client"),
    port: 0
  };
}

describe("workspace artifact access", () => {
  test("lists and reads canonical profile artifacts", () => {
    const appConfig = config();
    const profile = join(appConfig.growthRoot, "xiaohongshu", "astrozi");
    mkdirSync(profile, { recursive: true });
    writeFileSync(join(profile, "01-client-brief.md"), "# AstroZi\n");

    const artifacts = listArtifacts(appConfig, "xiaohongshu", "astrozi");
    expect(artifacts.map((item) => item.path)).toContain("01-client-brief.md");
    expect(readArtifact(appConfig, "xiaohongshu", "astrozi", "01-client-brief.md").content).toBe("# AstroZi\n");
  });

  test("blocks path traversal outside the profile", () => {
    const appConfig = config();
    const profile = join(appConfig.growthRoot, "xiaohongshu", "astrozi");
    mkdirSync(profile, { recursive: true });
    expect(() => readArtifact(appConfig, "xiaohongshu", "astrozi", "../secret.md")).toThrow("Path traversal blocked");
  });

  test("marks image and video artifacts as binary previews", () => {
    const appConfig = config();
    const profile = join(appConfig.growthRoot, "xiaohongshu", "astrozi");
    mkdirSync(profile, { recursive: true });
    writeFileSync(join(profile, "cover.png"), "not-a-real-png");
    writeFileSync(join(profile, "clip.mp4"), "not-a-real-mp4");

    const artifacts = listArtifacts(appConfig, "xiaohongshu", "astrozi");
    expect(artifacts.find((item) => item.path === "cover.png")?.mime).toBe("image");
    expect(artifacts.find((item) => item.path === "clip.mp4")?.mime).toBe("video");
    expect(readArtifact(appConfig, "xiaohongshu", "astrozi", "cover.png").binary).toBe(true);
    expect(readArtifact(appConfig, "xiaohongshu", "astrozi", "clip.mp4").binary).toBe(true);
    expect(artifactContentType("cover.png")).toBe("image/png");
    expect(artifactContentType("clip.mp4")).toBe("video/mp4");
  });

  test("does not expose internal stores as workspace platforms", () => {
    const appConfig = config();
    mkdirSync(join(appConfig.growthRoot, "xiaohongshu", "astrozi"), { recursive: true });
    mkdirSync(join(appConfig.growthRoot, "published-posts", "xiaohongshu"), { recursive: true });
    writeFileSync(join(appConfig.growthRoot, "published-posts", "xiaohongshu", "astrozi.json"), "{}");

    expect(listWorkspaces(appConfig).map((profile) => `${profile.platform}/${profile.profile}`)).toEqual(["xiaohongshu/astrozi"]);
  });
});
