import { describe, expect, test } from "bun:test";

import type { HermesSkillInfo } from "@growth-hacker/core";

import { buildSkillInstructions, resolveAutomaticSkillHints } from "./chatSkillInstructions";

function skill(overrides: Partial<HermesSkillInfo>): HermesSkillInfo {
  return {
    name: "generic-skill",
    category: "social-media",
    description: "Generic skill",
    path: "/tmp/generic-skill/SKILL.md",
    enabled: true,
    status: "enabled",
    ...overrides
  };
}

describe("chat skill instructions", () => {
  test("keeps generic selected skills as lightweight hints", () => {
    const instructions = buildSkillInstructions([skill({ name: "generic-skill" })]);

    expect(instructions).toContain("explicitly selected by the user or inferred from the request");
    expect(instructions).toContain('skill_view("<skill-name>")');
    expect(instructions).toContain("$generic-skill");
    expect(instructions).not.toContain("Xiaohongshu output quality contract");
  });

  test("adds the Xiaohongshu native output contract for selected xiaohongshu-skill", () => {
    const instructions = buildSkillInstructions([skill({ name: "xiaohongshu-skill", description: "XHS operations" })]);

    expect(instructions).toContain("Xiaohongshu output quality contract");
    expect(instructions).toContain("20 characters or fewer");
    expect(instructions).toContain("counting punctuation and symbols");
    expect(instructions).toContain("at most one blank line");
    expect(instructions).toContain("never emit two or more consecutive blank lines");
    expect(instructions).toContain("Use emoji or visible symbols as section openers or bullets");
    expect(instructions).toContain("Avoid visible Markdown syntax");
  });

  test("infers Xiaohongshu and infographic skills from natural language", () => {
    const inferred = resolveAutomaticSkillHints("帮我写一篇小红书认知纠偏笔记，并出一张配图", [
      skill({ name: "xiaohongshu-skill" }),
      skill({ name: "baoyu-infographic", category: "creative" }),
      skill({ name: "signal-detector", category: "" }),
      skill({ name: "generic-skill" })
    ]);

    expect(inferred.map((item) => item.name)).toEqual(["xiaohongshu-skill", "baoyu-infographic", "signal-detector"]);
  });

  test("infers Guizang social cards for card and WeChat cover requests", () => {
    const inferred = resolveAutomaticSkillHints("把这篇文章做成公众号封面，21:9 + 1:1 分享卡", [
      skill({ name: "guizang-social-card-skill", category: "creative" }),
      skill({ name: "baoyu-infographic", category: "creative" })
    ]);

    expect(inferred.map((item) => item.name)).toEqual(["guizang-social-card-skill", "baoyu-infographic"]);
  });

  test("treats create image actions and baoyu typo as infographic work", () => {
    expect(
      resolveAutomaticSkillHints("GUI action: Create image.\n\nPrompt:\n小红书配图", [
        skill({ name: "baoyu-infographic", category: "creative" })
      ]).map((item) => item.name)
    ).toEqual(["baoyu-infographic"]);

    expect(
      resolveAutomaticSkillHints("用 baoyu-infrograph 出一张信息图", [
        skill({ name: "baoyu-infographic", category: "creative" })
      ]).map((item) => item.name)
    ).toEqual(["baoyu-infographic"]);
  });

  test("adds a Baoyu infographic execution contract for selected visual work", () => {
    const instructions = buildSkillInstructions([skill({ name: "baoyu-infographic", category: "creative" })]);

    expect(instructions).toContain("Baoyu infographic execution contract");
    expect(instructions).toContain('skill_view("baoyu-infographic")');
    expect(instructions).toContain("Do not invent an image path");
  });

  test("adds a Guizang social card execution contract for selected card work", () => {
    const instructions = buildSkillInstructions([skill({ name: "guizang-social-card-skill", category: "creative" })]);

    expect(instructions).toContain("Guizang social card execution contract");
    expect(instructions).toContain('skill_view("guizang-social-card-skill")');
    expect(instructions).toContain("Produce concrete HTML/image artifacts");
  });

  test("does not infer disabled or already selected skills", () => {
    const selected = skill({ name: "xiaohongshu-skill" });
    const inferred = resolveAutomaticSkillHints("小红书配图", [
      selected,
      skill({ name: "baoyu-infographic", enabled: false, status: "disabled" })
    ], [selected]);

    expect(inferred).toEqual([]);
  });
});
