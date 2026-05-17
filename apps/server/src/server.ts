import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Hono } from "hono";

import { loadConfig } from "./config";
import { persistHermesGeneratedImageArtifacts, resolveHermesGeneratedImage } from "./hermesImages";
import { listHermesModelOptions, resolveHermesLlmSelection } from "./hermesModels";
import {
  approveHermesRun,
  createHermesChatRun,
  getHermesRun,
  getHermesChatStatus,
  hermesErrorStatus,
  stopHermesRun,
  streamHermesRunEvents
} from "./hermesChat";
import { readHermesContextSnapshot } from "./hermesContext";
import { JobStore } from "./jobs";
import { planXiaohongshuLegacyMigration, runXiaohongshuLegacyMigration } from "./migration";
import { listHermesProfileSkills, updateHermesProfileSkill } from "./hermesSkills";
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
import { listSocialPlatforms } from "./socialPlatforms";
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
  ensureXhsWorkspaceForAuth,
  isPreviewableArtifact,
  listArtifacts,
  listVaultArtifacts,
  listWorkspaces,
  readArtifact,
  readManifest,
  readVaultArtifact,
  resolveArtifact,
  resolveVaultArtifact
} from "./workspace";
import { getXhsAuthStatus, startXhsLogin } from "./xhs";
import {
  listXhsAutoReplies,
  syncXhsAutoReplyQueue,
  updateXhsAutoReplyItem,
  updateXhsAutoReplySettings
} from "./xhsAutoReplies";
import { listXhsPublishedPosts, refreshXhsPublishedPostsFromCli, toPublicXhsPublishedPost, updateXhsPublishedPost } from "./xhsPublished";

export function createApp() {
  const config = loadConfig();
  ensureGrowthRoot(config);
  const jobs = new JobStore();
  const stopSocialCronScheduler = startSocialCronScheduler(config, jobs);
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ ok: true, growthRoot: config.growthRoot }));

  app.get("/api/platforms", async (c) => c.json({ platforms: await listSocialPlatforms(config) }));

  app.get("/api/workspaces", async (c) => {
    let profiles = listWorkspaces(config);
    if (!profiles.some((profile) => profile.platform === "xiaohongshu")) {
      ensureXhsWorkspaceForAuth(config, await getXhsAuthStatus());
      profiles = listWorkspaces(config);
    }
    return c.json({ manifest: readManifest(config), profiles });
  });

  app.post("/api/migrations/xiaohongshu-legacy/plan", (c) => c.json(planXiaohongshuLegacyMigration(config)));

  app.post("/api/migrations/xiaohongshu-legacy/run", (c) => c.json(runXiaohongshuLegacyMigration(config)));

  app.get("/api/runtimes", async (c) => c.json({ runtimes: await getRuntimeStatuses(config) }));

  app.get("/api/runtimes/hermes", async (c) => c.json(await getHermesStatus(config)));

  app.post("/api/bootstrap/growth-agent", async (c) => c.json(await bootstrapGrowthAgent(config)));

  app.get("/api/chat/hermes/status", async (c) => c.json(await getHermesChatStatus(config)));

  app.get("/api/hermes/models", async (c) => {
    try {
      return c.json(await listHermesModelOptions(config));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "list_hermes_models_failed" }, 400);
    }
  });

  app.get("/api/hermes/context", (c) => {
    try {
      return c.json(
        readHermesContextSnapshot(config, {
          gatewayLimit: parseQueryInteger(c.req.query("gatewayLimit")),
          limit: parseQueryInteger(c.req.query("limit")),
          messageLimit: parseQueryInteger(c.req.query("messageLimit")),
          query: c.req.query("query"),
          sessionId: c.req.query("sessionId"),
          source: c.req.query("source")
        })
      );
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "read_hermes_context_failed" }, 400);
    }
  });

  app.get("/api/chat/hermes/images/:imageName", (c) => {
    try {
      const image = resolveHermesGeneratedImage(config, c.req.param("imageName"));
      return new Response(Bun.file(image.path), { headers: previewHeaders(image.size, image.contentType) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "hermes_image_unavailable";
      return c.json({ error: message }, message === "hermes_image_not_found" ? 404 : 400);
    }
  });

  app.post("/api/chat/runs", async (c) => {
    try {
      return c.json(await createHermesChatRun(config, await c.req.json()), 202);
    } catch (error) {
      return chatErrorResponse(error, "create_chat_run_failed");
    }
  });

  app.get("/api/chat/runs/:id", async (c) => {
    try {
      return c.json(await getHermesRun(config, c.req.param("id")));
    } catch (error) {
      return chatErrorResponse(error, "get_chat_run_failed");
    }
  });

  app.post("/api/chat/runs/:id/artifacts", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as { platform?: unknown; profile?: unknown };
      if (typeof body.platform !== "string" || typeof body.profile !== "string") throw new Error("workspace_required");
      const run = await getHermesRun(config, c.req.param("id"));
      return c.json({ artifacts: persistHermesGeneratedImageArtifacts(config, body.platform, body.profile, run.output ?? "") });
    } catch (error) {
      return chatErrorResponse(error, "persist_chat_artifacts_failed");
    }
  });

  app.get("/api/chat/runs/:id/events", async (c) => {
    try {
      return await streamHermesRunEvents(config, c.req.param("id"));
    } catch (error) {
      return chatErrorResponse(error, "stream_chat_run_failed");
    }
  });

  app.post("/api/chat/runs/:id/approval", async (c) => {
    try {
      return c.json(await approveHermesRun(config, c.req.param("id"), await c.req.json()));
    } catch (error) {
      return chatErrorResponse(error, "approve_chat_run_failed");
    }
  });

  app.post("/api/chat/runs/:id/stop", async (c) => {
    try {
      return c.json(await stopHermesRun(config, c.req.param("id")));
    } catch (error) {
      return chatErrorResponse(error, "stop_chat_run_failed");
    }
  });

  app.get("/api/agents/:agentId/skills", (c) => {
    try {
      return c.json({ skills: listHermesProfileSkills(config, c.req.param("agentId")) });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "list_agent_skills_failed" }, 400);
    }
  });

  app.patch("/api/agents/:agentId/skills/:skillName", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as { enabled?: unknown };
      if (typeof body.enabled !== "boolean") throw new Error("enabled_boolean_required");
      return c.json({ skill: updateHermesProfileSkill(config, c.req.param("agentId"), c.req.param("skillName"), body.enabled) });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "update_agent_skill_failed" }, 400);
    }
  });

  app.get("/api/platforms/xiaohongshu/auth", async (c) => {
    const auth = await getXhsAuthStatus();
    ensureXhsWorkspaceForAuth(config, auth);
    return c.json(auth);
  });

  app.post("/api/platforms/xiaohongshu/login", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { mode?: "qrcode" | "browser" };
    const job = await startXhsLogin(jobs, body.mode === "browser" ? "browser" : "qrcode");
    return c.json(job, 202);
  });

  app.get("/api/platforms/:platform/profiles/:profile/artifacts", (c) => {
    return c.json({ artifacts: listArtifacts(config, c.req.param("platform"), c.req.param("profile")) });
  });

  app.get("/api/platforms/:platform/profiles/:profile/artifact", (c) => {
    const path = c.req.query("path") ?? "";
    return c.json(readArtifact(config, c.req.param("platform"), c.req.param("profile"), path));
  });

  app.get("/api/platforms/:platform/profiles/:profile/artifact/raw", (c) => {
    const path = c.req.query("path") ?? "";
    try {
      const { info, target } = resolveArtifact(config, c.req.param("platform"), c.req.param("profile"), path);
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

  app.get("/api/vault/artifacts", (c) => {
    try {
      return c.json({ artifacts: listVaultArtifacts(config) });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "list_vault_artifacts_failed" }, 400);
    }
  });

  app.get("/api/vault/artifact", (c) => {
    try {
      return c.json(readVaultArtifact(config, c.req.query("path") ?? ""));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "read_vault_artifact_failed" }, 400);
    }
  });

  app.get("/api/vault/artifact/raw", (c) => {
    const path = c.req.query("path") ?? "";
    try {
      const { info, target } = resolveVaultArtifact(config, path);
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
      return c.json({ error: error instanceof Error ? error.message : "vault_artifact_preview_failed" }, 400);
    }
  });

  app.get("/api/platforms/xiaohongshu/profiles/:profile/published-posts", (c) => {
    try {
      return c.json({ posts: listXhsPublishedPosts(config, c.req.param("profile")).map(toPublicXhsPublishedPost) });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "list_published_posts_failed" }, 400);
    }
  });

  app.post("/api/platforms/xiaohongshu/profiles/:profile/published-posts/sync", async (c) => {
    try {
      const result = await refreshXhsPublishedPostsFromCli(config, c.req.param("profile"));
      return c.json({ ...result, posts: result.posts.map(toPublicXhsPublishedPost) }, 202);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "sync_published_posts_failed" }, 400);
    }
  });

  app.patch("/api/platforms/xiaohongshu/profiles/:profile/published-posts/:id", async (c) => {
    try {
      return c.json({ post: toPublicXhsPublishedPost(updateXhsPublishedPost(config, c.req.param("profile"), c.req.param("id"), await c.req.json())) });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "update_published_post_failed" }, 400);
    }
  });

  app.get("/api/platforms/xiaohongshu/profiles/:profile/auto-replies", (c) => {
    try {
      return c.json(listXhsAutoReplies(config, c.req.param("profile")));
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "list_auto_replies_failed" }, 400);
    }
  });

  app.put("/api/platforms/xiaohongshu/profiles/:profile/auto-replies/settings", async (c) => {
    try {
      return c.json({ settings: updateXhsAutoReplySettings(config, c.req.param("profile"), await c.req.json()) });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "update_auto_reply_settings_failed" }, 400);
    }
  });

  app.post("/api/platforms/xiaohongshu/profiles/:profile/auto-replies/sync", async (c) => {
    try {
      return c.json(await syncXhsAutoReplyQueue(config, c.req.param("profile")), 202);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "sync_auto_replies_failed" }, 400);
    }
  });

  app.patch("/api/platforms/xiaohongshu/profiles/:profile/auto-replies/items/:id", async (c) => {
    try {
      return c.json({ item: updateXhsAutoReplyItem(config, c.req.param("profile"), c.req.param("id"), await c.req.json()) });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "update_auto_reply_item_failed" }, 400);
    }
  });

  app.post("/api/platforms/xiaohongshu/profiles/:profile/auto-replies/run", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as { agentId?: unknown; llm?: unknown };
      const task = createSocialBoardTask(config, {
        agentId: typeof body.agentId === "string" ? body.agentId : undefined,
        llm: await resolveHermesLlmSelection(config, body.llm),
        platform: "xiaohongshu",
        profile: c.req.param("profile"),
        taskType: "auto-reply",
        title: `${c.req.param("profile")} Auto replies`,
        source: "manual",
        status: "ready"
      });
      return c.json(runSocialBoardTask(config, jobs, task.id), 202);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "run_auto_replies_failed" }, 400);
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
      const body = (await c.req.json()) as Record<string, unknown>;
      return c.json(
        createSocialCronJob(config, {
          agentId: typeof body.agentId === "string" ? body.agentId : undefined,
          llm: await resolveHermesLlmSelection(config, body.llm),
          platform: requireBodyString(body.platform, "platform"),
          profile: requireBodyString(body.profile, "profile"),
          taskType: requireBodyString(body.taskType, "taskType") as never,
          schedule: requireBodyString(body.schedule, "schedule"),
          name: typeof body.name === "string" ? body.name : undefined
        }),
        201
      );
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "create_social_cron_failed" }, 400);
    }
  });

  app.patch("/api/social-cron/jobs/:id", async (c) => {
    try {
      const body = (await c.req.json()) as Record<string, unknown>;
      const llm =
        body.llm === null ? null : body.llm === undefined ? undefined : await resolveHermesLlmSelection(config, body.llm);
      return c.json(
        updateSocialCronJob(config, c.req.param("id"), {
          ...body,
          llm
        })
      );
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
      const body = (await c.req.json()) as Record<string, unknown>;
      return c.json(
        createSocialBoardTask(config, {
          agentId: typeof body.agentId === "string" ? body.agentId : undefined,
          llm: await resolveHermesLlmSelection(config, body.llm),
          platform: requireBodyString(body.platform, "platform"),
          profile: requireBodyString(body.profile, "profile"),
          taskType: requireBodyString(body.taskType, "taskType") as never,
          title: typeof body.title === "string" ? body.title : undefined,
          source: body.source === "cron" ? "cron" : "manual",
          sourceId: typeof body.sourceId === "string" ? body.sourceId : undefined,
          status: typeof body.status === "string" ? (body.status as never) : undefined
        }),
        201
      );
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

function chatErrorResponse(error: unknown, fallbackMessage: string): Response {
  return Response.json(
    { error: error instanceof Error ? error.message : fallbackMessage },
    { status: hermesErrorStatus(error) }
  );
}

function requireBodyString(value: unknown, field: string): string {
  if (typeof value === "string" && value.trim()) return value;
  throw new Error(`${field}_required`);
}

function parseQueryInteger(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const next = Number(value);
  return Number.isInteger(next) ? next : undefined;
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
