export interface ChatRunEventLike {
  event?: string;
  type?: string;
  run_id?: string;
  error?: unknown;
}

export function isStatusPollTimeoutEvent(event: ChatRunEventLike): boolean {
  const name = event.event || event.type || "";
  if (name === "run.status_poll_timeout") return true;
  if (name !== "run.failed" && name !== "response.failed") return false;
  return typeof event.error === "string" && event.error.startsWith("run_status_poll_timeout:");
}

export function isTerminalRunEvent(event: ChatRunEventLike): boolean {
  if (isStatusPollTimeoutEvent(event)) return false;
  const name = event.event || event.type || "";
  return name === "run.completed" || name === "run.failed" || name === "run.cancelled" || name === "response.completed" || name === "response.failed";
}

export function hasTerminalEventForRun(events: ChatRunEventLike[], runId: string): boolean {
  return events.some((event) => event.run_id === runId && isTerminalRunEvent(event));
}

export function findRunMissingTerminalEvent<T extends ChatRunEventLike>(events: T[], isRecoverableRunProgressEvent: (event: T) => boolean): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const runId = events[index].run_id;
    if (!runId) continue;
    if (hasTerminalEventForRun(events, runId)) return undefined;
    if (events.some((event) => event.run_id === runId && isRecoverableRunProgressEvent(event))) {
      return runId;
    }
  }
  return undefined;
}
