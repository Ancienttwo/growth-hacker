import { VideoAgentError } from "./errors";
import type { PreproductionStage, WorkflowStatus, WorkflowStepStatus } from "./types";

export const PREPRODUCTION_DEFINITION = "video.preproduction.v1" as const;

export const PREPRODUCTION_STAGES: readonly PreproductionStage[] = [
  "story_analysis",
  "story_bible",
  "scene_breakdown",
  "shot_planning",
  "continuity_review",
  "prompt_compilation",
  "storyboard_document",
  "preproduction_approval",
] as const;

const RUN_TRANSITIONS: Record<WorkflowStatus, readonly WorkflowStatus[]> = {
  queued: ["running", "cancelled", "failed"],
  running: ["waiting_approval", "succeeded", "failed", "cancelled"],
  waiting_approval: ["running", "succeeded", "failed", "cancelled"],
  succeeded: [],
  failed: ["queued", "running", "cancelled"],
  cancelled: [],
};

const STEP_TRANSITIONS: Record<WorkflowStepStatus, readonly WorkflowStepStatus[]> = {
  pending: ["submitting", "running", "failed", "skipped", "cancelled"],
  submitting: ["running", "failed", "cancelled"],
  running: ["succeeded", "failed", "cancelled"],
  succeeded: [],
  failed: ["pending", "running", "cancelled"],
  skipped: [],
  cancelled: [],
};

export function assertRunTransition(from: WorkflowStatus, to: WorkflowStatus): void {
  if (from === to) return;
  if (!RUN_TRANSITIONS[from].includes(to)) {
    throw new VideoAgentError("invalid_state_transition", `Workflow run cannot transition from '${from}' to '${to}'.`, {
      details: { from, to },
    });
  }
}

export function assertStepTransition(from: WorkflowStepStatus, to: WorkflowStepStatus): void {
  if (from === to) return;
  if (!STEP_TRANSITIONS[from].includes(to)) {
    throw new VideoAgentError("invalid_state_transition", `Workflow step cannot transition from '${from}' to '${to}'.`, {
      details: { from, to },
    });
  }
}

export function stageOrdinal(stage: PreproductionStage): number {
  const index = PREPRODUCTION_STAGES.indexOf(stage);
  if (index < 0) throw new VideoAgentError("invalid_input", `Unknown preproduction stage '${stage}'.`);
  return index + 1;
}

export function stageProgress(stage: PreproductionStage, completed = false): number {
  const index = PREPRODUCTION_STAGES.indexOf(stage);
  if (index < 0) return 0;
  const numerator = completed ? index + 1 : index;
  return Math.round((numerator / PREPRODUCTION_STAGES.length) * 100);
}

export function nextPreproductionStage(stage?: PreproductionStage): PreproductionStage | undefined {
  if (!stage) return PREPRODUCTION_STAGES[0];
  const index = PREPRODUCTION_STAGES.indexOf(stage);
  return index >= 0 ? PREPRODUCTION_STAGES[index + 1] : undefined;
}

export function isTerminalRunStatus(status: WorkflowStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

export function isTerminalStepStatus(status: WorkflowStepStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "skipped" || status === "cancelled";
}
