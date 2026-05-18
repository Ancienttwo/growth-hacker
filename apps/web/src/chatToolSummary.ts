import type { TFunction } from "./i18n";

export type ChatToolState = "running" | "done" | "failed";

export interface ChatToolSummaryGroup {
  state?: ChatToolState;
}

export interface ChatToolSummaryItem {
  label?: string;
  tool?: string;
  state?: ChatToolState;
}

export function toolTranscriptSummary(group: ChatToolSummaryGroup, tools: ChatToolSummaryItem[], t: TFunction): string {
  if (tools.length === 1) return tools[0].label ?? tools[0].tool ?? t("chat.toolFallback");

  const failedCount = tools.filter((tool) => tool.state === "failed").length;
  if (failedCount > 0) return t("chat.toolCallsFailedPartial", { failed: failedCount, count: tools.length });

  const state =
    group.state === "running" ? t("chat.toolState.running") : group.state === "failed" ? t("chat.toolState.failed") : t("chat.toolState.completed");
  return t("chat.toolCallsState", { count: tools.length, state });
}
