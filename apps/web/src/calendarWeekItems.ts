import type { SocialCronJob, SocialTaskCalendarItem } from "@growth-hacker/core";

export interface BuildCalendarWeekItemsOptions {
  now?: Date;
}

export function buildCalendarWeekItems(
  items: SocialTaskCalendarItem[],
  jobs: SocialCronJob[],
  weekStart: Date,
  options: BuildCalendarWeekItemsOptions = {}
): SocialTaskCalendarItem[] {
  const weekEnd = addDays(weekStart, 7);
  const storedCronItems = new Map(items.filter((item) => item.source === "cron").map((item) => [item.id, item]));
  const projectedDailyCronIds = new Set(
    jobs.filter((job) => job.enabled && job.schedule.kind === "daily" && Boolean(job.schedule.time)).map((job) => job.id)
  );
  const storedItems = items.filter((item) => {
    const startsAt = new Date(item.startsAt);
    if (!isDateInRange(startsAt, weekStart, weekEnd)) return false;
    return item.source !== "cron" || !projectedDailyCronIds.has(item.id);
  });
  const occupiedCronOccurrences = new Set(
    storedItems.flatMap((item) => {
      if (item.source !== "board" || !item.sourceId) return [];
      return [cronOccurrenceKey(item.sourceId, new Date(item.startsAt))];
    })
  );
  const projectedCronItems = jobs.flatMap((job) =>
    projectDailyCronJob(job, weekStart, storedCronItems.get(job.id)?.runner, occupiedCronOccurrences, options.now ?? new Date())
  );
  return [...projectedCronItems, ...storedItems].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

function projectDailyCronJob(
  job: SocialCronJob,
  weekStart: Date,
  runner: SocialTaskCalendarItem["runner"] | undefined,
  occupiedCronOccurrences: Set<string>,
  now: Date
): SocialTaskCalendarItem[] {
  if (!job.enabled || job.schedule.kind !== "daily" || !job.schedule.time) return [];

  const [hour, minute] = job.schedule.time.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return [];

  const createdAt = new Date(job.createdAt);
  const earliest = Number.isNaN(createdAt.getTime()) ? startOfLocalDay(now) : createdAt;
  const today = startOfLocalDay(now);

  return Array.from({ length: 7 }).flatMap((_, index): SocialTaskCalendarItem[] => {
    const startsAt = addDays(weekStart, index);
    startsAt.setHours(hour, minute, 0, 0);
    if (startsAt < earliest || startsAt < today || occupiedCronOccurrences.has(cronOccurrenceKey(job.id, startsAt))) return [];
    const status: SocialTaskCalendarItem["status"] =
      job.state === "running" || job.state === "failed" || job.state === "paused" ? job.state : "scheduled";
    return [
      {
        id: `${job.id}:${startsAt.toISOString().slice(0, 10)}`,
        source: "cron",
        sourceId: job.id,
        cronSource: job.source ?? "growth",
        readOnly: job.readOnly,
        title: job.name,
        startsAt: startsAt.toISOString(),
        agentId: job.agentId,
        runner: runner ?? (job.source === "hermes" ? "hermes" : "local"),
        llm: job.llm,
        platform: job.platform,
        profile: job.profile,
        taskType: job.taskType,
        status
      }
    ];
  });
}

function cronOccurrenceKey(sourceId: string, date: Date): string {
  return `${sourceId}:${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function isDateInRange(value: Date, start: Date, end: Date): boolean {
  return value >= start && value < end;
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}
