import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type { AppConfig } from "../src/config";
import { getHermesStatus, invalidateRuntimeStatusCache } from "../src/runtime";

function config(root: string): AppConfig {
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

describe("runtime status", () => {
  test("degrades Hermes status when CLI checks exceed the dashboard status budget", async () => {
    const root = mkdtempSync(join(tmpdir(), "growth-hacker-runtime-status-"));
    const appConfig = config(root);
    mkdirSync(join(appConfig.hermesHome, "profiles", "growth-agent", "skills", "social-media", "xiaohongshu-skill"), { recursive: true });
    const restorePath = installSlowHermes(root);
    const previousTimeout = process.env.GROWTH_HACKER_STATUS_COMMAND_TIMEOUT_MS;
    process.env.GROWTH_HACKER_STATUS_COMMAND_TIMEOUT_MS = "50";
    invalidateRuntimeStatusCache(appConfig);

    try {
      const status = await getHermesStatus(appConfig);

      expect(status.state).toBe("degraded");
      expect(status.profileExists).toBe(true);
      expect(status.skillInstalled).toBe(true);
      expect(status.guidance).toContain("timed out");
      expect(status.raw).toContain("timed out after 50ms");
    } finally {
      process.env.GROWTH_HACKER_STATUS_COMMAND_TIMEOUT_MS = previousTimeout;
      invalidateRuntimeStatusCache(appConfig);
      restorePath();
    }
  });
});

function installSlowHermes(root: string): () => void {
  const binDir = join(root, "bin");
  mkdirSync(binDir, { recursive: true });
  const hermes = join(binDir, "hermes");
  writeFileSync(
    hermes,
    `#!/bin/sh
sleep 1
printf '%s\\n' "late hermes output"
`,
    "utf8"
  );
  chmodSync(hermes, 0o755);
  const previousPath = process.env.PATH;
  process.env.PATH = `${binDir}:${previousPath ?? ""}`;
  return () => {
    process.env.PATH = previousPath;
  };
}
