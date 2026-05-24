import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type { AppConfig } from "../src/config";
import {
  extractHermesGeneratedVideoReferences,
  persistHermesGeneratedVideoArtifacts,
  resolveHermesGeneratedVideo
} from "../src/hermesVideos";

function config(): AppConfig {
  const root = mkdtempSync(join(tmpdir(), "growth-hacker-hermes-videos-"));
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

describe("Hermes generated video access", () => {
  test("resolves video files from the Hermes cache video directory", () => {
    const appConfig = config();
    const videoRoot = join(appConfig.hermesHome, "cache", "videos");
    mkdirSync(videoRoot, { recursive: true });
    writeFileSync(join(videoRoot, "generated.mp4"), "mp4-bytes");

    const video = resolveHermesGeneratedVideo(appConfig, "generated.mp4");
    expect(video.path).toBe(join(videoRoot, "generated.mp4"));
    expect(video.size).toBe(9);
    expect(video.contentType).toBe("video/mp4");
  });

  test("blocks traversal and non-video paths", () => {
    const appConfig = config();
    expect(() => resolveHermesGeneratedVideo(appConfig, "../secret.mp4")).toThrow("invalid_hermes_video");
    expect(() => resolveHermesGeneratedVideo(appConfig, "notes.md")).toThrow("invalid_hermes_video");
  });

  test("persists local generated videos into profile artifacts", async () => {
    const appConfig = config();
    const videoRoot = join(appConfig.hermesHome, "cache", "videos");
    const workspaceRoot = join(appConfig.growthRoot, "astrozi", "youtube");
    mkdirSync(videoRoot, { recursive: true });
    mkdirSync(workspaceRoot, { recursive: true });
    writeFileSync(join(videoRoot, "generated.mp4"), "mp4-bytes");

    const output = '{"kind":"youtube-video-generation","video":"/Users/chris/.hermes/cache/videos/generated.mp4"}';
    const rewritten = output.replace("/Users/chris/.hermes", appConfig.hermesHome);
    expect(extractHermesGeneratedVideoReferences(rewritten)).toEqual([join(videoRoot, "generated.mp4")]);

    const artifacts = await persistHermesGeneratedVideoArtifacts(appConfig, "youtube", "astrozi", rewritten);
    expect(artifacts).toMatchObject([{ path: "artifacts/videos/generated.mp4", contentType: "video/mp4", size: 9 }]);
  });

  test("downloads remote generated videos into profile artifacts", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("remote-mp4", { headers: { "content-type": "video/mp4" } })) as unknown as typeof fetch;

    try {
      const appConfig = config();
      mkdirSync(join(appConfig.growthRoot, "astrozi", "youtube"), { recursive: true });
      const output = '{"video":"https://cdn.example.test/render"}';

      const artifacts = await persistHermesGeneratedVideoArtifacts(appConfig, "youtube", "astrozi", output);
      expect(artifacts[0]).toMatchObject({ contentType: "video/mp4", size: 10 });
      expect(artifacts[0].path).toMatch(/^artifacts\/videos\/.+-generated\.mp4$/);
      expect(readFileSync(join(appConfig.growthRoot, "astrozi", "youtube", artifacts[0].path), "utf8")).toBe("remote-mp4");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("blocks unsafe remote video downloads from model output", async () => {
    const originalFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("local");
    }) as unknown as typeof fetch;

    try {
      const appConfig = config();
      mkdirSync(join(appConfig.growthRoot, "astrozi", "youtube"), { recursive: true });
      const output = '{"video":"http://127.0.0.1:8787/private.mp4"}';

      await expect(persistHermesGeneratedVideoArtifacts(appConfig, "youtube", "astrozi", output)).rejects.toThrow(
        "video_download_url_blocked"
      );
      expect(called).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("requires a video response for extensionless remote video URLs", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("not-video", { headers: { "content-type": "text/plain" } })) as unknown as typeof fetch;

    try {
      const appConfig = config();
      mkdirSync(join(appConfig.growthRoot, "astrozi", "youtube"), { recursive: true });
      const output = '{"video":"https://cdn.example.test/render"}';

      await expect(persistHermesGeneratedVideoArtifacts(appConfig, "youtube", "astrozi", output)).rejects.toThrow(
        "video_download_invalid_type"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
