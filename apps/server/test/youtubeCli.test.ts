import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AppConfig } from "../src/config";
import { createApp } from "../src/server";
import { getYoutubeProfileStatus } from "../src/youtubeCli";

const originalCwd = process.cwd();
const tempRoots: string[] = [];

afterEach(() => {
  process.chdir(originalCwd);
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("YouTube CLI profile status", () => {
  test("reports missing profile auth without starting OAuth", async () => {
    const cwd = tempRoot();
    const config = testConfig(join(cwd, ".growth"));

    const status = await getYoutubeProfileStatus(config, "astrozi");

    expect(status).toMatchObject({
      profile: "astrozi",
      cli: {
        command: "yt-cli",
        state: "available"
      },
      auth: {
        authenticated: false,
        state: "missing",
        scopes: []
      }
    });
    expect(status.auth.tokenPath).toBe(join(config.growthRoot, "astrozi/youtube/auth/token.json"));
    expect(status.channel).toBeUndefined();
  });

  test("exposes profile status through the server route", async () => {
    const cwd = tempRoot();
    const growthRoot = join(cwd, ".growth");
    writeFileSync(
      join(cwd, "growth-hacker.config.json"),
      JSON.stringify({
        growthRoot,
        hermesHome: join(cwd, ".hermes"),
        hermesApiBaseUrl: "http://127.0.0.1:8642",
        defaultHermesProfile: "growth-agent",
        socialAgents: [{ id: "growth-agent", runner: "local" }]
      }),
      "utf8"
    );
    process.chdir(cwd);

    const { app, stopSocialCronScheduler } = createApp();
    try {
      const response = await app.request("/api/platforms/youtube/profiles/astrozi/status");
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload).toMatchObject({
        profile: "astrozi",
        auth: {
          authenticated: false,
          state: "missing"
        }
      });
      expect(payload.auth.tokenPath).toBe(join(growthRoot, "astrozi/youtube/auth/token.json"));
    } finally {
      stopSocialCronScheduler();
    }
  });
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "growth-hacker-youtube-cli-"));
  tempRoots.push(root);
  return root;
}

function testConfig(growthRoot: string): AppConfig {
  return {
    growthRoot,
    hermesHome: join(growthRoot, "..", ".hermes"),
    hermesApiBaseUrl: "http://127.0.0.1:8642",
    hermesApiKey: "",
    defaultHermesProfile: "growth-agent",
    socialAgents: [{ id: "growth-agent", runner: "local" }],
    socialCronAgents: ["growth-agent"],
    bundledXiaohongshuSkillRoot: join(growthRoot, "..", "xhs-skill"),
    legacyXiaohongshuRoot: join(growthRoot, "..", "xhs-legacy"),
    port: 8787
  };
}
