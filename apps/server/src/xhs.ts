import type { XhsAuthStatus } from "@growth-hacker/core";

import { commandExists, runCommand } from "./shell";
import type { JobStore } from "./jobs";

export async function getXhsAuthStatus(): Promise<XhsAuthStatus> {
  const xhs = await commandExists("xhs");
  if (!xhs) {
    return {
      installed: false,
      authenticated: false,
      message: "xhs CLI not found. Install with `uv tool install xiaohongshu-cli`."
    };
  }
  const result = await runCommand(xhs, ["status", "--json"], { timeoutMs: 30000 });
  if (result.exitCode !== 0) {
    return {
      installed: true,
      authenticated: false,
      errorCode: "status_failed",
      message: result.stderr || result.stdout || result.error
    };
  }
  try {
    const envelope = JSON.parse(result.stdout) as {
      ok?: boolean;
      data?: { authenticated?: boolean; user?: Record<string, unknown> };
      error?: { code?: string; message?: string };
    };
    const data = envelope.data ?? {};
    const user = data.user ?? {};
    return {
      installed: true,
      authenticated: Boolean(data.authenticated) && !Boolean(user.guest),
      guest: Boolean(user.guest),
      nickname: stringValue(user.nickname ?? user.name),
      redId: stringValue(user.red_id ?? user.username),
      errorCode: envelope.error?.code,
      message: envelope.error?.message
    };
  } catch {
    return {
      installed: true,
      authenticated: false,
      errorCode: "invalid_json",
      message: result.stdout.slice(0, 400)
    };
  }
}

export async function startXhsLogin(jobStore: JobStore, mode: "qrcode" | "browser" = "qrcode") {
  const xhs = await commandExists("xhs");
  if (!xhs) {
    throw new Error("xhs CLI not found. Install with `uv tool install xiaohongshu-cli`.");
  }
  const args = mode === "qrcode" ? ["login", "--qrcode", "--json"] : ["login", "--cookie-source", "auto", "--json"];
  return jobStore.start(`xhs-login-${mode}`, xhs, args);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
