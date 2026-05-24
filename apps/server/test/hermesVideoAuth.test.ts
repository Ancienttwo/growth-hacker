import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type { AppConfig } from "../src/config";
import { getHermesVideoAuthStatus, parseVideoConfig, startHermesVideoAuth } from "../src/hermesVideoAuth";
import { JobStore } from "../src/jobs";

function config(root: string): AppConfig {
  return {
    growthRoot: join(root, ".growth"),
    hermesHome: join(root, ".hermes"),
    hermesApiBaseUrl: "http://127.0.0.1:8642",
    hermesApiKey: "",
    defaultHermesProfile: "growth-agent",
    socialAgents: [{ id: "growth-agent", runner: "hermes" }],
    socialCronAgents: ["growth-agent"],
    bundledXiaohongshuSkillRoot: join(root, "skill"),
    legacyXiaohongshuRoot: join(root, ".xiaohongshu", "client"),
    port: 0
  };
}

describe("Hermes video auth", () => {
  test("parses Hermes video config without exposing credentials", () => {
    expect(
      parseVideoConfig(`platform_toolsets:
  api_server:
  - video
  - video_gen
plugins:
  enabled:
  - video_gen/xai
video_gen:
  provider: xai
  model: grok-imagine-video
`)
    ).toEqual({
      provider: "xai",
      model: "grok-imagine-video",
      plugins: ["video_gen/xai"],
      apiServerTools: ["video", "video_gen"]
    });
  });

  test("reports configured status from Hermes CLI and config", async () => {
    const root = mkdtempSync(join(tmpdir(), "growth-hacker-hermes-video-auth-status-"));
    const appConfig = config(root);
    writeFileSync(join(root, "fake-hermes-state"), "logged-in", "utf8");
    writeHermesConfig(appConfig);
    const restorePath = installFakeHermes(root);

    try {
      const status = await getHermesVideoAuthStatus(appConfig);

      expect(status).toMatchObject({
        installed: true,
        configured: true,
        authenticated: true,
        pluginEnabled: true,
        apiServerToolEnabled: true,
        provider: "xai",
        model: "grok-imagine-video"
      });
      expect(JSON.stringify(status)).not.toContain("token");
    } finally {
      restorePath();
    }
  });

  test("runs activation through Hermes and streams the OAuth URL", async () => {
    const root = mkdtempSync(join(tmpdir(), "growth-hacker-hermes-video-auth-job-"));
    const appConfig = config(root);
    writeFileSync(join(root, "fake-hermes-state"), "missing", "utf8");
    writeHermesConfig(appConfig);
    const restorePath = installFakeHermes(root);
    const jobs = new JobStore();

    try {
      const job = await startHermesVideoAuth(appConfig, jobs, true);
      const finished = await waitForJob(job.id, jobs);

      expect(finished.status).toBe("succeeded");
      expect(finished.logs.join("\n")).toContain("https://x.ai/oauth/authorize?state=test");
      expect(readFileSync(join(root, "fake-hermes-state"), "utf8").trim()).toBe("logged-in");
      expect(readFileSync(join(root, "fake-hermes-commands.log"), "utf8")).toContain("auth add xai-oauth --type oauth --no-browser --timeout 300");
    } finally {
      restorePath();
    }
  });
});

function writeHermesConfig(appConfig: AppConfig): void {
  mkdirSync(appConfig.hermesHome, { recursive: true });
  writeFileSync(
    join(appConfig.hermesHome, "config.yaml"),
    `platform_toolsets:
  api_server:
  - video
  - video_gen
plugins:
  enabled:
  - video_gen/xai
video_gen:
  provider: xai
  model: grok-imagine-video
`,
    "utf8"
  );
}

function installFakeHermes(root: string): () => void {
  const binDir = join(root, "bin");
  const statePath = join(root, "fake-hermes-state");
  const logPath = join(root, "fake-hermes-commands.log");
  mkdirSync(binDir, { recursive: true });
  writeFileSync(
    join(binDir, "hermes"),
    `#!/bin/sh
printf '%s\\n' "$*" >> "${logPath}"
case "$*" in
  "auth status xai-oauth")
    if [ "$(cat "${statePath}")" = "logged-in" ]; then
      printf '%s\\n' "xai-oauth: logged in"
      exit 0
    fi
    printf '%s\\n' "xai-oauth: not logged in"
    exit 1
    ;;
  "tools list --platform api_server")
    printf '%s\\n' "  ✓ enabled  video_gen  Video Generation"
    exit 0
    ;;
  "plugins list")
    printf '%s\\n' "video_gen/xai enabled 1.0.0"
    exit 0
    ;;
  "plugins enable video_gen/xai"|"tools enable video video_gen --platform api_server"|"config set video_gen.provider xai"|"config set video_gen.model grok-imagine-video")
    printf '%s\\n' "ok"
    exit 0
    ;;
  "auth add xai-oauth --type oauth --no-browser --timeout 300")
    printf '%s\\n' "Open this URL to authorize Hermes with xAI:"
    printf '%s\\n' "https://x.ai/oauth/authorize?state=test"
    printf '%s\\n' "logged-in" > "${statePath}"
    exit 0
    ;;
esac
printf '%s\\n' "unexpected command: $*" >&2
exit 2
`,
    { mode: 0o755 }
  );
  chmodSync(join(binDir, "hermes"), 0o755);
  const originalPath = process.env.PATH;
  process.env.PATH = `${binDir}:${originalPath ?? ""}`;
  return () => {
    process.env.PATH = originalPath;
  };
}

async function waitForJob(id: string, jobs: JobStore) {
  for (let i = 0; i < 50; i += 1) {
    const job = jobs.get(id);
    if (job && job.status !== "running") return job;
    await Bun.sleep(20);
  }
  throw new Error("job_timeout");
}
