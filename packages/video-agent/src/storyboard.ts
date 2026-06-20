import type {
  ContinuityReport,
  PromptSpec,
  ProviderPrompt,
  SceneSpec,
  ShotSpec,
  StoryBible,
  VideoProject,
} from "./types";

export function renderStoryboardMarkdown(input: {
  project: VideoProject;
  revision: number;
  bible: StoryBible;
  scenes: SceneSpec[];
  shots: ShotSpec[];
  continuity: ContinuityReport;
  prompts: PromptSpec[];
  providerPrompts: ProviderPrompt[];
  generatedAt?: number;
}): string {
  const shotByScene = groupShots(input.shots);
  const promptByShot = new Map(input.prompts.map((item) => [item.shotId, item]));
  const providerByShot = new Map(input.providerPrompts.map((item) => [item.shotId, item]));
  const issuesByShot = groupIssues(input.continuity);
  const lines: string[] = [
    `# Storyboard — ${input.project.title}`,
    "",
    `- Project: \`${input.project.id}\``,
    `- Revision: ${input.revision}`,
    `- Aspect ratio: ${input.project.brief.aspectRatio}`,
    `- Target duration: ${input.project.brief.targetDurationSec}s`,
    `- Visual style: ${input.project.brief.visualStyle}`,
    `- Generated: ${new Date(input.generatedAt ?? Date.now()).toISOString()}`,
    `- Continuity verdict: **${input.continuity.verdict}**`,
    "",
    "## Visual Bible",
    "",
    input.bible.visualBible.styleStatement,
    "",
    `**Palette:** ${input.bible.visualBible.palette.join(", ")}`,
    "",
    `**Lighting:** ${input.bible.visualBible.lighting.join("; ")}`,
    "",
    `**Forbidden:** ${input.bible.visualBible.forbiddenElements.join("; ") || "None declared"}`,
    "",
  ];

  for (const scene of [...input.scenes].sort((a, b) => a.order - b.order)) {
    lines.push(
      `## ${scene.id} — ${scene.slugline}`,
      "",
      scene.summary,
      "",
      `**Purpose:** ${scene.purpose}`,
      "",
      `**Characters:** ${scene.characters.join(", ") || "—"}  `,
      `**Props:** ${scene.props.join(", ") || "—"}  `,
      `**Estimated duration:** ${scene.estimatedDurationSec}s`,
      "",
    );
    for (const shot of shotByScene.get(scene.id) ?? []) {
      const canonical = promptByShot.get(shot.id);
      const provider = providerByShot.get(shot.id);
      lines.push(
        `### ${shot.id} · ${shot.durationSec}s · ${shot.shotSize}`,
        "",
        "| Field | Production direction |",
        "| --- | --- |",
        row("Narrative purpose", shot.narrativePurpose),
        row("Visible action", shot.visibleAction),
        row("Camera", `${shot.cameraAngle}; ${shot.lens}; ${shot.cameraMovement}`),
        row("Composition", shot.composition),
        row("Blocking", shot.blocking),
        row("Lighting / palette", `${shot.lighting}; ${shot.palette.join(", ")}`),
        row("First frame", shot.startFrame),
        row("Last frame", shot.endFrame),
        row("Edit / transition", `${shot.editIntent}; ${shot.transitionOut}`),
        row("Dialogue / VO", [shot.audio.dialogue, shot.audio.voiceOver].filter(Boolean).join(" / ") || "—"),
        row("SFX / music", [...shot.audio.soundEffects, shot.audio.music].filter(Boolean).join("; ") || "—"),
        "",
        "**Continuity dependencies**",
        "",
        bullets(shot.continuityDependencies),
        "",
        "**QC criteria**",
        "",
        bullets(shot.qcCriteria),
        "",
      );
      const issues = issuesByShot.get(shot.id) ?? [];
      if (issues.length) {
        lines.push("**Continuity findings**", "", ...issues.map((issue) => `- **${issue.severity}** ${escapeMarkdown(issue.message)} — ${escapeMarkdown(issue.suggestedFix)}`), "");
      }
      if (canonical) {
        lines.push("**Canonical prompt**", "", codeBlock(JSON.stringify(canonical, null, 2), "json"), "");
      }
      if (provider) {
        lines.push("**Provider prompt**", "", codeBlock(provider.prompt, "text"), "");
        if (provider.negativePrompt) lines.push("**Negative prompt**", "", codeBlock(provider.negativePrompt, "text"), "");
        if (provider.warnings.length) lines.push("**Provider warnings**", "", bullets(provider.warnings), "");
      }
    }
  }

  lines.push(
    "## Continuity Report",
    "",
    input.continuity.summary,
    "",
    "| Severity | Scope | Target | Finding | Suggested fix |",
    "| --- | --- | --- | --- | --- |",
    ...input.continuity.issues.map((issue) => [
      issue.severity,
      issue.scope,
      issue.shotId ?? issue.sceneId ?? "project",
      issue.message,
      issue.suggestedFix,
    ].map(tableCell).join(" | ").replace(/^/, "| ").replace(/$/, " |")),
    "",
  );
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export function renderScenesCsv(scenes: SceneSpec[]): string {
  return csv([
    ["id", "order", "slugline", "summary", "purpose", "durationSec", "characters", "props", "locationId", "timeOfDay"],
    ...[...scenes].sort((a, b) => a.order - b.order).map((scene) => [
      scene.id,
      scene.order,
      scene.slugline,
      scene.summary,
      scene.purpose,
      scene.estimatedDurationSec,
      scene.characters.join(";"),
      scene.props.join(";"),
      scene.locationId ?? "",
      scene.timeOfDay ?? "",
    ]),
  ]);
}

export function renderShotsCsv(shots: ShotSpec[]): string {
  return csv([
    ["id", "sceneId", "order", "durationSec", "shotSize", "cameraAngle", "lens", "cameraMovement", "visibleAction", "startFrame", "endFrame", "characterIds", "propIds"],
    ...shots.map((shot) => [
      shot.id,
      shot.sceneId,
      shot.order,
      shot.durationSec,
      shot.shotSize,
      shot.cameraAngle,
      shot.lens,
      shot.cameraMovement,
      shot.visibleAction,
      shot.startFrame,
      shot.endFrame,
      shot.characterIds.join(";"),
      shot.propIds.join(";"),
    ]),
  ]);
}

function groupShots(shots: ShotSpec[]): Map<string, ShotSpec[]> {
  const output = new Map<string, ShotSpec[]>();
  for (const shot of shots) {
    const list = output.get(shot.sceneId) ?? [];
    list.push(shot);
    output.set(shot.sceneId, list);
  }
  for (const list of output.values()) list.sort((a, b) => a.order - b.order);
  return output;
}

function groupIssues(report: ContinuityReport): Map<string, ContinuityReport["issues"]> {
  const output = new Map<string, ContinuityReport["issues"]>();
  for (const issue of report.issues) {
    if (!issue.shotId) continue;
    const list = output.get(issue.shotId) ?? [];
    list.push(issue);
    output.set(issue.shotId, list);
  }
  return output;
}

function row(label: string, value: string): string {
  return `| ${tableCell(label)} | ${tableCell(value)} |`;
}

function tableCell(value: unknown): string {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function bullets(values: string[]): string {
  return values.length ? values.map((value) => `- ${escapeMarkdown(value)}`).join("\n") : "- —";
}

function escapeMarkdown(value: string): string {
  return value.replace(/([*_`])/g, "\\$1");
}

function codeBlock(value: string, language: string): string {
  const fence = value.includes("```") ? "````" : "```";
  return `${fence}${language}\n${value}\n${fence}`;
}

function csv(rows: Array<Array<string | number>>): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
