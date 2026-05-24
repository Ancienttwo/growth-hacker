import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type { AppConfig } from "../src/config";
import {
  artifactContentType,
  createWorkspaceProfile,
  ensureXhsWorkspaceForAuth,
  listArtifacts,
  listVaultArtifacts,
  listWorkspaces,
  persistChatUpload,
  readArtifact,
  readVaultArtifact
} from "../src/workspace";

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
    const profile = join(appConfig.growthRoot, "astrozi", "xiaohongshu");
    mkdirSync(profile, { recursive: true });
    writeFileSync(join(profile, "01-client-brief.md"), "# AstroZi\n");

    const artifacts = listArtifacts(appConfig, "xiaohongshu", "astrozi");
    expect(artifacts.map((item) => item.path)).toContain("01-client-brief.md");
    expect(readArtifact(appConfig, "xiaohongshu", "astrozi", "01-client-brief.md").content).toBe("# AstroZi\n");
  });

  test("blocks path traversal outside the profile", () => {
    const appConfig = config();
    const profile = join(appConfig.growthRoot, "astrozi", "xiaohongshu");
    mkdirSync(profile, { recursive: true });
    expect(() => readArtifact(appConfig, "xiaohongshu", "astrozi", "../secret.md")).toThrow("Path traversal blocked");
  });

  test("marks image and video artifacts as binary previews", () => {
    const appConfig = config();
    const profile = join(appConfig.growthRoot, "astrozi", "xiaohongshu");
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

  test("persists pasted chat images under profile artifacts", async () => {
    const appConfig = config();
    const upload = await persistChatUpload(appConfig, new File(["png-bytes"], "Screenshot 1.png", { type: "image/png" }), {
      platform: "xiaohongshu",
      profile: "astrozi"
    });

    expect(upload.artifact).toMatchObject({
      platform: "xiaohongshu",
      profile: "astrozi",
      kind: "file",
      mime: "image"
    });
    expect(upload.artifact.path.startsWith("artifacts/chat-uploads/")).toBe(true);
    expect(upload.artifact.path.endsWith("-Screenshot-1.png")).toBe(true);
    expect(readFileSync(upload.absolutePath, "utf8")).toBe("png-bytes");
  });

  test("does not expose internal stores as workspace platforms", () => {
    const appConfig = config();
    mkdirSync(join(appConfig.growthRoot, "astrozi", "xiaohongshu"), { recursive: true });
    mkdirSync(join(appConfig.growthRoot, "published-posts", "xiaohongshu"), { recursive: true });
    mkdirSync(join(appConfig.growthRoot, "vault", "reviews"), { recursive: true });
    writeFileSync(join(appConfig.growthRoot, "published-posts", "xiaohongshu", "astrozi.json"), "{}");

    expect(listWorkspaces(appConfig).map((profile) => `${profile.platform}/${profile.profile}`)).toEqual(["xiaohongshu/astrozi"]);
  });

  test("lists and reads vault artifacts without exposing the vault as a platform workspace", () => {
    const appConfig = config();
    mkdirSync(join(appConfig.growthRoot, "vault", "10-Posts"), { recursive: true });
    writeFileSync(join(appConfig.growthRoot, "vault", "10-Posts", "note.md"), "# Note\n");

    const artifacts = listVaultArtifacts(appConfig);

    expect(artifacts.map((item) => item.path)).toContain("10-Posts/note.md");
    expect(artifacts.find((item) => item.path === "10-Posts/note.md")).toMatchObject({
      platform: "vault",
      profile: "vault",
      mime: "markdown"
    });
    expect(readVaultArtifact(appConfig, "10-Posts/note.md").content).toBe("# Note\n");
    expect(() => readVaultArtifact(appConfig, "../secret.md")).toThrow("Path traversal blocked");
    expect(listWorkspaces(appConfig)).toEqual([]);
  });

  test("lists profile-first multi-platform workspaces", () => {
    const appConfig = config();
    mkdirSync(join(appConfig.growthRoot, "astrozi", "xiaohongshu"), { recursive: true });
    mkdirSync(join(appConfig.growthRoot, "astrozi", "x"), { recursive: true });
    mkdirSync(join(appConfig.growthRoot, "astrozi", "facebook"), { recursive: true });
    mkdirSync(join(appConfig.growthRoot, "astrozi", "youtube"), { recursive: true });

    expect(listWorkspaces(appConfig).map((profile) => `${profile.profile}/${profile.platform}`).sort()).toEqual([
      "astrozi/facebook",
      "astrozi/x",
      "astrozi/xiaohongshu",
      "astrozi/youtube"
    ]);
  });

  test("creates a generic workspace profile for configured platforms", () => {
    const appConfig = config();
    const workspace = createWorkspaceProfile(appConfig, "youtube", "astrozi");

    expect(workspace).toMatchObject({
      platform: "youtube",
      profile: "astrozi",
      artifactCount: 0
    });
    expect(listWorkspaces(appConfig).map((profile) => `${profile.platform}/${profile.profile}`)).toEqual(["youtube/astrozi"]);
    expect(() => createWorkspaceProfile(appConfig, "unknown", "astrozi")).toThrow("platform_not_supported:unknown");
  });

  test("repairs legacy platform-first workspaces into the canonical layout", () => {
    const appConfig = config();
    const legacy = join(appConfig.growthRoot, "xiaohongshu", "astrozi");
    mkdirSync(join(legacy, "drafts"), { recursive: true });
    writeFileSync(join(legacy, "01-client-brief.md"), "# Legacy brief\n");
    writeFileSync(join(legacy, "drafts", "D3.md"), "# Draft\n");

    expect(listWorkspaces(appConfig).map((profile) => `${profile.platform}/${profile.profile}`)).toEqual(["xiaohongshu/astrozi"]);
    expect(readFileSync(join(appConfig.growthRoot, "astrozi", "xiaohongshu", "01-client-brief.md"), "utf8")).toBe("# Legacy brief\n");
    expect(readFileSync(join(legacy, "01-client-brief.md"), "utf8")).toBe("# Legacy brief\n");
  });

  test("creates a templated Xiaohongshu workspace from signed-in auth when none exists", () => {
    const appConfig = config();
    const templates = join(appConfig.bundledXiaohongshuSkillRoot, "assets", "templates");
    mkdirSync(templates, { recursive: true });
    writeFileSync(join(templates, "client-brief.md"), "Client={{CLIENT_NAME}}\nProfile={{PROFILE}}\nIndustry={{INDUSTRY}}\n");
    writeFileSync(join(templates, "metrics-template.csv"), "date,note_title\n");

    const workspace = ensureXhsWorkspaceForAuth(appConfig, {
      installed: true,
      authenticated: true,
      state: "signed-in",
      scope: "global",
      nickname: "AstroZi 星玺",
      redId: "94388625879"
    });

    expect(workspace).toMatchObject({ platform: "xiaohongshu", profile: "94388625879" });
    expect(readFileSync(join(appConfig.growthRoot, "94388625879", "xiaohongshu", "xhs-account.json"), "utf8")).toContain(
      "AstroZi 星玺"
    );
    expect(readFileSync(join(appConfig.growthRoot, "vault", "94388625879", "xiaohongshu", "01-client-brief.md"), "utf8")).toContain(
      "Client=AstroZi 星玺"
    );
    expect(readFileSync(join(appConfig.growthRoot, "vault", "94388625879", "xiaohongshu", "metrics.csv"), "utf8")).toBe(
      "date,note_title\n"
    );
    expect(listVaultArtifacts(appConfig).map((artifact) => artifact.path)).toContain("94388625879/xiaohongshu/01-client-brief.md");
    expect(listWorkspaces(appConfig).map((profile) => `${profile.platform}/${profile.profile}`)).toEqual(["xiaohongshu/94388625879"]);
  });

  test("does not create a duplicate auth workspace when an XHS profile already exists", () => {
    const appConfig = config();
    mkdirSync(join(appConfig.growthRoot, "astrozi", "xiaohongshu"), { recursive: true });

    const workspace = ensureXhsWorkspaceForAuth(appConfig, {
      installed: true,
      authenticated: true,
      state: "signed-in",
      scope: "global",
      nickname: "Real User",
      redId: "real_user"
    });

    expect(workspace).toBeUndefined();
    expect(listWorkspaces(appConfig).map((profile) => `${profile.platform}/${profile.profile}`)).toEqual(["xiaohongshu/astrozi"]);
  });
});
