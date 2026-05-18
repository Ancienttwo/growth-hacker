import { describe, expect, test } from "bun:test";

import type { ArtifactContent } from "@growth-hacker/core";

import { buildVaultAttachmentContent, buildVaultWorkspaceChatMessage, formatVaultPromptDate } from "./chatVaultPrompt";

const previousNote: ArtifactContent = {
  artifact: {
    kind: "file",
    mime: "markdown",
    name: "价值观蒸馏.md",
    path: "_library/xiaohongshu/evidence/2026-05-17-liang-xiangrun-mingli/价值观蒸馏.md",
    platform: "vault",
    profile: "vault",
    size: 42,
    updatedAt: "2026-05-17T10:00:00+08:00"
  },
  content: "# 旧题正文\n\n不应该自动进入新任务。"
};

describe("vault chat prompt", () => {
  test("treats the current preview as navigation context for a new topic", () => {
    const prompt = buildVaultWorkspaceChatMessage("今天开一个八字和紫微的新题", {
      artifact: previousNote,
      today: new Date(2026, 4, 18),
      vaultRoot: "~/.growth/vault"
    });

    expect(prompt).toContain("Today: 2026-05-18.");
    expect(prompt).toContain("Visible preview path: _library/xiaohongshu/evidence/2026-05-17-liang-xiangrun-mingli/价值观蒸馏.md");
    expect(prompt).toContain("The visible preview is navigation context only.");
    expect(prompt).toContain("For a new topic, create a new dated artifact/folder using today's date.");
    expect(prompt).toContain("If the topic differs from the visible preview or referenced note, create a separate Markdown file.");
    expect(prompt).toContain("<profile>/xiaohongshu/sop/publish-note-with-cover.md");
    expect(prompt).toContain("text drafting and cover production are separate steps");
    expect(prompt).toContain("scan `assets/<YYYY-MM-DD-topic-slug>/cover.png`");
    expect(prompt).toContain("baoyu-infographic");
    expect(prompt).toContain("Internal notes such as lessons, metrics, evidence, strategy, or growth-signal analysis do not require cover images");
    expect(prompt).not.toContain("Current preview content");
    expect(prompt).not.toContain("旧题正文");
  });

  test("requires a separate Markdown file when the topic differs from the selected note", () => {
    const prompt = buildVaultWorkspaceChatMessage("改写另一个主题：小红书账号冷启动", {
      artifact: previousNote,
      today: new Date(2026, 4, 18),
      vaultRoot: "~/.growth/vault"
    });

    expect(prompt).toContain("Do not merge unrelated topics into the same .md file.");
    expect(prompt).toContain("User request:\n改写另一个主题：小红书账号冷启动");
  });

  test("includes note content only for an explicit reference attachment", () => {
    const attachment = buildVaultAttachmentContent(previousNote, "~/.growth/vault");

    expect(attachment).toContain("Vault path: _library/xiaohongshu/evidence/2026-05-17-liang-xiangrun-mingli/价值观蒸馏.md");
    expect(attachment).toContain("explicitly referenced vault attachment");
    expect(attachment).toContain("旧题正文");
  });

  test("formats dates with the local calendar day", () => {
    expect(formatVaultPromptDate(new Date(2026, 4, 18))).toBe("2026-05-18");
  });
});
