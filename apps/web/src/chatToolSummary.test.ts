import { describe, expect, test } from "bun:test";

import { toolTranscriptSummary, type ChatToolSummaryItem } from "./chatToolSummary";
import { translate, type TFunction } from "./i18n";

const t: TFunction = (key, params) => translate(key, "zh-Hans", params);

describe("chat tool summary", () => {
  test("reports partial tool failures without implying every tool failed", () => {
    const tools: ChatToolSummaryItem[] = [
      { tool: "read_file", state: "done" },
      { tool: "read_file", state: "done" },
      { tool: "read_file", state: "failed" },
      { tool: "search_files", state: "done" },
      { tool: "read_file", state: "done" },
      { tool: "read_file", state: "done" }
    ];

    expect(toolTranscriptSummary({ state: "failed" }, tools, t)).toBe("1/6 个 tool calls failed");
  });

  test("keeps aggregate state wording when the group has no failures", () => {
    const tools: ChatToolSummaryItem[] = [
      { tool: "read_file", state: "done" },
      { tool: "search_files", state: "done" }
    ];

    expect(toolTranscriptSummary({ state: "done" }, tools, t)).toBe("2 个 tool calls completed");
  });
});
