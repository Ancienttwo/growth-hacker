import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Hono } from "hono";

import { loadConfig } from "./config";
import { JobStore } from "./jobs";
import { planXiaohongshuLegacyMigration, runXiaohongshuLegacyMigration } from "./migration";
import { bootstrapGrowthAgent, getHermesStatus, getRuntimeStatuses } from "./runtime";
import {
  createSocialBoardTask,
  deleteSocialBoardTask,
  listSocialAgents,
  listSocialBoardTasks,
  runSocialBoardTask,
  updateSocialBoardTask
} from "./socialBoard";
import { listSocialTaskCalendar } from "./socialCalendar";
import {
  SOCIAL_CRON_TASK_TYPES,
  createSocialCronJob,
  deleteSocialCronJob,
  listSocialCronAgents,
  listSocialCronJobs,
  runDueSocialCronJobs,
  runSocialCronJob,
  startSocialCronScheduler,
  updateSocialCronJob
} from "./socialCron";
import {
  artifactContentType,
  ensureGrowthRoot,
  isPreviewableArtifact,
  listArtifacts,
  listWorkspaces,
  readArtifact,
  readManifest,
  resolveArtifact
} from "./workspace";
import { getXhsAuthStatus, startXhsLogin } from "./xhs";

export function createApp() {
  const config = loadConfig();
  ensureGrowthRoot(config);
  const jobs = new JobStore();
  const stopSocialCronScheduler = startSocialCronScheduler(config, jobs);
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ ok: true, growthRoot: config.growthRoot }));

  app.get("/api/workspaces", (c) => c.json({ manifest: readManifest(config), profiles: listWorkspaces(config) }));

  app.post("/api/migrations/xiaohongshu-legacy/plan", (c) => c.json(planXiaohongshuLegacyMigration(config)));

  app.post("/api/migrations/xiaohongshu-legacy/run", (c) => c.json(runXiaohongshuLegacyMigration(config)));

  app.get("/api/runtimes", async (c) => c.json({ runtimes: await getRuntimeStatuses(config) }));

  app.get("/api/runtimes/hermes", async (c) => c.json(await getHermesStatus(config)));

  app.post("/api/bootstrap/growth-agent", async (c) => c.json(await bootstrapGrowthAgent(config)));

  app.get("/api/platforms/xiaohongshu/auth", async (c) => c.json(await getXhsAuthStatus()));

  app.post("/api/platforms/xiaohongshu/login", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { mode?: "qrcode" | "browser" };
    const job = await startXhsLogin(jobs, body.mode === "browser" ? "browser" : "qrcode");
    return c.json(job, 202);
  });

  app.get("/api/platforms/xiaohongshu/profiles/:profile/artifacts", (c) => {
    return c.json({ artifacts: listArtifacts(config, "xiaohongshu", c.req.param("profile")) });
  });

  app.get("/api/platforms/xiaohongshu/profiles/:profile/artifact", (c) => {
    const path = c.req.query("path") ?? "";
    return c.json(readArtifact(config, "xiaohongshu", c.req.param("profile"), path));
  });

  app.get("/api/platforms/xiaohongshu/profiles/:profile/artifact/raw", (c) => {
    const path = c.req.query("path") ?? "";
    try {
      const { info, target } = resolveArtifact(config, "xiaohongshu", c.req.param("profile"), path);
      if (!isPreviewableArtifact(info)) return c.json({ error: "artifact_preview_unavailable" }, 415);

      const file = Bun.file(target);
      const headers = previewHeaders(info.size, artifactContentType(target));
      const range = parseByteRange(c.req.header("range"), info.size);
      if (range === "invalid") {
        return new Response(null, {
          status: 416,
          headers: {
            "Accept-Ranges": "bytes",
            "Content-Range": `bytes */${info.size}`
          }
        });
      }

      if (range) {
        return new Response(file.slice(range.start, range.end + 1), {
          status: 206,
          headers: {
            ...headers,
            "Content-Length": String(range.end - range.start + 1),
            "Content-Range": `bytes ${range.start}-${range.end}/${info.size}`
          }
        });
      }

      return new Response(file, { headers });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "artifact_preview_failed" }, 400);
    }
  });

  app.get("/api/jobs", (c) => c.json({ jobs: jobs.list() }));

  app.get("/api/jobs/:id", (c) => {
    const job = jobs.get(c.req.param("id"));
    if (!job) return c.json({ error: "job_not_found" }, 404);
    return c.json(job);
  });

  app.get("/api/jobs/:id/events", (c) => {
    const id = c.req.param("id");
    if (!jobs.get(id)) return c.json({ error: "job_not_found" }, 404);
    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream({
        start(controller) {
          const unsubscribe = jobs.subscribe(id, (job) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(job)}\n\n`));
            if (job.status === "succeeded" || job.status === "failed") {
              unsubscribe();
              controller.close();
            }
          });
        }
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive"
        }
      }
    );
  });

  app.get("/api/social-cron/jobs", (c) =>
    c.json({
      jobs: listSocialCronJobs(config),
      agents: listSocialCronAgents(config),
      socialAgents: listSocialAgents(config),
      taskTypes: SOCIAL_CRON_TASK_TYPES
    })
  );

  app.post("/api/social-cron/jobs", async (c) => {
    try {
      const body = await c.req.json();
      return c.json(createSocialCronJob(config, body), 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "create_social_cron_failed" }, 400);
    }
  });

  app.patch("/api/social-cron/jobs/:id", async (c) => {
    try {
      const body = await c.req.json();
      return c.json(updateSocialCronJob(config, c.req.param("id"), body));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "update_social_cron_failed" }, 400);
    }
  });

  app.delete("/api/social-cron/jobs/:id", (c) => {
    if (!deleteSocialCronJob(config, c.req.param("id"))) return c.json({ error: "social_cron_job_not_found" }, 404);
    return c.json({ ok: true });
  });

  app.post("/api/social-cron/jobs/:id/run", (c) => {
    try {
      return c.json(runSocialCronJob(config, jobs, c.req.param("id")), 202);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "run_social_cron_failed" }, 400);
    }
  });

  app.post("/api/social-cron/tick", (c) => c.json({ jobs: runDueSocialCronJobs(config, jobs) }));

  app.get("/api/social-board/tasks", (c) =>
    c.json({
      tasks: listSocialBoardTasks(config),
      agents: listSocialAgents(config),
      taskTypes: SOCIAL_CRON_TASK_TYPES
    })
  );

  app.post("/api/social-board/tasks", async (c) => {
    try {
      const body = await c.req.json();
      return c.json(createSocialBoardTask(config, body), 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "create_social_board_task_failed" }, 400);
    }
  });

  app.patch("/api/social-board/tasks/:id", async (c) => {
    try {
      const body = await c.req.json();
      return c.json(updateSocialBoardTask(config, c.req.param("id"), body));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "update_social_board_task_failed" }, 400);
    }
  });

  app.delete("/api/social-board/tasks/:id", (c) => {
    if (!deleteSocialBoardTask(config, c.req.param("id"))) return c.json({ error: "social_board_task_not_found" }, 404);
    return c.json({ ok: true });
  });

  app.post("/api/social-board/tasks/:id/run", (c) => {
    try {
      return c.json(runSocialBoardTask(config, jobs, c.req.param("id")), 202);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "run_social_board_task_failed" }, 400);
    }
  });

  app.get("/api/social-calendar/items", (c) => c.json({ items: listSocialTaskCalendar(config) }));

  const serverDir = dirname(fileURLToPath(import.meta.url));
  const webDist = resolve(serverDir, "../../../apps/web/dist");
  app.get("*", async (c) => {
    if (existsSync(webDist)) {
      const path = c.req.path === "/" ? "index.html" : c.req.path.slice(1);
      const file = Bun.file(resolve(webDist, path));
      if (await file.exists()) return new Response(file);
      return new Response(Bun.file(resolve(webDist, "index.html")));
    }
    return c.text("Growth Hacker API is running. Start the web UI with `bun run dev:web`.", 200);
  });

  return { app, config, jobs, stopSocialCronScheduler };
}

function previewHeaders(size: number, contentType: string): Record<string, string> {
  return {
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Length": String(size),
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff"
  };
}

interface ByteRange {
  start: number;
  end: number;
}

function parseByteRange(value: string | undefined, size: number): ByteRange | "invalid" | undefined {
  if (!value) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || size < 1) return "invalid";

  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) return "invalid";

  if (!startRaw) {
    const suffixLength = Number(endRaw);
    if (!Number.isInteger(suffixLength) || suffixLength < 1) return "invalid";
    return { start: Math.max(size - suffixLength, 0), end: size - 1 };
  }

  const start = Number(startRaw);
  const end = endRaw ? Number(endRaw) : size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) return "invalid";
  return { start, end: Math.min(end, size - 1) };
}
