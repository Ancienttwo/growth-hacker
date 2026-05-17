import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type { AppConfig } from "../src/config";
import { extractHermesGeneratedImageNames, persistHermesGeneratedImageArtifacts, resolveHermesGeneratedImage } from "../src/hermesImages";

function config(): AppConfig {
  const root = mkdtempSync(join(tmpdir(), "growth-hacker-hermes-images-"));
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

describe("Hermes generated image access", () => {
  test("resolves image files from the Hermes cache image directory", () => {
    const appConfig = config();
    const imageRoot = join(appConfig.hermesHome, "cache", "images");
    mkdirSync(imageRoot, { recursive: true });
    writeFileSync(join(imageRoot, "generated.png"), "png-bytes");

    const image = resolveHermesGeneratedImage(appConfig, "generated.png");
    expect(image.path).toBe(join(imageRoot, "generated.png"));
    expect(image.size).toBe(9);
    expect(image.contentType).toBe("image/png");
  });

  test("blocks traversal and non-image paths", () => {
    const appConfig = config();
    expect(() => resolveHermesGeneratedImage(appConfig, "../secret.png")).toThrow("invalid_hermes_image");
    expect(() => resolveHermesGeneratedImage(appConfig, "notes.md")).toThrow("invalid_hermes_image");
  });

  test("persists generated images into profile artifacts", () => {
    const appConfig = config();
    const imageRoot = join(appConfig.hermesHome, "cache", "images");
    const workspaceRoot = join(appConfig.growthRoot, "astrozi", "xiaohongshu");
    mkdirSync(imageRoot, { recursive: true });
    mkdirSync(workspaceRoot, { recursive: true });
    writeFileSync(join(imageRoot, "generated.png"), "png-bytes");

    const output = "生成好了：![cover](/Users/chris/.hermes/cache/images/generated.png)";
    expect(extractHermesGeneratedImageNames(output)).toEqual(["generated.png"]);

    const artifacts = persistHermesGeneratedImageArtifacts(appConfig, "xiaohongshu", "astrozi", output);
    expect(artifacts).toMatchObject([{ path: "artifacts/images/generated.png", contentType: "image/png", size: 9 }]);
  });
});
