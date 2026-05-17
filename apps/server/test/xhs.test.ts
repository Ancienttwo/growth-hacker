import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";
import type { JobSnapshot } from "@growth-hacker/core";

import { JobStore } from "../src/jobs";
import { getXhsAuthStatus, startXhsLogin } from "../src/xhs";

const originalEnv = {
  FAKE_XHS_STATUS: process.env.FAKE_XHS_STATUS,
  FAKE_XHS_WRITE_COOKIE: process.env.FAKE_XHS_WRITE_COOKIE,
  FAKE_XHS_WHOAMI: process.env.FAKE_XHS_WHOAMI,
  PATH: process.env.PATH,
  XHS_AUTH_CHECK_ATTEMPTS: process.env.XHS_AUTH_CHECK_ATTEMPTS,
  XHS_AUTH_CHECK_INTERVAL_MS: process.env.XHS_AUTH_CHECK_INTERVAL_MS,
  XHS_AUTH_COOKIE_PATH: process.env.XHS_AUTH_COOKIE_PATH
};

afterEach(() => {
  restoreEnv("FAKE_XHS_STATUS", originalEnv.FAKE_XHS_STATUS);
  restoreEnv("FAKE_XHS_WRITE_COOKIE", originalEnv.FAKE_XHS_WRITE_COOKIE);
  restoreEnv("FAKE_XHS_WHOAMI", originalEnv.FAKE_XHS_WHOAMI);
  restoreEnv("PATH", originalEnv.PATH);
  restoreEnv("XHS_AUTH_CHECK_ATTEMPTS", originalEnv.XHS_AUTH_CHECK_ATTEMPTS);
  restoreEnv("XHS_AUTH_CHECK_INTERVAL_MS", originalEnv.XHS_AUTH_CHECK_INTERVAL_MS);
  restoreEnv("XHS_AUTH_COOKIE_PATH", originalEnv.XHS_AUTH_COOKIE_PATH);
});

describe("XHS global auth", () => {
  test("classifies a guest global cookie as partial instead of signed in", async () => {
    installFakeXhs();

    const auth = await getXhsAuthStatus();

    expect(auth).toMatchObject({
      installed: true,
      authenticated: false,
      scope: "global",
      state: "guest",
      guest: true,
      errorCode: "guest_global_auth"
    });
  });

  test("fails a login job when global whoami remains guest", async () => {
    installFakeXhs();
    process.env.FAKE_XHS_WHOAMI = "guest";
    process.env.XHS_AUTH_CHECK_ATTEMPTS = "1";

    const store = new JobStore();
    const job = await startXhsLogin(store, "qrcode");
    const finished = await waitForJob(store, job.id);

    expect(finished.status).toBe("failed");
    expect(finished.exitCode).toBe(1);
    expect(finished.logs.join("\n")).toContain("guest/partial session");
  });

  test("succeeds a login job only after global whoami returns a real identity", async () => {
    installFakeXhs();
    process.env.FAKE_XHS_STATUS = "real";
    process.env.FAKE_XHS_WHOAMI = "real";
    process.env.XHS_AUTH_CHECK_ATTEMPTS = "1";

    const store = new JobStore();
    const job = await startXhsLogin(store, "browser");
    const finished = await waitForJob(store, job.id);

    expect(finished.status).toBe("succeeded");
    expect(finished.exitCode).toBe(0);
    expect(finished.logs.join("\n")).toContain("global XHS auth verified: Real User");
  });

  test("restores the previous signed-in global cookie when login verifies as guest", async () => {
    installFakeXhs();
    const root = mkdtempSync(join(tmpdir(), "growth-hacker-xhs-cookie-"));
    const cookiePath = join(root, "cookies.json");
    mkdirSync(root, { recursive: true });
    writeFileSync(cookiePath, "previous-valid-cookie");
    process.env.FAKE_XHS_STATUS = "real";
    process.env.FAKE_XHS_WHOAMI = "guest";
    process.env.FAKE_XHS_WRITE_COOKIE = "1";
    process.env.XHS_AUTH_CHECK_ATTEMPTS = "1";
    process.env.XHS_AUTH_COOKIE_PATH = cookiePath;

    const store = new JobStore();
    const job = await startXhsLogin(store, "qrcode");
    const finished = await waitForJob(store, job.id);

    expect(finished.status).toBe("failed");
    expect(readFileSync(cookiePath, "utf8")).toBe("previous-valid-cookie");
    expect(finished.logs.join("\n")).toContain("restored previous signed-in global XHS auth");
  });
});

function installFakeXhs() {
  const binDir = mkdtempSync(join(tmpdir(), "growth-hacker-fake-xhs-"));
  const path = join(binDir, "xhs");
  writeFileSync(
    path,
    `#!/usr/bin/env bash
set -euo pipefail
cmd="\${1:-}"
case "$cmd" in
  login)
    if [[ -n "\${FAKE_XHS_WRITE_COOKIE:-}" && -n "\${XHS_AUTH_COOKIE_PATH:-}" ]]; then
      printf 'partial-cookie' > "\${XHS_AUTH_COOKIE_PATH}"
    fi
    echo '{"ok":true,"schema_version":"1","data":{"authenticated":true}}'
    ;;
  status)
    if [[ "\${FAKE_XHS_STATUS:-guest}" == "real" ]]; then
      echo '{"ok":true,"schema_version":"1","data":{"authenticated":true,"user":{"guest":false,"nickname":"Real User","red_id":"real_user"}}}'
    else
      echo '{"ok":true,"schema_version":"1","data":{"authenticated":true,"user":{"guest":true,"nickname":"Unknown"}}}'
    fi
    ;;
  whoami)
    if [[ "\${FAKE_XHS_WHOAMI:-guest}" == "real" ]]; then
      echo '{"ok":true,"schema_version":"1","data":{"user":{"guest":false,"nickname":"Real User","red_id":"real_user"}}}'
    else
      echo '{"ok":true,"schema_version":"1","data":{"user":{"guest":true,"nickname":"Unknown"}}}'
    fi
    ;;
  *)
    echo "unexpected command: $*" >&2
    exit 2
    ;;
esac
`
  );
  chmodSync(path, 0o755);
  process.env.PATH = `${binDir}:${originalEnv.PATH ?? ""}`;
}

function waitForJob(store: JobStore, id: string): Promise<JobSnapshot> {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for job ${id}`));
    }, 2000);
    unsubscribe = store.subscribe(id, (job) => {
      if (job.status === "succeeded" || job.status === "failed") {
        clearTimeout(timer);
        unsubscribe();
        resolve(job);
      }
    });
  });
}

function restoreEnv(key: keyof NodeJS.ProcessEnv, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
