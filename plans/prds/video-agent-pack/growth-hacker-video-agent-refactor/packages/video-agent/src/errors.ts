export type VideoErrorCode =
  | "invalid_input"
  | "invalid_stage_output"
  | "invalid_state_transition"
  | "project_not_found"
  | "run_not_found"
  | "step_not_found"
  | "artifact_not_found"
  | "artifact_collision"
  | "approval_not_found"
  | "revision_conflict"
  | "idempotency_conflict"
  | "workflow_not_ready"
  | "workflow_terminal"
  | "approval_required"
  | "provider_capability_missing"
  | "external_provider_failed"
  | "ambiguous_external_submission"
  | "internal_error";

export class VideoAgentError extends Error {
  constructor(
    readonly code: VideoErrorCode,
    message: string,
    readonly options: {
      retryable?: boolean;
      status?: number;
      details?: Record<string, unknown>;
    } = {},
  ) {
    super(message);
    this.name = "VideoAgentError";
  }

  get retryable(): boolean {
    return this.options.retryable === true;
  }

  get status(): number {
    return this.options.status ?? defaultStatus(this.code);
  }

  get details(): Record<string, unknown> | undefined {
    return this.options.details;
  }
}

function defaultStatus(code: VideoErrorCode): number {
  switch (code) {
    case "project_not_found":
    case "run_not_found":
    case "step_not_found":
    case "artifact_not_found":
    case "approval_not_found":
      return 404;
    case "revision_conflict":
    case "artifact_collision":
    case "ambiguous_external_submission":
    case "idempotency_conflict":
    case "invalid_state_transition":
    case "workflow_terminal":
      return 409;
    case "approval_required":
      return 428;
    case "external_provider_failed":
      return 502;
    case "internal_error":
      return 500;
    default:
      return 400;
  }
}

export function asVideoAgentError(error: unknown, fallbackCode: VideoErrorCode = "internal_error"): VideoAgentError {
  if (error instanceof VideoAgentError) return error;
  return new VideoAgentError(
    fallbackCode,
    error instanceof Error ? error.message : String(error),
    { retryable: fallbackCode === "external_provider_failed" },
  );
}
