import { describe, expect, test } from "bun:test";

import { findRunMissingTerminalEvent, hasTerminalEventForRun, isStatusPollTimeoutEvent, isTerminalRunEvent, type ChatRunEventLike } from "./chatRunStatus";

function isProgressEvent(event: ChatRunEventLike): boolean {
  const name = event.event || event.type || "";
  return name === "agent-runtime" || name === "tool.completed" || isStatusPollTimeoutEvent(event);
}

describe("Hermes run status recovery", () => {
  test("treats frontend poll timeout as recoverable instead of terminal", () => {
    const events: ChatRunEventLike[] = [
      { event: "agent-runtime", run_id: "run_1" },
      { event: "tool.completed", run_id: "run_1" },
      { event: "run.failed", run_id: "run_1", error: "run_status_poll_timeout:last_event=tool.completed" }
    ];

    expect(isStatusPollTimeoutEvent(events[2])).toBe(true);
    expect(isTerminalRunEvent(events[2])).toBe(false);
    expect(hasTerminalEventForRun(events, "run_1")).toBe(false);
    expect(findRunMissingTerminalEvent(events, isProgressEvent)).toBe("run_1");
  });

  test("stops recovery after real completion arrives", () => {
    const events: ChatRunEventLike[] = [
      { event: "agent-runtime", run_id: "run_1" },
      { event: "run.status_poll_timeout", run_id: "run_1", error: "run_status_poll_timeout:last_event=tool.completed" },
      { event: "run.completed", run_id: "run_1" }
    ];

    expect(hasTerminalEventForRun(events, "run_1")).toBe(true);
    expect(findRunMissingTerminalEvent(events, isProgressEvent)).toBeUndefined();
  });
});
