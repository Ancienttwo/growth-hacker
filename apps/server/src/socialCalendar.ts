import type { SocialTaskCalendarItem } from "@growth-hacker/core";

import type { AppConfig } from "./config";
import { listSocialBoardTasks } from "./socialBoard";
import { listSocialCronJobs } from "./socialCron";

export function listSocialTaskCalendar(config: AppConfig): SocialTaskCalendarItem[] {
  const agents = new Map(config.socialAgents.map((agent) => [agent.id, agent.runner]));
  const cronItems: SocialTaskCalendarItem[] = listSocialCronJobs(config)
    .filter((job) => job.enabled && Boolean(job.nextRunAt))
    .map((job) => ({
      id: job.id,
      source: "cron",
      sourceId: job.id,
      cronSource: job.source ?? "growth",
      readOnly: job.readOnly,
      title: job.name,
      startsAt: job.nextRunAt as string,
      agentId: job.agentId,
      runner: job.source === "hermes" ? "hermes" : agents.get(job.agentId) ?? "local",
      llm: job.llm,
      platform: job.platform,
      profile: job.profile,
      taskType: job.taskType,
      status: job.state
    }));

  const boardItems: SocialTaskCalendarItem[] = listSocialBoardTasks(config)
    .filter((task) => task.status !== "archived")
    .map((task) => ({
      id: task.id,
      source: "board",
      sourceId: task.sourceId,
      cronSource: task.cronSource,
      readOnly: task.readOnly,
      title: task.title,
      startsAt: task.startedAt ?? task.createdAt,
      agentId: task.agentId,
      runner: task.runner,
      llm: task.llm,
      platform: task.platform,
      profile: task.profile,
      taskType: task.taskType,
      status: task.status
    }));

  return [...cronItems, ...boardItems].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
