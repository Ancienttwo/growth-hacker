import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { YOUTUBE_SCOPES, buildRuntimeConfig } from "../src/config";
import { buildAuthUrl, createPkceChallenge, createPkceVerifier, loadOAuthClient, parseClientJson, refreshAccessToken } from "../src/oauth";
import { writeToken, type YoutubeTokenFile } from "../src/store";

const tempRoots: string[] = [];
const originalFetch = globalThis.fetch;

afterEach(async () => {
  globalThis.fetch = originalFetch;
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("youtube oauth helpers", () => {
  test("parses Google desktop client JSON", () => {
    expect(
      parseClientJson({
        installed: {
          client_id: "client-id",
          client_secret: "secret",
          auth_uri: "https://accounts.google.com/o/oauth2/v2/auth",
          token_uri: "https://oauth2.googleapis.com/token"
        }
      })
    ).toEqual({
      clientId: "client-id",
      clientSecret: "secret",
      authUri: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUri: "https://oauth2.googleapis.com/token"
    });
  });

  test("builds auth URL with PKCE, state, scopes, and loopback redirect", () => {
    const verifier = createPkceVerifier();
    const challenge = createPkceChallenge(verifier);
    const url = new URL(
      buildAuthUrl({
        client: {
          clientId: "client-id",
          authUri: "https://accounts.google.com/o/oauth2/v2/auth",
          tokenUri: "https://oauth2.googleapis.com/token"
        },
        redirectUri: "http://127.0.0.1:54321/oauth2/callback",
        scopes: [YOUTUBE_SCOPES.read],
        state: "state",
        codeChallenge: challenge,
        forceConsent: true
      })
    );

    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:54321/oauth2/callback");
    expect(url.searchParams.get("scope")).toBe(YOUTUBE_SCOPES.read);
    expect(url.searchParams.get("code_challenge")).toBe(challenge);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("state");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  test("loads OAuth client file from growth-hacker config", async () => {
    const root = await mkdtemp(join(tmpdir(), "yt-cli-oauth-config-"));
    tempRoots.push(root);
    await writeFile(
      join(root, "growth-hacker.config.json"),
      JSON.stringify({
        youtube: {
          oauthClientFile: "./oauth-client.json"
        }
      }),
      { mode: 0o600 }
    );
    await writeFile(
      join(root, "oauth-client.json"),
      JSON.stringify({
        installed: {
          client_id: "configured-client",
          client_secret: "configured-secret"
        }
      }),
      { mode: 0o600 }
    );

    await expect(loadOAuthClient(undefined, root)).resolves.toMatchObject({
      clientId: "configured-client",
      clientSecret: "configured-secret"
    });
  });

  test("reports missing configured OAuth client file as a stable CLI error", async () => {
    const root = await mkdtemp(join(tmpdir(), "yt-cli-oauth-missing-config-"));
    tempRoots.push(root);
    await writeFile(
      join(root, "growth-hacker.config.json"),
      JSON.stringify({
        youtube: {
          oauthClientFile: "./missing-oauth-client.json"
        }
      }),
      { mode: 0o600 }
    );

    await expect(loadOAuthClient(undefined, root)).rejects.toMatchObject({
      code: "youtube_client_missing",
      exitCode: 2
    });
  });

  test("refreshes expired tokens and preserves refresh token", async () => {
    const config = await tempConfig();
    await writeToken(config, tokenFixture(config.profile, { expiresAt: new Date(Date.now() - 1000).toISOString() }));
    let body = "";
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = String(init?.body);
      return new Response(
        JSON.stringify({
          access_token: "new-access",
          expires_in: 3600,
          token_type: "Bearer",
          scope: YOUTUBE_SCOPES.read
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    const refreshed = await refreshAccessToken(config);

    expect(body).toContain("grant_type=refresh_token");
    expect(refreshed.accessToken).toBe("new-access");
    expect(refreshed.refreshToken).toBe("refresh");
  });

  test("explains missing refresh token", async () => {
    const config = await tempConfig();
    await writeToken(config, tokenFixture(config.profile, { refreshToken: undefined }));

    await expect(refreshAccessToken(config)).rejects.toMatchObject({
      code: "youtube_refresh_token_missing",
      exitCode: 2
    });
  });

  test("maps invalid_grant refresh failures to expired auth", async () => {
    const config = await tempConfig();
    await writeToken(config, tokenFixture(config.profile));
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: "invalid_grant",
          error_description: "Bad Request"
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )) as unknown as typeof fetch;

    await expect(refreshAccessToken(config)).rejects.toMatchObject({
      code: "youtube_auth_expired",
      exitCode: 2
    });
  });
});

async function tempConfig() {
  const root = await mkdtemp(join(tmpdir(), "yt-cli-oauth-"));
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
    clientSecret: "secret",
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
