import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type { AppConfig } from "../src/config";
import { createSocialBoardTask, listSocialBoardTasks } from "../src/socialBoard";
import { listSocialTaskCalendar } from "../src/socialCalendar";
import { computeNextSocialCronRun, createSocialCronJob, listSocialCronJobs, parseSocialCronSchedule } from "../src/socialCron";

function config(agents = ["growth-agent"]): AppConfig {
  const root = mkdtempSync(join(tmpdir(), "growth-hacker-social-cron-"));
  return {
    growthRoot: join(root, ".growth"),
    hermesHome: join(root, ".hermes"),
    defaultHermesProfile: "growth-agent",
    socialAgents: agents.map((id) => ({ id, runner: "local" })),
    socialCronAgents: agents,
    bundledXiaohongshuSkillRoot: join(root, "skill"),
    legacyXiaohongshuRoot: join(root, ".xiaohongshu", "client"),
    port: 0
  };
}

function createProfile(appConfig: AppConfig, profile = "astrozi") {
  mkdirSync(join(appConfig.growthRoot, "xiaohongshu", profile), { recursive: true });
}

describe("social cron jobs", () => {
  test("creates a scoped cron job for an allowed social media agent", () => {
    const appConfig = config();
    createProfile(appConfig);

    const job = createSocialCronJob(appConfig, {
      platform: "xiaohongshu",
      profile: "astrozi",
      taskType: "workspace-diagnosis",
      schedule: "daily 09:00"
    });

    expect(job.agentId).toBe("growth-agent");
    expect(job.platform).toBe("xiaohongshu");
    expect(job.schedule.display).toBe("daily 09:00");
    expect(listSocialCronJobs(appConfig)).toHaveLength(1);
  });

  test("rejects cron jobs outside configured agents", () => {
    const appConfig = config(["growth-agent"]);
    createProfile(appConfig);

    expect(() =>
      createSocialCronJob(appConfig, {
        agentId: "researcher",
        platform: "xiaohongshu",
        profile: "astrozi",
        taskType: "workspace-diagnosis",
        schedule: "daily 09:00"
      })
    ).toThrow("agent_not_allowed:researcher");
  });

  test("parses interval and daily cron expressions without arbitrary command input", () => {
    expect(parseSocialCronSchedule("every 2h")).toMatchObject({ kind: "interval", minutes: 120 });
    expect(parseSocialCronSchedule("0 9 * * *")).toMatchObject({ kind: "daily", time: "09:00" });
    expect(() => parseSocialCronSchedule("*/5 * * * * curl http://example.com")).toThrow("invalid_schedule");
  });

  test("computes the next daily run after the current wall clock", () => {
    const next = computeNextSocialCronRun(parseSocialCronSchedule("daily 09:00"), new Date(2026, 4, 17, 9, 30));
    expect(next).toBe(new Date(2026, 4, 18, 9, 0).toISOString());
  });

  test("keeps board tasks provider-neutral for OpenClaw-compatible runners", () => {
    const appConfig = config(["growth-agent", "openclaw-agent"]);
    appConfig.socialAgents = [
      { id: "growth-agent", runner: "local" },
      { id: "openclaw-agent", runner: "openclaw" }
    ];
    createProfile(appConfig);

    const task = createSocialBoardTask(appConfig, {
      agentId: "openclaw-agent",
      platform: "xiaohongshu",
      profile: "astrozi",
      taskType: "workspace-diagnosis",
      title: "OpenClaw diagnosis"
    });

    expect(task.runner).toBe("openclaw");
    expect(listSocialBoardTasks(appConfig)[0]).toMatchObject({ id: task.id, status: "ready" });
  });

  test("builds a task calendar from cron occurrences and board work", () => {
    const appConfig = config();
    createProfile(appConfig);

    createSocialCronJob(appConfig, {
      platform: "xiaohongshu",
      profile: "astrozi",
      taskType: "workspace-diagnosis",
      schedule: "daily 09:00"
    });
    createSocialBoardTask(appConfig, {
      platform: "xiaohongshu",
      profile: "astrozi",
      taskType: "health-report",
      title: "Manual health check"
    });

    expect(listSocialTaskCalendar(appConfig).map((item) => item.source).sort()).toEqual(["board", "cron"]);
  });
});
