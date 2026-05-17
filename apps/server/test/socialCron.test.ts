import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type { AppConfig } from "../src/config";
import { JobStore } from "../src/jobs";
import { createSocialBoardTask, listSocialBoardTasks } from "../src/socialBoard";
import { listSocialTaskCalendar } from "../src/socialCalendar";
import { computeNextSocialCronRun, createSocialCronJob, listSocialCronJobs, parseSocialCronSchedule, runDueSocialCronJobs } from "../src/socialCron";
import { buildSocialTaskCommand } from "../src/socialTaskCommands";

function config(agents = ["growth-agent"]): AppConfig {
  const root = mkdtempSync(join(tmpdir(), "growth-hacker-social-cron-"));
  return {
    growthRoot: join(root, ".growth"),
    hermesHome: join(root, ".hermes"),
    hermesApiBaseUrl: "http://127.0.0.1:8642",
    hermesApiKey: "",
    defaultHermesProfile: "growth-agent",
    socialAgents: agents.map((id) => ({ id, runner: "local" })),
    socialCronAgents: agents,
    bundledXiaohongshuSkillRoot: join(root, "skill"),
    legacyXiaohongshuRoot: join(root, ".xiaohongshu", "client"),
    port: 0
  };
}

function createProfile(appConfig: AppConfig, profile = "astrozi") {
  mkdirSync(join(appConfig.growthRoot, profile, "xiaohongshu"), { recursive: true });
}

function writeHermesCronJobs(appConfig: AppConfig, jobs: unknown[]) {
  const cronRoot = join(appConfig.hermesHome, "cron");
  mkdirSync(cronRoot, { recursive: true });
  writeFileSync(join(cronRoot, "jobs.json"), JSON.stringify({ jobs }, null, 2));
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

  test("keeps selected Hermes provider/model on cron and auto-reply task commands", () => {
    const appConfig = config();
    createProfile(appConfig);
    const llm = { provider: "openai-codex", model: "gpt-5.4" };

    const job = createSocialCronJob(appConfig, {
      platform: "xiaohongshu",
      profile: "astrozi",
      taskType: "auto-reply",
      schedule: "daily 09:00",
      llm
    });
    const command = buildSocialTaskCommand(appConfig, job.platform, job.profile, job.taskType, job.agentId, job.llm);

    expect(job.llm).toEqual(llm);
    expect(command.args).toContain("--llm-provider");
    expect(command.args).toContain("openai-codex");
    expect(command.args).toContain("--llm-model");
    expect(command.args).toContain("gpt-5.4");
  });

  test("surfaces Xiaohongshu Hermes cron jobs as read-only social cron entries", () => {
    const appConfig = config();
    writeHermesCronJobs(appConfig, [
      {
        id: "c6333b595e58",
        name: "xhs-astrozi-topic-harvest-daily",
        prompt: "Workspace is vault-only: `/Users/chris/.growth/vault/astrozi/xiaohongshu/`. Return 3-5 candidate topics.",
        skills: ["xiaohongshu-skill"],
        schedule: { kind: "cron", expr: "15 9 * * *", display: "15 9 * * *" },
        enabled: true,
        state: "scheduled",
        created_at: "2026-05-17T20:59:36.895712+08:00",
        next_run_at: "2026-05-18T09:15:00+08:00",
        repeat: { completed: 0 },
        workdir: "/Users/chris/.hermes/skills/social-media/xiaohongshu-skill"
      },
      {
        id: "not-social",
        name: "gbrain-live-sync",
        schedule: { kind: "interval", minutes: 15, display: "every 15m" },
        enabled: true
      }
    ]);

    const jobs = listSocialCronJobs(appConfig);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      id: "hermes:c6333b595e58",
      source: "hermes",
      readOnly: true,
      platform: "xiaohongshu",
      profile: "astrozi",
      taskType: "topic-harvest",
      schedule: { display: "daily 09:15" }
    });
    expect(listSocialTaskCalendar(appConfig)[0]).toMatchObject({
      id: "hermes:c6333b595e58",
      cronSource: "hermes",
      readOnly: true,
      runner: "hermes"
    });
  });

  test("does not execute read-through Hermes cron entries from the local scheduler", () => {
    const appConfig = config();
    writeHermesCronJobs(appConfig, [
      {
        id: "c6333b595e58",
        name: "xhs-astrozi-topic-harvest-daily",
        prompt: "Workspace is vault-only: `/Users/chris/.growth/vault/astrozi/xiaohongshu/`.",
        skills: ["xiaohongshu-skill"],
        schedule: { kind: "cron", expr: "15 9 * * *", display: "15 9 * * *" },
        enabled: true,
        state: "scheduled",
        next_run_at: "2026-05-17T09:15:00+08:00"
      }
    ]);

    expect(listSocialCronJobs(appConfig)).toHaveLength(1);
    expect(runDueSocialCronJobs(appConfig, new JobStore(), new Date("2026-05-17T09:30:00+08:00"))).toEqual([]);
  });

  test("runs document tasks against the Xiaohongshu vault when it exists", () => {
    const appConfig = config();
    createProfile(appConfig);
    const documentRoot = join(appConfig.growthRoot, "vault", "astrozi", "xiaohongshu");
    mkdirSync(documentRoot, { recursive: true });

    const command = buildSocialTaskCommand(appConfig, "xiaohongshu", "astrozi", "workspace-diagnosis");

    expect(command.args).toContain(documentRoot);
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

  test("rejects scheduled tasks for platforms without a CLI adapter", () => {
    const appConfig = config();

    expect(() =>
      createSocialCronJob(appConfig, {
        platform: "facebook",
        profile: "astrozi",
        taskType: "workspace-diagnosis",
        schedule: "daily 09:00"
      })
    ).toThrow("task_not_supported:facebook/workspace-diagnosis");
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
