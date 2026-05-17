import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { XhsAuthStatus } from "@growth-hacker/core";

import { commandExists, runCommand } from "./shell";
import type { JobStore } from "./jobs";

type XhsIdentityCommand = "status" | "whoami";

interface XhsEnvelope {
  ok?: boolean;
  data?: unknown;
  error?: { code?: string; message?: string };
}

export async function getXhsAuthStatus(): Promise<XhsAuthStatus> {
  const xhs = await commandExists("xhs");
  if (!xhs) {
    return {
      installed: false,
      authenticated: false,
      scope: "global",
      state: "unavailable",
      message: "xhs CLI not found. Install with `uv tool install xiaohongshu-cli`."
    };
  }
  return readXhsGlobalAuthStatus(xhs, "status");
}

export async function startXhsLogin(jobStore: JobStore, mode: "qrcode" | "browser" = "qrcode") {
  const xhs = await commandExists("xhs");
  if (!xhs) {
    throw new Error("xhs CLI not found. Install with `uv tool install xiaohongshu-cli`.");
  }
  const args = mode === "qrcode" ? ["login", "--qrcode", "--json"] : ["login", "--cookie-source", "auto", "--json"];
  return jobStore.startTask(`xhs-login-${mode}`, [xhs, ...args], async (log) => {
    const previousAuth = await readXhsGlobalAuthStatus(xhs, "status");
    const backupPath = previousAuth.authenticated ? backupGlobalAuthCookie() : undefined;
    if (backupPath) log("stdout: preserved existing signed-in global XHS auth before login");

    try {
      const result = await runCommand(xhs, args, {
        timeoutMs: 10 * 60 * 1000,
        onLine: log
      });

      if (result.exitCode !== 0) {
        throw new Error(result.stderr || result.stdout || result.error || "xhs login failed");
      }

      log("stdout: verifying global XHS identity with `xhs whoami --json`");
      const status = await waitForSignedInGlobalAuth(xhs, log);
      if (!status.authenticated) {
        throw new Error(status.message ?? "xhs login did not produce a non-guest global identity");
      }
      log(`stdout: global XHS auth verified${status.nickname ? `: ${status.nickname}` : ""}`);
    } catch (error) {
      if (backupPath) {
        restoreGlobalAuthCookie(backupPath);
        log("stderr: restored previous signed-in global XHS auth after failed verification");
      }
      throw error;
    } finally {
      cleanupGlobalAuthBackup(backupPath);
    }
  });
}

async function waitForSignedInGlobalAuth(xhs: string, log: (line: string) => void): Promise<XhsAuthStatus> {
  let lastStatus: XhsAuthStatus | undefined;
  const attempts = positiveInteger(process.env.XHS_AUTH_CHECK_ATTEMPTS, 8);
  const intervalMs = positiveInteger(process.env.XHS_AUTH_CHECK_INTERVAL_MS, 1500);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastStatus = await readXhsGlobalAuthStatus(xhs, "whoami");
    if (lastStatus.authenticated) return lastStatus;
    log(`stdout: global auth check ${attempt}/${attempts}: ${lastStatus.state ?? "invalid"} (${lastStatus.message ?? "not signed in"})`);
    if (attempt < attempts) await delay(intervalMs);
  }
  return lastStatus ?? {
    installed: true,
    authenticated: false,
    scope: "global",
    state: "invalid",
    errorCode: "identity_check_failed",
    message: "xhs login finished, but global identity could not be verified"
  };
}

async function readXhsGlobalAuthStatus(xhs: string, command: XhsIdentityCommand): Promise<XhsAuthStatus> {
  const result = await runCommand(xhs, [command, "--json"], { timeoutMs: 30000 });
  const raw = result.stdout || result.stderr;
  const envelope = parseEnvelope(raw);

  if (!envelope) {
    return {
      installed: true,
      authenticated: false,
      scope: "global",
      state: "invalid",
      errorCode: result.exitCode === 0 ? "invalid_json" : "status_failed",
      message: raw.slice(0, 400) || result.error || "xhs status returned no structured output"
    };
  }

  const status = statusFromEnvelope(envelope, command);
  if (result.exitCode !== 0 && status.state === "missing") {
    return {
      ...status,
      errorCode: status.errorCode ?? "status_failed",
      message: status.message ?? (raw.slice(0, 400) || result.error || "xhs status failed")
    };
  }
  return status;
}

function statusFromEnvelope(envelope: XhsEnvelope, command: XhsIdentityCommand): XhsAuthStatus {
  const data = objectValue(envelope.data) ?? {};
  const user = objectValue(data.user) ?? (command === "whoami" ? data : {});
  const guest = Boolean(user.guest);
  const nickname = firstString(user.nickname, user.name, user.nick_name);
  const redId = firstString(user.red_id, user.redId, user.redid, user.username, user.user_id, user.userid, user.id);
  const commandAuthenticated = command === "status" ? Boolean(data.authenticated) : Boolean(envelope.ok);
  const hasIdentity = Boolean((nickname && nickname !== "Unknown") || redId);
  const authenticated = Boolean(envelope.ok) && commandAuthenticated && !guest && hasIdentity;

  if (authenticated) {
    return {
      installed: true,
      authenticated: true,
      scope: "global",
      state: "signed-in",
      guest: false,
      nickname,
      redId
    };
  }

  if (guest) {
    return {
      installed: true,
      authenticated: false,
      scope: "global",
      state: "guest",
      guest: true,
      nickname,
      redId,
      errorCode: "guest_global_auth",
      message: "Global XHS auth is a guest/partial session. Re-run QR login and verify a real account identity."
    };
  }

  if (!commandAuthenticated || envelope.ok === false) {
    return {
      installed: true,
      authenticated: false,
      scope: "global",
      state: "missing",
      guest: false,
      nickname,
      redId,
      errorCode: envelope.error?.code ?? "not_authenticated",
      message: envelope.error?.message ?? "Global XHS auth is not signed in."
    };
  }

  return {
    installed: true,
    authenticated: false,
    scope: "global",
    state: "invalid",
    guest: false,
    nickname,
    redId,
    errorCode: "missing_identity",
    message: "Global XHS auth exists, but status/whoami did not return a usable account identity."
  };
}

function parseEnvelope(raw: string): XhsEnvelope | undefined {
  try {
    const value = JSON.parse(raw) as unknown;
    return objectValue(value) as XhsEnvelope | undefined;
  } catch {
    return undefined;
  }
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function backupGlobalAuthCookie(): string | undefined {
  const cookiePath = globalAuthCookiePath();
  if (!existsSync(cookiePath)) return undefined;
  const backupDir = mkdtempSync(join(tmpdir(), "growth-hacker-xhs-auth-"));
  const backupPath = join(backupDir, "cookies.json");
  copyFileSync(cookiePath, backupPath);
  return backupPath;
}

function restoreGlobalAuthCookie(backupPath: string): void {
  copyFileSync(backupPath, globalAuthCookiePath());
}

function cleanupGlobalAuthBackup(backupPath: string | undefined): void {
  if (backupPath) rmSync(dirname(backupPath), { recursive: true, force: true });
}

function globalAuthCookiePath(): string {
  return process.env.XHS_AUTH_COOKIE_PATH ?? join(homedir(), ".xiaohongshu-cli", "cookies.json");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const next = stringValue(value);
    if (next) return next;
  }
  return undefined;
}
