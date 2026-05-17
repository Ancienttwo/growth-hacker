import { describe, expect, test } from "bun:test";

import { buildHermesChatInputFromTranscript } from "./chatInput";

describe("Hermes chat input", () => {
  test("replays hidden agent payloads for imported documents", () => {
    const messages = buildHermesChatInputFromTranscript(
      [
        {
          kind: "user",
          text: "总结这个文档",
          agentText: "总结这个文档\n\nAttached local context:\n\n### brief.md\n\n文档正文"
        },
        {
          kind: "assistant",
          text: "我已经读完。"
        }
      ],
      "继续改标题"
    );

    expect(messages).toEqual([
      {
        role: "user",
        content: "总结这个文档\n\nAttached local context:\n\n### brief.md\n\n文档正文"
      },
      {
        role: "assistant",
        content: "我已经读完。"
      },
      {
        role: "user",
        content: "继续改标题"
      }
    ]);
  });

  test("keeps the visible transcript text when no hidden agent payload exists", () => {
    expect(
      buildHermesChatInputFromTranscript(
        [
          {
            kind: "user",
            text: "普通问题"
          }
        ],
        "下一句"
      )
    ).toEqual([
      {
        role: "user",
        content: "普通问题"
      },
      {
        role: "user",
        content: "下一句"
      }
    ]);
  });
});
