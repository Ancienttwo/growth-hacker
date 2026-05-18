import type { HermesSkillInfo } from "@growth-hacker/core";

export function resolveAutomaticSkillHints(message: string, skills: HermesSkillInfo[], selectedSkills: HermesSkillInfo[] = []): HermesSkillInfo[] {
  const selectedNames = new Set(selectedSkills.map((skill) => skill.name.toLowerCase()));
  const byName = new Map(skills.filter((skill) => skill.enabled).map((skill) => [skill.name.toLowerCase(), skill]));
  const inferred: HermesSkillInfo[] = [];

  const add = (name: string) => {
    const key = name.toLowerCase();
    const skill = byName.get(key);
    if (!skill || selectedNames.has(key) || inferred.some((item) => item.name.toLowerCase() === key)) return;
    inferred.push(skill);
  };

  if (looksLikeXiaohongshuWork(message)) add("xiaohongshu-skill");
  if (looksLikeInfographicWork(message)) add("baoyu-infographic");
  if (looksLikeGrowthSignalWork(message)) add("signal-detector");

  return inferred;
}

export function buildSkillInstructions(skills: HermesSkillInfo[]): string | undefined {
  if (!skills.length) return undefined;
  const lines = skills.map((skill) => `- $${skill.name} (${skill.category || "uncategorized"}): ${skill.description || skill.path}`);
  const contracts = skills.flatMap(skillOutputQualityContracts);
  return [
    "The enabled Hermes skills below were explicitly selected by the user or inferred from the request.",
    "Treat $skill tokens and inferred skill matches as skill selection hints. When a listed skill is relevant, call `skill_view(\"<skill-name>\")` before answering if that tool is available, then apply the local skill behavior.",
    ...lines,
    ...contracts
  ].join("\n");
}

function looksLikeXiaohongshuWork(message: string): boolean {
  return /xiaohongshu|小红书|小紅書|\bxhs\b|种草|種草|起号|起號|养号|養號|代运营|代運營|爆款笔记|爆款筆記/.test(message.toLowerCase());
}

function looksLikeInfographicWork(message: string): boolean {
  return /baoyu-infographic|baoyu-infrograph|信息图|資訊圖|可视化|可視化|高密度信息大图|高密度資訊圖|视觉摘要|視覺摘要|配图|配圖|图片|圖片|出图|出圖|作图|作圖|做图|做圖|封面图|封面圖|封面|海报|海報|一张图|一張圖|infographic|visual summary|cover image|create image|image_generate|poster/.test(
    message.toLowerCase()
  );
}

function looksLikeGrowthSignalWork(message: string): boolean {
  return /增长|增長|growth|渠道|分发|分發|受众|受眾|实验|實驗|小红书|小紅書|xiaohongshu|\bxhs\b/.test(message.toLowerCase());
}

function skillOutputQualityContracts(skill: HermesSkillInfo): string[] {
  if (skill.name === "baoyu-infographic") {
    return [
      "",
      "Baoyu infographic execution contract:",
      "- For Xiaohongshu/social visual work, call `skill_view(\"baoyu-infographic\")` when available and execute that skill workflow before producing the final answer.",
      "- Reuse an existing visual asset when the user references a previous/current image. Do not create a replacement image unless the user explicitly asks for a new visual.",
      "- Do not invent an image path or describe an image as completed unless the tool/skill produced or reused a concrete image artifact."
    ];
  }
  if (skill.name !== "xiaohongshu-skill") return [];
  return [
    "",
    "Xiaohongshu output quality contract:",
    "- When producing Xiaohongshu copy, note drafts, rewrites, calendars, daily ops, reply suggestions, or publish-ready bodies, write in Xiaohongshu-native plain text.",
    "- Xiaohongshu titles must be 20 characters or fewer, counting punctuation and symbols. Do not output a publish-ready title over 20 characters.",
    "- Separate logical paragraphs or sections with at most one blank line. Xiaohongshu does not support larger vertical gaps, so never emit two or more consecutive blank lines.",
    "- Keep visual groups to 2-3 non-empty lines; avoid dense blocks unless the user explicitly asks for a compact list.",
    "- Use emoji or visible symbols as section openers or bullets, such as `🌿 1｜...`, `✅ ...`, `📌 ...`, `• ...`, or `——` dividers. Do not output bare Markdown bullets for publish-ready body copy.",
    "- Avoid visible Markdown syntax in publish-ready Xiaohongshu bodies: no `**bold**`, `## headings`, Markdown tables, fenced code blocks, or link markup.",
    "- This formatting contract applies to user-facing Xiaohongshu content, not to engineering status reports or tool logs."
  ];
}
