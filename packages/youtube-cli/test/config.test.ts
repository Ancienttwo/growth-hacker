import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildRuntimeConfig, loadProjectSettings, loadYoutubeSettings } from "../src/config";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("youtube cli project config", () => {
  test("reads YouTube OAuth defaults from growth-hacker config", async () => {
    const root = await tempRoot();
    await writeConfig(root, {
      growthRoot: "./runtime",
      youtube: {
        defaultProfile: "workspace-user",
        oauthClientFile: "./secrets/youtube-oauth-client.json",
        defaultAuthScope: "operate",
        authOpenBrowser: false,
        authForceConsent: true,
        authTimeoutMs: 90_000,
        authLoginHint: "ops@example.com",
        expectedChannelId: "UC123",
        expectedChannelTitle: "AstroZi"
      }
    });

    expect(loadYoutubeSettings(root)).toEqual({
      defaultProfile: "workspace-user",
      oauthClientFile: "./secrets/youtube-oauth-client.json",
      defaultAuthScope: "operate",
      authOpenBrowser: false,
      authForceConsent: true,
      authTimeoutMs: 90_000,
      authLoginHint: "ops@example.com",
      expectedChannelId: "UC123",
      expectedChannelTitle: "AstroZi"
    });
    expect(buildRuntimeConfig({ cwd: root })).toEqual({
      profile: "workspace-user",
      growthRoot: join(root, "runtime"),
      expectedChannelId: "UC123",
      expectedChannelTitle: "AstroZi"
    });
  });

  test("rejects malformed YouTube config early", async () => {
    const root = await tempRoot();
    await writeConfig(root, {
      youtube: {
        defaultAuthScope: "owner",
        authTimeoutMs: 10
      }
    });

    expect(() => loadProjectSettings(root)).toThrow();
  });
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "yt-cli-config-"));
  tempRoots.push(root);
  return root;
}

async function writeConfig(root: string, value: unknown): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "growth-hacker.config.json"), JSON.stringify(value), { mode: 0o600 });
}
