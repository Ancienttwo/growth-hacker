import type { SocialBoardTask } from "@growth-hacker/core";

export function shouldShowSocialBoardTask(task: SocialBoardTask, now = new Date()): boolean {
  if (task.readOnly && task.cronSource === "hermes") return isSocialBoardTaskForDate(task, now);
  return true;
}

export function isSocialBoardTaskForDate(task: SocialBoardTask, date = new Date()): boolean {
  const value = task.completedAt ?? task.startedAt ?? task.updatedAt ?? task.createdAt;
  const taskDate = new Date(value);
  if (Number.isNaN(taskDate.getTime())) return false;
  return taskDate.getFullYear() === date.getFullYear() && taskDate.getMonth() === date.getMonth() && taskDate.getDate() === date.getDate();
}
