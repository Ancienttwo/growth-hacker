import { basename } from "node:path";
import { Hono } from "hono";
import {
  VIDEO_COMMANDS,
  VideoAgentError,
  asVideoAgentError,
  failureEnvelope,
  isTerminalRunStatus,
  parseCreateVideoProjectInput,
  parseReviseVideoProjectInput,
  successEnvelope,
} from "@growth-hacker/video-agent";
import type { PreproductionStage, VideoArtifact } from "@growth-hacker/video-agent";
import type { VideoWorkflowCoordinator } from "./coordinator";

export function createVideoRoutes(coordinator: VideoWorkflowCoordinator): Hono {
  const router = new Hono();

  router.get("/health", (c) => c.json({ ok: true, module: "video-agent", schemaVersion: "1" }));

  router.get("/commands", (c) => respond(c, "video.commands.list", () => ({ commands: VIDEO_COMMANDS })));

  router.get("/projects", (c) => respond(c, "video.project.list", () => ({
    projects: coordinator.listProjects(optionalInteger(c.req.query("limit"))).map((project) => ({
      id: project.id,
      title: project.title,
      status: project.status,
      currentRevision: project.currentRevision,
      sourceKind: project.source.kind,
      sourceLanguage: project.source.language,
      sourceCharacterCount: project.source.text.length,
      aspectRatio: project.brief.aspectRatio,
      targetDurationSec: project.brief.targetDurationSec,
      updatedAt: project.updatedAt,
      createdAt: project.createdAt,
    })),
  })));

  router.post("/projects", async (c) => respond(c, "video.project.create", async () => {
    const input = parseCreateVideoProjectInput(await c.req.json());
    return coordinator.createProject(input);
  }, 201));

  router.get("/projects/:projectId", (c) => respond(c, "video.project.get", () => ({
    snapshot: coordinator.getProject(c.req.param("projectId"), optionalInteger(c.req.query("revision"))),
  })));

  router.patch("/projects/:projectId", async (c) => respond(c, "video.project.revise", async () => {
    const input = parseReviseVideoProjectInput(await c.req.json());
    return coordinator.reviseProject(c.req.param("projectId"), input);
  }));

  router.post("/projects/:projectId/preproduction-runs", async (c) => respond(c, "video.preproduction.start", async () => {
    const body = await jsonObject(c.req.json().catch(() => ({})));
    return coordinator.startPreproduction({
      projectId: c.req.param("projectId"),
      revision: optionalInteger(body.revision),
      idempotencyKey: c.req.header("idempotency-key") ?? optionalString(body.idempotencyKey),
      agentId: optionalString(body.agentId),
      provider: optionalString(body.provider),
      model: optionalString(body.model),
      maxAttempts: optionalInteger(body.maxAttempts),
    });
  }, 202));

  router.get("/runs/:runId", (c) => respond(c, "video.workflow.get", () => coordinator.getRun(c.req.param("runId"))));

  router.post("/runs/:runId/tick", async (c) => respond(c, "video.workflow.tick", () => coordinator.tickRun(c.req.param("runId")), 202));

  router.post("/runs/:runId/retry", async (c) => respond(c, "video.workflow.retry", async () => {
    const body = await jsonObject(c.req.json().catch(() => ({})));
    const requestedStage = body.stage ?? body.fromStep;
    const stage = optionalStage(requestedStage);
    if (requestedStage !== undefined && !stage) {
      throw new VideoAgentError("invalid_input", `Unknown workflow stage '${String(requestedStage)}'.`);
    }
    return coordinator.retryRun(c.req.param("runId"), stage);
  }, 202));

  router.post("/runs/:runId/cancel", async (c) => respond(c, "video.workflow.cancel", () => coordinator.cancelRun(c.req.param("runId"))));

  router.post("/runs/:runId/approval", async (c) => respond(c, "video.workflow.approve", async () => {
    const body = await jsonObject(c.req.json());
    const decision = body.decision;
    if (decision !== "approve" && decision !== "reject") throw new VideoAgentError("invalid_input", "decision must be 'approve' or 'reject'.");
    const expectedRevision = optionalInteger(body.expectedRevision);
    if (!expectedRevision) throw new VideoAgentError("invalid_input", "expectedRevision must be a positive integer.");
    return coordinator.decideApproval({
      runId: c.req.param("runId"),
      decision,
      expectedRevision,
      decidedBy: optionalString(body.decidedBy) ?? "operator",
      note: optionalString(body.note),
    });
  }));

  router.get("/runs/:runId/events", (c) => {
    const runId = c.req.param("runId");
    if (c.req.query("follow") === "1") return streamEvents(coordinator, runId, optionalInteger(c.req.query("after")) ?? 0);
    return respond(c, "video.workflow.events", () => ({
      events: coordinator.listEvents(runId, optionalInteger(c.req.query("after")), optionalInteger(c.req.query("limit"))),
    }));
  });

  router.get("/projects/:projectId/artifacts", (c) => respond(c, "video.artifact.list", () => ({
    artifacts: coordinator.listArtifacts(c.req.param("projectId"), optionalInteger(c.req.query("revision"))),
  })));

  router.post("/projects/:projectId/package-exports", async (c) => respond(c, "video.package.export", async () => {
    const body = await jsonObject(c.req.json().catch(() => ({})));
    return coordinator.exportPackage(c.req.param("projectId"), optionalInteger(body.revision));
  }, 201));

  router.get("/artifacts/:artifactId/raw", (c) => {
    try {
      const artifact = coordinator.getArtifact(c.req.param("artifactId"));
      const path = coordinator.resolveArtifact(artifact);
      return new Response(Bun.file(path), {
        headers: artifactHeaders(artifact),
      });
    } catch (error) {
      return errorResponse("video.artifact.read", requestId(c), error);
    }
  });

  return router;
}

async function respond<T>(
  c: { req: { header(name: string): string | undefined } },
  command: string,
  operation: () => T | Promise<T>,
  status = 200,
): Promise<Response> {
  const id = requestId(c);
  try {
    const data = await operation();
    const artifacts = extractArtifacts(data).map((artifact) => ({
      id: artifact.id,
      kind: artifact.kind,
      uri: `growth://video/projects/${artifact.projectId}/artifacts/${artifact.id}`,
      sha256: artifact.sha256,
    }));
    return jsonResponse(successEnvelope({ command, requestId: id, data, artifacts }), status);
  } catch (error) {
    return errorResponse(command, id, error);
  }
}

function errorResponse(command: string, id: string, error: unknown): Response {
  const normalized = asVideoAgentError(error);
  return jsonResponse(failureEnvelope({ command, requestId: id, error: normalized }), normalized.status);
}

function jsonResponse(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function requestId(c: { req: { header(name: string): string | undefined } }): string {
  const candidate = c.req.header("x-request-id")?.trim();
  return candidate && /^[A-Za-z0-9_.:-]{1,180}$/.test(candidate) ? candidate : `req_${crypto.randomUUID().replace(/-/g, "")}`;
}

function artifactHeaders(artifact: VideoArtifact): Record<string, string> {
  const filename = basename(artifact.relativePath).replace(/["\r\n]/g, "");
  return {
    "Cache-Control": "no-store",
    "Content-Type": artifact.mediaType,
    "Content-Length": String(artifact.byteSize),
    "Content-Disposition": `inline; filename="${filename}"`,
    "X-Artifact-SHA256": artifact.sha256,
    "X-Content-Type-Options": "nosniff",
  };
}

function extractArtifacts(value: unknown): VideoArtifact[] {
  if (!value || typeof value !== "object") return [];
  const candidate = (value as { artifacts?: unknown }).artifacts;
  if (!Array.isArray(candidate)) return [];
  return candidate.filter((item): item is VideoArtifact => Boolean(item && typeof item === "object" && "id" in item && "sha256" in item));
}

function streamEvents(coordinator: VideoWorkflowCoordinator, runId: string, initialAfter: number): Response {
  try {
    coordinator.getRun(runId);
  } catch (error) {
    return errorResponse("video.workflow.events", `req_${crypto.randomUUID().replace(/-/g, "")}`, error);
  }
  const encoder = new TextEncoder();
  let after = Math.max(0, initialAfter);
  let timer: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = () => {
        try {
          const events = coordinator.listEvents(runId, after, 500);
          for (const event of events) {
            after = event.id;
            controller.enqueue(encoder.encode(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
          }
          const detail = coordinator.getRun(runId);
          if ((isTerminalRunStatus(detail.run.status) || detail.run.status === "waiting_approval") && events.length === 0) {
            if (timer) clearInterval(timer);
            controller.close();
          }
        } catch (error) {
          if (timer) clearInterval(timer);
          controller.error(error);
        }
      };
      emit();
      timer = setInterval(emit, 1_000);
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function jsonObject(value: Promise<unknown> | unknown): Promise<Record<string, unknown>> {
  const resolved = await value;
  if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) throw new VideoAgentError("invalid_input", "Request body must be a JSON object.");
  return resolved as Record<string, unknown>;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return Number(value);
  return undefined;
}

function optionalStage(value: unknown): PreproductionStage | undefined {
  const stages: PreproductionStage[] = [
    "story_analysis",
    "story_bible",
    "scene_breakdown",
    "shot_planning",
    "continuity_review",
    "prompt_compilation",
    "storyboard_document",
    "preproduction_approval",
  ];
  return typeof value === "string" && stages.includes(value as PreproductionStage) ? value as PreproductionStage : undefined;
}
