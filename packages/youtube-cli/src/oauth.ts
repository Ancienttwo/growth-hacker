import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

import { expandConfigPath, expandHome, expandScopeInput, loadProjectSettings, YOUTUBE_ACCOUNT } from "./config";
import { isTokenExpiring, readToken, removeToken, writeToken, type YoutubeTokenFile } from "./store";
import { CliError, type RuntimeConfig } from "./types";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const DEFAULT_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

export interface OAuthClientConfig {
  clientId: string;
  clientSecret?: string;
  authUri: string;
  tokenUri: string;
}

export interface AuthUrlInput {
  client: OAuthClientConfig;
  redirectUri: string;
  scopes: string[];
  state: string;
  codeChallenge: string;
  forceConsent?: boolean;
  loginHint?: string;
}

export interface AuthStartInput {
  config: RuntimeConfig;
  scope?: string;
  clientFile?: string;
  noOpen?: boolean;
  forceConsent?: boolean;
  timeoutMs?: number;
  loginHint?: string;
}

export interface TokenEndpointResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export async function loadOAuthClient(clientFile?: string, cwd = process.cwd()): Promise<OAuthClientConfig> {
  const project = loadProjectSettings(cwd);
  const file = clientFile ?? process.env.YOUTUBE_OAUTH_CLIENT_FILE;
  if (file) return parseClientJson(await readOAuthClientJson(expandHome(file)));
  if (project.youtube.oauthClientFile) {
    return parseClientJson(await readOAuthClientJson(expandConfigPath(project.youtube.oauthClientFile, project.configDir)));
  }

  const clientId = process.env.YOUTUBE_CLIENT_ID;
  if (!clientId) {
    throw new CliError(
      "youtube_client_missing",
      "Set YOUTUBE_OAUTH_CLIENT_FILE or YOUTUBE_CLIENT_ID before running YouTube auth.",
      { exitCode: 2 }
    );
  }
  return {
    clientId,
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
    authUri: AUTH_ENDPOINT,
    tokenUri: DEFAULT_TOKEN_ENDPOINT
  };
}

async function readOAuthClientJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      throw new CliError("youtube_client_missing", `OAuth client file not found: ${path}`, { exitCode: 2 });
    }
    if (error instanceof SyntaxError) {
      throw new CliError("youtube_client_invalid", `OAuth client file is not valid JSON: ${path}`, { exitCode: 2 });
    }
    throw error;
  }
}

function isNodeError(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === code);
}

export function parseClientJson(value: unknown): OAuthClientConfig {
  if (!value || typeof value !== "object") {
    throw new CliError("youtube_client_invalid", "OAuth client file must be JSON.", { exitCode: 2 });
  }
  const raw = value as Record<string, unknown>;
  const source = (raw.installed ?? raw.web ?? raw) as Record<string, unknown>;
  const clientId = source.client_id ?? source.clientId;
  const clientSecret = source.client_secret ?? source.clientSecret;
  const authUri = source.auth_uri ?? source.authUri ?? AUTH_ENDPOINT;
  const tokenUri = source.token_uri ?? source.tokenUri ?? DEFAULT_TOKEN_ENDPOINT;
  if (typeof clientId !== "string" || !clientId) {
    throw new CliError("youtube_client_invalid", "OAuth client is missing client_id.", { exitCode: 2 });
  }
  return {
    clientId,
    ...(typeof clientSecret === "string" && clientSecret ? { clientSecret } : {}),
    authUri: typeof authUri === "string" && authUri ? authUri : AUTH_ENDPOINT,
    tokenUri: typeof tokenUri === "string" && tokenUri ? tokenUri : DEFAULT_TOKEN_ENDPOINT
  };
}

export function createPkceVerifier(): string {
  return base64Url(randomBytes(64)).slice(0, 96);
}

export function createPkceChallenge(verifier: string): string {
  return base64Url(createHash("sha256").update(verifier).digest());
}

export function createState(): string {
  return base64Url(randomBytes(32));
}

export function buildAuthUrl(input: AuthUrlInput): string {
  const url = new URL(input.client.authUri);
  url.searchParams.set("client_id", input.client.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", input.scopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", input.state);
  if (input.forceConsent) url.searchParams.set("prompt", "consent");
  if (input.loginHint) url.searchParams.set("login_hint", input.loginHint);
  return url.toString();
}

export async function startAuth(input: AuthStartInput): Promise<{
  authenticated: true;
  tokenPath: string;
  scopes: string[];
  expiresAt: string;
}> {
  const scopes = expandScopeInput(input.scope);
  const client = await loadOAuthClient(input.clientFile);
  const verifier = createPkceVerifier();
  const state = createState();
  const server = await listenForOAuthCallback(state, input.timeoutMs ?? 120_000);
  const redirectUri = `http://127.0.0.1:${server.port}/oauth2/callback`;
  const authUrl = buildAuthUrl({
    client,
    redirectUri,
    scopes,
    state,
    codeChallenge: createPkceChallenge(verifier),
    forceConsent: input.forceConsent,
    loginHint: input.loginHint
  });

  try {
    if (!input.noOpen) {
      openBrowser(authUrl);
    } else {
      process.stderr.write(`${authUrl}\n`);
    }
    const code = await server.code;
    const response = await exchangeCodeForToken(client, {
      code,
      redirectUri,
      codeVerifier: verifier
    });
    const now = new Date();
    const token: YoutubeTokenFile = {
      schemaVersion: 1,
      profile: input.config.profile,
      account: YOUTUBE_ACCOUNT,
      clientId: client.clientId,
      ...(client.clientSecret ? { clientSecret: client.clientSecret } : {}),
      scopes: response.scope ? response.scope.split(/\s+/).filter(Boolean) : scopes,
      accessToken: requireTokenField(response.access_token, "access_token"),
      ...(response.refresh_token ? { refreshToken: response.refresh_token } : {}),
      expiresAt: new Date(now.getTime() + Math.max(0, response.expires_in ?? 3600) * 1000).toISOString(),
      tokenType: normalizeTokenType(response.token_type),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    await writeToken(input.config, token);
    return {
      authenticated: true,
      tokenPath: tokenPathForDisplay(input.config),
      scopes: token.scopes,
      expiresAt: token.expiresAt
    };
  } finally {
    await server.close();
  }
}

export async function getValidAccessToken(config: RuntimeConfig): Promise<YoutubeTokenFile> {
  const token = await readToken(config);
  if (!isTokenExpiring(token)) return token;
  return refreshAccessToken(config, token);
}

export async function refreshAccessToken(config: RuntimeConfig, token?: YoutubeTokenFile): Promise<YoutubeTokenFile> {
  token = token ?? (await readToken(config));
  if (!token.refreshToken) {
    throw new CliError(
      "youtube_refresh_token_missing",
      `Refresh token is missing. Re-run \`yt-cli auth start --profile ${config.profile} --scope read --force-consent\`.`,
      { exitCode: 2 }
    );
  }
  const client: OAuthClientConfig = {
    clientId: token.clientId,
    ...(token.clientSecret ? { clientSecret: token.clientSecret } : {}),
    authUri: AUTH_ENDPOINT,
    tokenUri: DEFAULT_TOKEN_ENDPOINT
  };
  let response: TokenEndpointResponse;
  try {
    response = await postTokenRequest(client.tokenUri, {
      client_id: client.clientId,
      ...(client.clientSecret ? { client_secret: client.clientSecret } : {}),
      refresh_token: token.refreshToken,
      grant_type: "refresh_token"
    });
  } catch (error) {
    if (error instanceof CliError && error.details === "invalid_grant") {
      throw new CliError("youtube_auth_expired", `YouTube auth expired. Re-run \`yt-cli auth start --profile ${config.profile} --scope read\`.`, {
        exitCode: 2,
        details: "invalid_grant"
      });
    }
    throw error;
  }
  const now = new Date();
  const refreshed: YoutubeTokenFile = {
    ...token,
    accessToken: requireTokenField(response.access_token, "access_token"),
    scopes: response.scope ? response.scope.split(/\s+/).filter(Boolean) : token.scopes,
    expiresAt: new Date(now.getTime() + Math.max(0, response.expires_in ?? 3600) * 1000).toISOString(),
    tokenType: normalizeTokenType(response.token_type),
    updatedAt: now.toISOString()
  };
  await writeToken(config, refreshed);
  return refreshed;
}

export async function revokeAuth(config: RuntimeConfig): Promise<{ revoked: boolean; tokenPath: string }> {
  let token: YoutubeTokenFile | undefined;
  try {
    token = await readToken(config);
  } catch (error) {
    if (!(error instanceof CliError) || error.code !== "youtube_auth_missing") throw error;
  }
  if (token?.accessToken) {
    const response = await fetch(REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: token.accessToken })
    });
    if (!response.ok && response.status !== 400) {
      throw new CliError("youtube_revoke_failed", `Google token revoke failed with HTTP ${response.status}.`);
    }
  }
  const removed = await removeToken(config);
  return { revoked: Boolean(token || removed), tokenPath: tokenPathForDisplay(config) };
}

export async function exchangeCodeForToken(
  client: OAuthClientConfig,
  input: { code: string; redirectUri: string; codeVerifier: string }
): Promise<TokenEndpointResponse> {
  return postTokenRequest(client.tokenUri, {
    code: input.code,
    client_id: client.clientId,
    ...(client.clientSecret ? { client_secret: client.clientSecret } : {}),
    code_verifier: input.codeVerifier,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code"
  });
}

async function postTokenRequest(tokenUri: string, params: Record<string, string>): Promise<TokenEndpointResponse> {
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params)
  });
  const payload = (await response.json().catch(() => ({}))) as TokenEndpointResponse;
  if (!response.ok || payload.error) {
    throw new CliError("youtube_auth_failed", payload.error_description || payload.error || `OAuth request failed with HTTP ${response.status}.`, {
      exitCode: 2,
      details: payload.error
    });
  }
  return payload;
}

function listenForOAuthCallback(expectedState: string, timeoutMs: number): Promise<{ port: number; code: Promise<string>; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    let settled = false;
    const code = new Promise<string>((codeResolve, codeReject) => {
      const timer = setTimeout(() => {
        codeReject(new CliError("youtube_oauth_timeout", "OAuth callback timed out. Re-run auth when ready.", { exitCode: 2 }));
      }, timeoutMs);

      server.on("request", (request, response) => {
        const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
        if (requestUrl.pathname !== "/oauth2/callback") {
          response.writeHead(404).end("Not found");
          return;
        }
        const error = requestUrl.searchParams.get("error");
        const state = requestUrl.searchParams.get("state");
        const authCode = requestUrl.searchParams.get("code");
        if (error) {
          clearTimeout(timer);
          response.writeHead(400).end("YouTube CLI auth failed. You can close this tab.");
          codeReject(new CliError("youtube_oauth_denied", error, { exitCode: 2 }));
          return;
        }
        if (state !== expectedState) {
          clearTimeout(timer);
          response.writeHead(400).end("YouTube CLI auth state mismatch. You can close this tab.");
          codeReject(new CliError("youtube_oauth_state_mismatch", "OAuth callback state mismatch.", { exitCode: 2 }));
          return;
        }
        if (!authCode) {
          clearTimeout(timer);
          response.writeHead(400).end("YouTube CLI auth callback was missing a code. You can close this tab.");
          codeReject(new CliError("youtube_oauth_code_missing", "OAuth callback did not include a code.", { exitCode: 2 }));
          return;
        }
        clearTimeout(timer);
        response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end("YouTube CLI auth complete. You can close this tab.");
        codeResolve(authCode);
      });
    });

    server.once("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    server.listen(0, "127.0.0.1", () => {
      if (settled) return;
      settled = true;
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new CliError("youtube_oauth_listener_failed", "Could not start OAuth callback listener.", { exitCode: 2 }));
        return;
      }
      resolve({
        port: address.port,
        code,
        close: () => closeServer(server)
      });
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function normalizeTokenType(value: string | undefined): "Bearer" {
  if (!value || value.toLowerCase() === "bearer") return "Bearer";
  throw new CliError("youtube_token_invalid", `Unsupported token_type: ${value}`, { exitCode: 2 });
}

function requireTokenField(value: string | undefined, field: string): string {
  if (!value) throw new CliError("youtube_auth_failed", `OAuth response is missing ${field}.`, { exitCode: 2 });
  return value;
}

function base64Url(bytes: Buffer): string {
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function tokenPathForDisplay(config: RuntimeConfig): string {
  return `${config.growthRoot}/${config.profile}/${YOUTUBE_ACCOUNT}/auth/token.json`;
}

function openBrowser(url: string): void {
  const platform = process.platform;
  const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {
    process.stderr.write(`${url}\n`);
  });
  child.unref();
}
