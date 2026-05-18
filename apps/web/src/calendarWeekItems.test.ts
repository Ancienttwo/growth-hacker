import { describe, expect, test } from "bun:test";

import type { SocialCronJob, SocialTaskCalendarItem } from "@growth-hacker/core";

import { buildCalendarWeekItems } from "./calendarWeekItems";

describe("calendar week items", () => {
  test("shows the completed cron run instead of repeating its scheduled occurrence", () => {
    const job = cronJob({
      id: "hermes:471588ae6174",
      source: "hermes",
      name: "xhs-astrozi-nurture-daily-brief",
      schedule: { kind: "daily", value: "10 9 * * *", display: "10 9 * * *", time: "09:10" }
    });
    const completed = calendarItem({
      id: "hermes-run:471588ae6174:2026-05-18_09-11-57",
      source: "board",
      sourceId: job.id,
      title: job.name,
      startsAt: new Date(2026, 4, 18, 9, 11, 57).toISOString(),
      status: "done"
    });

    const items = buildCalendarWeekItems([completed], [job], new Date(2026, 4, 18), { now: new Date(2026, 4, 18, 8) });

    const mondayItems = items.filter((item) => sameLocalDate(new Date(item.startsAt), new Date(2026, 4, 18)));
    expect(mondayItems).toHaveLength(1);
    expect(mondayItems[0]).toMatchObject({ source: "board", status: "done", sourceId: job.id });
    expect(
      items.some((item) => item.source === "cron" && item.status === "scheduled" && sameLocalDate(new Date(item.startsAt), new Date(2026, 4, 19)))
    ).toBe(true);
  });

  test("keeps the scheduled occurrence when the completed run belongs to another local day", () => {
    const job = cronJob({
      id: "hermes:c6333b595e58",
      source: "hermes",
      name: "xhs-astrozi-topic-harvest-daily",
      schedule: { kind: "daily", value: "15 9 * * *", display: "15 9 * * *", time: "09:15" }
    });
    const yesterday = calendarItem({
      source: "board",
      sourceId: job.id,
      title: job.name,
      startsAt: new Date(2026, 4, 17, 9, 17, 42).toISOString(),
      status: "done"
    });

    const items = buildCalendarWeekItems([yesterday], [job], new Date(2026, 4, 18), { now: new Date(2026, 4, 18, 8) });

    const mondayItems = items.filter((item) => sameLocalDate(new Date(item.startsAt), new Date(2026, 4, 18)));
    expect(mondayItems).toHaveLength(1);
    expect(mondayItems[0]).toMatchObject({ source: "cron", status: "scheduled", sourceId: job.id });
  });
});

function cronJob(overrides: Partial<SocialCronJob> = {}): SocialCronJob {
  return {
    id: "scron-1",
    source: "growth",
    agentId: "growth-agent",
    platform: "xiaohongshu",
    profile: "astrozi",
    name: "Daily job",
    taskType: "daily-ops-refresh",
    schedule: { kind: "daily", value: "daily 09:10", display: "daily 09:10", time: "09:10" },
    enabled: true,
    state: "scheduled",
    createdAt: new Date(2026, 4, 17, 8).toISOString(),
    updatedAt: new Date(2026, 4, 17, 8).toISOString(),
    nextRunAt: new Date(2026, 4, 18, 9, 10).toISOString(),
    runCount: 1,
    ...overrides
  };
}

function calendarItem(overrides: Partial<SocialTaskCalendarItem> = {}): SocialTaskCalendarItem {
  return {
    id: "item-1",
    source: "board",
    sourceId: "scron-1",
    title: "Daily job",
    startsAt: new Date(2026, 4, 18, 9, 11).toISOString(),
    agentId: "growth-agent",
    runner: "hermes",
    platform: "xiaohongshu",
    profile: "astrozi",
    taskType: "daily-ops-refresh",
    status: "done",
    ...overrides
  };
}

function sameLocalDate(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}
