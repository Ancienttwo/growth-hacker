import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { YOUTUBE_SCOPES, assertSafeProfile, buildRuntimeConfig } from "../src/config";
import { CliError } from "../src/types";
import { getTokenStatus, listUploadStates, readToken, tokenPath, writeToken, writeUploadState, type YoutubeTokenFile } from "../src/store";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("youtube token store", () => {
  test("blocks unsafe profile names", () => {
    expect(() => assertSafeProfile("../astrozi")).toThrow(CliError);
    expect(() => assertSafeProfile("astrozi")).not.toThrow();
  });

  test("writes token files with private permissions", async () => {
    const config = await tempConfig();
    const token = tokenFixture(config.profile);
    await writeToken(config, token);

    expect((await readToken(config)).accessToken).toBe("access");
    expect((await stat(tokenPath(config))).mode & 0o777).toBe(0o600);
  });

  test("reports missing auth as a non-throwing status", async () => {
    const config = await tempConfig();
    await expect(getTokenStatus(config)).resolves.toMatchObject({
      authenticated: false,
      state: "missing",
      scopes: []
    });
  });

  test("rejects corrupt token JSON without overwriting it", async () => {
    const config = await tempConfig();
    await writeToken(config, tokenFixture(config.profile));
    await writeFile(tokenPath(config), "{bad", { mode: 0o600 });

    await expect(readToken(config)).rejects.toMatchObject({
      code: "youtube_token_invalid",
      exitCode: 2
    });
  });

  test("rejects world-readable token files", async () => {
    const config = await tempConfig();
    await writeToken(config, tokenFixture(config.profile));
    await writeFile(tokenPath(config), JSON.stringify(tokenFixture(config.profile)), { mode: 0o644 });
    await chmod(tokenPath(config), 0o644);

    await expect(readToken(config)).rejects.toMatchObject({
      code: "youtube_token_permissions",
      exitCode: 2
    });
  });

  test("writes and lists private upload states", async () => {
    const config = await tempConfig();
    await writeUploadState(config, uploadStateFixture(config.profile));

    const states = await listUploadStates(config);

    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({
      uploadId: "abcdef1234567890",
      filePath: "/tmp/video.mp4",
      size: 16,
      account: "youtube"
    });
  });
});

async function tempConfig() {
  const root = await mkdtemp(join(tmpdir(), "yt-cli-store-"));
  tempRoots.push(root);
  return buildRuntimeConfig({ profile: "astrozi", growthRoot: root });
}

function tokenFixture(profile: string, input: Partial<YoutubeTokenFile> = {}): YoutubeTokenFile {
  const now = new Date("2026-05-25T00:00:00.000Z").toISOString();
  return {
    schemaVersion: 1,
    profile,
    account: "youtube",
    clientId: "client-id",
    scopes: [YOUTUBE_SCOPES.read],
    accessToken: "access",
    refreshToken: "refresh",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    tokenType: "Bearer",
    createdAt: now,
    updatedAt: now,
    ...input
  };
}

function uploadStateFixture(profile: string) {
  const now = new Date("2026-05-25T00:00:00.000Z").toISOString();
  return {
    schemaVersion: 1 as const,
    profile,
    account: "youtube" as const,
    uploadId: "abcdef1234567890",
    filePath: "/tmp/video.mp4",
    size: 16,
    mimeType: "video/mp4",
    metadata: {
      snippet: { title: "Launch" },
      status: { privacyStatus: "private" }
    },
    sessionUrl: "https://upload.youtube.test/session/1",
    createdAt: now,
    updatedAt: now
  };
}
