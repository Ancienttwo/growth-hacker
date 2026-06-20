import {
  VideoAgentError,
  buildVideoAgentInstructions,
  buildVideoAgentStagePrompt,
} from "@growth-hacker/video-agent";
import type {
  PreproductionSnapshot,
  WorkflowRun,
  WorkflowStep,
} from "@growth-hacker/video-agent";
import type { AppConfig } from "../config";
import { createHermesChatRun, getHermesRun, stopHermesRun } from "../hermesChat";

export interface StartAgentStageInput {
  run: WorkflowRun;
  step: WorkflowStep;
  snapshot: PreproductionSnapshot;
  validationErrors?: string[];
  previousRawOutput?: string;
}

export interface AgentStageStatus {
  status: "running" | "succeeded" | "failed" | "cancelled";
  output?: string;
  error?: string;
  usage?: Record<string, unknown>;
}

export interface VideoAgentPort {
  startStage(input: StartAgentStageInput): Promise<{ externalRunId: string }>;
  getStage(externalRunId: string): Promise<AgentStageStatus>;
  stopStage(externalRunId: string): Promise<void>;
}

export class HermesVideoAgentAdapter implements VideoAgentPort {
  constructor(private readonly config: AppConfig) {}

  async startStage(input: StartAgentStageInput): Promise<{ externalRunId: string }> {
    const prompt = buildVideoAgentStagePrompt(input.step.name, input.snapshot, {
      validationErrors: input.validationErrors,
      previousRawOutput: input.previousRawOutput,
    });
    const result = await createHermesChatRun(this.config, {
      agentId: input.run.requestedAgentId ?? this.config.defaultHermesProfile,
      input: prompt,
      sessionId: `video-${input.run.projectId}-${input.run.revision}-${input.step.name}-${input.step.attempt}`,
      instructions: buildVideoAgentInstructions(input.step.name),
      provider: input.run.requestedProvider,
      model: input.run.requestedModel,
      permissionMode: "read_only",
      reasoningEffort: input.step.name === "shot_planning" || input.step.name === "continuity_review" ? "high" : "medium",
    });
    return { externalRunId: result.runId };
  }

  async getStage(externalRunId: string): Promise<AgentStageStatus> {
    try {
      const result = await getHermesRun(this.config, externalRunId);
      const status = normalizeStatus(result.status);
      return {
        status,
        output: result.output,
        error: normalizeError(result.error),
        usage: result.usage,
      };
    } catch (error) {
      throw new VideoAgentError("external_provider_failed", error instanceof Error ? error.message : String(error), {
        retryable: true,
        details: { provider: "hermes", externalRunId },
      });
    }
  }

  async stopStage(externalRunId: string): Promise<void> {
    await stopHermesRun(this.config, externalRunId);
  }
}

function normalizeStatus(value: string): AgentStageStatus["status"] {
  const status = value.toLowerCase();
  if (["completed", "complete", "succeeded", "success", "done"].includes(status)) return "succeeded";
  if (["failed", "error"].includes(status)) return "failed";
  if (["cancelled", "canceled", "stopped"].includes(status)) return "cancelled";
  return "running";
}

function normalizeError(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 4_000);
  if (value && typeof value === "object") return JSON.stringify(value).slice(0, 4_000);
  return undefined;
}
