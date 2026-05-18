import { describe, expect, test } from "bun:test";

import type { SocialBoardTask } from "@growth-hacker/core";

import { isSocialBoardTaskForDate, shouldShowSocialBoardTask } from "./socialBoardFilters";

function task(overrides: Partial<SocialBoardTask> = {}): SocialBoardTask {
  return {
    id: "task-1",
    boardId: "social-media",
    agentId: "growth-agent",
    runner: "hermes",
    platform: "xiaohongshu",
    profile: "astrozi",
    taskType: "topic-harvest",
    title: "Topic harvest",
    status: "done",
    source: "manual",
    createdAt: "2026-05-17T09:00:00.000Z",
    updatedAt: "2026-05-17T09:00:00.000Z",
    ...overrides
  };
}

describe("social board filters", () => {
  test("keeps normal board tasks visible across days", () => {
    expect(shouldShowSocialBoardTask(task(), new Date("2026-05-18T09:00:00.000Z"))).toBe(true);
  });

  test("limits Hermes read-through cron outputs to the selected local day", () => {
    const readThrough = task({
      cronSource: "hermes",
      readOnly: true,
      source: "cron",
      sourceId: "hermes:c6333b595e58",
      completedAt: "2026-05-17T09:00:00.000Z"
    });

    expect(shouldShowSocialBoardTask(readThrough, new Date("2026-05-17T10:00:00.000Z"))).toBe(true);
    expect(shouldShowSocialBoardTask(readThrough, new Date("2026-05-19T09:00:00.000Z"))).toBe(false);
  });

  test("uses completion time before created time when classifying a task day", () => {
    expect(
      isSocialBoardTaskForDate(
        task({
          createdAt: "2026-05-17T09:00:00.000Z",
          completedAt: "2026-05-18T12:00:00.000Z"
        }),
        new Date("2026-05-18T13:00:00.000Z")
      )
    ).toBe(true);
  });
});
