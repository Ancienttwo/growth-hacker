import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type { AppConfig } from "../src/config";
import {
  listConfiguredSocialAgents,
  listHermesProfileConfig,
  resolvePlatformHermesAgent,
  startHermesPlatformProfileBootstrap,
  updatePlatformHermesProfile
} from "../src/hermesProfiles";
import { JobStore } from "../src/jobs";
import { createSocialCronJob } from "../src/socialCron";

function config(root = mkdtempSync(join(tmpdir(), "growth-hacker-hermes-profiles-"))): AppConfig {
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

describe("Hermes platform profile config", () => {
  test("creates platform-specific default Hermes profile mappings", () => {
    const appConfig = config();
    mkdirSync(join(appConfig.hermesHome, "profiles", "growth-agent"), { recursive: true });

    const settings = listHermesProfileConfig(appConfig);

    expect(settings.profiles.find((profile) => profile.platform === "xiaohongshu")).toMatchObject({
      agentId: "growth-agent",
      runner: "local",
      profileExists: true,
      source: "default"
    });
    expect(settings.profiles.find((profile) => profile.platform === "youtube")).toMatchObject({
      agentId: "youtube-growth-agent",
      runner: "hermes",
      source: "default"
    });
    expect(listConfiguredSocialAgents(appConfig).map((agent) => agent.id)).toEqual([
      "facebook-growth-agent",
      "growth-agent",
      "x-growth-agent",
      "youtube-growth-agent"
    ]);
  });

  test("persists per-platform profile overrides and uses them as social defaults", () => {
    const appConfig = config();
    mkdirSync(join(appConfig.growthRoot, "astrozi", "xiaohongshu"), { recursive: true });

    const updated = updatePlatformHermesProfile(appConfig, "xiaohongshu", { agentId: "xhs-growth-agent", runner: "hermes" });
    const job = createSocialCronJob(appConfig, {
      platform: "xiaohongshu",
      profile: "astrozi",
      taskType: "workspace-diagnosis",
      schedule: "daily 09:00"
    });

    expect(updated).toMatchObject({ platform: "xiaohongshu", agentId: "xhs-growth-agent", runner: "hermes", source: "stored" });
    expect(resolvePlatformHermesAgent(appConfig, "xiaohongshu")).toEqual({ id: "xhs-growth-agent", runner: "hermes" });
    expect(job.agentId).toBe("xhs-growth-agent");
    expect(readFileSync(join(appConfig.growthRoot, "config", "hermes-profiles.json"), "utf8")).toContain("xhs-growth-agent");
  });

  test("bootstraps missing Hermes profile directories and bundled skills", async () => {
    const root = mkdtempSync(join(tmpdir(), "growth-hacker-hermes-profile-bootstrap-"));
    const bundledRoot = join(root, "skills");
    const appConfig = { ...config(root), bundledHermesSkillsRoot: bundledRoot };
    const skillRoot = join(bundledRoot, "nested-skill");
    mkdirSync(skillRoot, { recursive: true });
    writeFileSync(join(skillRoot, "SKILL.md"), "---\nname: nested-skill\n---\n", "utf8");
    updatePlatformHermesProfile(appConfig, "youtube", { agentId: "youtube-growth-agent", runner: "hermes" });
    const restorePath = installFakeHermes(root, appConfig.hermesHome);
    const jobs = new JobStore();

    try {
      const started = await startHermesPlatformProfileBootstrap(appConfig, jobs);
      const finished = await waitForJob(started.id, jobs);

      expect(finished.status).toBe("succeeded");
      expect(existsSync(join(appConfig.hermesHome, "profiles", "youtube-growth-agent", "skills", "nested-skill", "SKILL.md"))).toBe(true);
      expect(readFileSync(join(root, "fake-hermes-commands.log"), "utf8")).toContain("profile create youtube-growth-agent --clone");
    } finally {
      restorePath();
    }
  });
});

function installFakeHermes(root: string, hermesHome: string): () => void {
  const binDir = join(root, "bin");
  mkdirSync(binDir, { recursive: true });
  const fakeHermes = join(binDir, "hermes");
  writeFileSync(
    fakeHermes,
    `#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "${root}/fake-hermes-commands.log"
if [[ "$*" == "profile list" ]]; then
  echo "growth-agent"
  exit 0
fi
if [[ "$1" == "profile" && "$2" == "create" ]]; then
  mkdir -p "${hermesHome}/profiles/$3"
  echo "created $3"
  exit 0
fi
echo "ok"
`,
    { mode: 0o755 }
  );
  const previousPath = process.env.PATH;
  process.env.PATH = `${binDir}:${previousPath ?? ""}`;
  return () => {
    process.env.PATH = previousPath;
  };
}

async function waitForJob(id: string, jobs: JobStore): Promise<NonNullable<ReturnType<JobStore["get"]>>> {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    const job = jobs.get(id);
    if (job?.status === "succeeded" || job?.status === "failed") return job;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("job_timeout");
}
