import type { VideoAgentError } from "./errors";

export type CommandRisk = "read" | "local_write" | "external_cost" | "external_publish" | "destructive" | "credential_admin";
export type CommandExecution = "sync" | "async";

export interface CommandDescriptor {
  name: string;
  version: 1;
  risk: CommandRisk;
  execution: CommandExecution;
  summary: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export interface CommandArtifactRef {
  id: string;
  kind: string;
  uri: string;
  sha256?: string;
}

export interface CommandSuccess<T> {
  ok: true;
  schemaVersion: "1";
  command: string;
  requestId: string;
  data: T;
  artifacts: CommandArtifactRef[];
  warnings: string[];
}

export interface CommandFailure {
  ok: false;
  schemaVersion: "1";
  command: string;
  requestId: string;
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
}

export type CommandEnvelope<T> = CommandSuccess<T> | CommandFailure;

export const VIDEO_COMMANDS: readonly CommandDescriptor[] = [
  descriptor("video.project.create", "local_write", "sync", "Create a versioned video project from a story or screenplay."),
  descriptor("video.project.list", "read", "sync", "List local video projects."),
  descriptor("video.project.get", "read", "sync", "Read a video project and its current production state."),
  descriptor("video.project.revise", "local_write", "sync", "Create a new immutable project revision."),
  descriptor("video.preproduction.start", "local_write", "async", "Start the durable preproduction workflow."),
  descriptor("video.workflow.get", "read", "sync", "Read workflow status and steps."),
  descriptor("video.workflow.events", "read", "sync", "Read or stream durable workflow events."),
  descriptor("video.workflow.tick", "local_write", "async", "Request an immediate local workflow scheduler tick."),
  descriptor("video.workflow.retry", "local_write", "async", "Retry a failed workflow step."),
  descriptor("video.workflow.cancel", "local_write", "sync", "Cancel a workflow without deleting artifacts."),
  descriptor("video.workflow.approve", "local_write", "sync", "Approve or reject the preproduction package."),
  descriptor("video.artifact.list", "read", "sync", "List registered project artifacts."),
  descriptor("video.artifact.read", "read", "sync", "Read one immutable artifact body."),
  descriptor("video.package.export", "local_write", "sync", "Export a revision package beneath the local Growth Hacker export root."),
] as const;

export function successEnvelope<T>(input: {
  command: string;
  requestId: string;
  data: T;
  artifacts?: CommandArtifactRef[];
  warnings?: string[];
}): CommandSuccess<T> {
  return {
    ok: true,
    schemaVersion: "1",
    command: input.command,
    requestId: input.requestId,
    data: input.data,
    artifacts: input.artifacts ?? [],
    warnings: input.warnings ?? [],
  };
}

export function failureEnvelope(input: {
  command: string;
  requestId: string;
  error: VideoAgentError;
}): CommandFailure {
  return {
    ok: false,
    schemaVersion: "1",
    command: input.command,
    requestId: input.requestId,
    error: {
      code: input.error.code,
      message: input.error.message,
      retryable: input.error.retryable,
      details: input.error.details,
    },
  };
}

export function commandDescriptor(name: string): CommandDescriptor | undefined {
  return VIDEO_COMMANDS.find((item) => item.name === name);
}

function descriptor(name: string, risk: CommandRisk, execution: CommandExecution, summary: string): CommandDescriptor {
  return {
    name,
    version: 1,
    risk,
    execution,
    summary,
    inputSchema: commandInputSchema(name),
    outputSchema: {
      type: "object",
      description: "Command-specific data carried inside the standard success envelope.",
      additionalProperties: true,
    },
  };
}

function commandInputSchema(name: string): Record<string, unknown> {
  const identifier = { type: "string", minLength: 1, maxLength: 180, pattern: "^[A-Za-z0-9][A-Za-z0-9_.:-]*$" };
  const positiveInteger = { type: "integer", minimum: 1 };
  const projectId = { projectId: identifier };
  const runId = { runId: identifier };
  switch (name) {
    case "video.project.create":
      return {
        type: "object",
        additionalProperties: false,
        required: ["title", "source", "brief"],
        properties: {
          title: { type: "string", minLength: 1, maxLength: 160 },
          source: {
            type: "object",
            additionalProperties: false,
            required: ["kind", "text", "language"],
            properties: {
              kind: { enum: ["story", "outline", "screenplay", "voiceover", "article", "unknown"] },
              text: { type: "string", minLength: 1, maxLength: 120000 },
              language: { type: "string", minLength: 1, maxLength: 40 },
              sourceName: { type: "string", maxLength: 240 },
            },
          },
          brief: { type: "object", description: "ProductionBrief; see the Video Agent schema contract." },
          agentId: identifier,
        },
      };
    case "video.project.list":
      return objectSchema({ limit: { type: "integer", minimum: 1, maximum: 1000 } });
    case "video.project.get":
      return objectSchema({ ...projectId, revision: positiveInteger }, ["projectId"]);
    case "video.project.revise":
      return objectSchema({
        ...projectId,
        expectedRevision: positiveInteger,
        title: { type: "string", minLength: 1, maxLength: 160 },
        source: { type: "object" },
        brief: { type: "object" },
        reason: { type: "string", maxLength: 1000 },
      }, ["projectId", "expectedRevision"]);
    case "video.preproduction.start":
      return objectSchema({
        ...projectId,
        revision: positiveInteger,
        idempotencyKey: { type: "string", minLength: 1, maxLength: 200 },
        agentId: identifier,
        provider: { type: "string", maxLength: 180 },
        model: { type: "string", maxLength: 240 },
        maxAttempts: { type: "integer", minimum: 1, maximum: 5 },
      }, ["projectId"]);
    case "video.workflow.get":
    case "video.workflow.tick":
    case "video.workflow.cancel":
      return objectSchema(runId, ["runId"]);
    case "video.workflow.events":
      return objectSchema({ ...runId, after: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 2000 }, follow: { type: "boolean" } }, ["runId"]);
    case "video.workflow.retry":
      return objectSchema({ ...runId, stage: { enum: [
        "story_analysis", "story_bible", "scene_breakdown", "shot_planning",
        "continuity_review", "prompt_compilation", "storyboard_document", "preproduction_approval",
      ] } }, ["runId"]);
    case "video.workflow.approve":
      return objectSchema({
        ...runId,
        decision: { enum: ["approve", "reject"] },
        expectedRevision: positiveInteger,
        decidedBy: { type: "string", minLength: 1, maxLength: 180 },
        note: { type: "string", maxLength: 4000 },
      }, ["runId", "decision", "expectedRevision"]);
    case "video.artifact.list":
    case "video.package.export":
      return objectSchema({ ...projectId, revision: positiveInteger }, ["projectId"]);
    case "video.artifact.read":
      return objectSchema({ artifactId: identifier }, ["artifactId"]);
    default:
      return objectSchema({});
  }
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    ...(required.length ? { required } : {}),
  };
}
