import { VideoAgentError } from "./errors";
import type {
  ContinuityReport,
  PreproductionStage,
  SceneSpec,
  ShotSpec,
  StageOutputEnvelope,
  StoryAnalysis,
  StoryBible,
} from "./types";
import { VIDEO_SCHEMA_VERSION } from "./types";
import {
  asRecord,
  parseContinuityReport,
  parseSceneBreakdown,
  parseShotPlan,
  parseStoryAnalysis,
  parseStoryBible,
} from "./validation";

export type ParsedAgentStageOutput =
  | StageOutputEnvelope<StoryAnalysis>
  | StageOutputEnvelope<StoryBible>
  | StageOutputEnvelope<SceneSpec[]>
  | StageOutputEnvelope<ShotSpec[]>
  | StageOutputEnvelope<ContinuityReport>;

export function parseAgentStageOutput(stage: PreproductionStage, raw: string): ParsedAgentStageOutput {
  if (!isAgentStage(stage)) {
    throw new VideoAgentError("invalid_stage_output", `Stage '${stage}' is deterministic and cannot consume Agent output.`);
  }
  const parsed = parseJsonObject(raw);
  const envelope = asRecord(parsed, "stage_output");
  if (envelope.schemaVersion !== VIDEO_SCHEMA_VERSION) {
    throw new VideoAgentError("invalid_stage_output", "stage_output.schemaVersion must be '1'", {
      details: { stage, actual: envelope.schemaVersion },
    });
  }
  if (envelope.stage !== stage) {
    throw new VideoAgentError("invalid_stage_output", `Expected stage '${stage}' but received '${String(envelope.stage)}'.`, {
      details: { expected: stage, actual: envelope.stage },
    });
  }
  const warnings = parseWarnings(envelope.warnings);
  try {
    switch (stage) {
      case "story_analysis":
        return { schemaVersion: VIDEO_SCHEMA_VERSION, stage, data: parseStoryAnalysis(envelope.data), warnings };
      case "story_bible":
        return { schemaVersion: VIDEO_SCHEMA_VERSION, stage, data: parseStoryBible(envelope.data), warnings };
      case "scene_breakdown":
        return { schemaVersion: VIDEO_SCHEMA_VERSION, stage, data: parseSceneBreakdown(envelope.data), warnings };
      case "shot_planning":
        return { schemaVersion: VIDEO_SCHEMA_VERSION, stage, data: parseShotPlan(envelope.data), warnings };
      case "continuity_review":
        return { schemaVersion: VIDEO_SCHEMA_VERSION, stage, data: parseContinuityReport(envelope.data), warnings };
      default:
        return assertNever(stage);
    }
  } catch (error) {
    if (error instanceof VideoAgentError) {
      throw new VideoAgentError("invalid_stage_output", error.message, {
        retryable: true,
        details: { stage, ...error.details },
      });
    }
    throw error;
  }
}

export function parseJsonObject(raw: string): unknown {
  const text = raw.trim();
  if (!text) throw invalidJson("Agent returned an empty response.");
  const candidates = [text, unwrapFence(text), objectSlice(text)].filter((item, index, all): item is string => Boolean(item) && all.indexOf(item) === index);
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("root_not_object");
      return value;
    } catch (error) {
      lastError = error;
    }
  }
  throw invalidJson(lastError instanceof Error ? `Agent output is not a JSON object: ${lastError.message}` : "Agent output is not a JSON object.");
}

export function isAgentStage(stage: PreproductionStage): stage is Exclude<PreproductionStage, "prompt_compilation" | "storyboard_document" | "preproduction_approval"> {
  return stage === "story_analysis"
    || stage === "story_bible"
    || stage === "scene_breakdown"
    || stage === "shot_planning"
    || stage === "continuity_review";
}

function parseWarnings(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new VideoAgentError("invalid_stage_output", "stage_output.warnings must be an array");
  return value.map((item, index) => {
    if (typeof item !== "string" || !item.trim()) {
      throw new VideoAgentError("invalid_stage_output", `stage_output.warnings[${index}] must be a non-empty string`);
    }
    return item.trim().slice(0, 1_000);
  });
}

function unwrapFence(value: string): string | undefined {
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(value);
  return match?.[1]?.trim();
}

function objectSlice(value: string): string | undefined {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  return value.slice(start, end + 1);
}

function invalidJson(message: string): VideoAgentError {
  return new VideoAgentError("invalid_stage_output", message, { retryable: true });
}

function assertNever(value: never): never {
  throw new VideoAgentError("invalid_stage_output", `Unsupported stage '${String(value)}'.`);
}
