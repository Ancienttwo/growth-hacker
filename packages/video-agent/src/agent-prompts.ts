import type {
  PreproductionSnapshot,
  PreproductionStage,
  SceneSpec,
  ShotSpec,
} from "./types";
import { isAgentStage } from "./stage-output";

const MAX_SOURCE_PROMPT_CHARS = 120_000;

export interface BuildStagePromptOptions {
  validationErrors?: string[];
  previousRawOutput?: string;
}

export function buildVideoAgentInstructions(stage: PreproductionStage): string {
  if (!isAgentStage(stage)) throw new Error(`deterministic_stage:${stage}`);
  return [
    "You are the Growth Hacker Video Production Agent.",
    "You are working inside a deterministic, durable preproduction workflow.",
    "Your task is creative analysis, but your output is a machine contract.",
    "Do not call tools, create files, browse, publish, render video, or perform account actions.",
    "Use only the supplied project context. Do not invent external facts or references.",
    "Return exactly one JSON object. Do not use Markdown fences or prose outside JSON.",
    "Use stable IDs. Preserve IDs supplied by earlier stages.",
    "Every visual statement must be executable: describe visible subject, action, space, camera, light, and continuity rather than abstract mood alone.",
    "Do not omit difficult requirements. Put uncertainty in warnings.",
    `Current stage: ${stage}`,
  ].join("\n");
}

export function buildVideoAgentStagePrompt(
  stage: PreproductionStage,
  snapshot: PreproductionSnapshot,
  options: BuildStagePromptOptions = {},
): string {
  if (!isAgentStage(stage)) throw new Error(`deterministic_stage:${stage}`);
  const contract = stageContract(stage);
  const context = stageContext(stage, snapshot);
  const repair = options.validationErrors?.length
    ? [
        "A previous response failed validation.",
        "Correct every listed error while preserving valid IDs and intent.",
        `Validation errors:\n${options.validationErrors.map((item) => `- ${item}`).join("\n")}`,
        options.previousRawOutput ? `Previous invalid response:\n${truncate(options.previousRawOutput, 40_000)}` : "",
      ].filter(Boolean).join("\n\n")
    : "";

  return [
    `Complete the '${stage}' stage for this video project.`,
    repair,
    "PROJECT CONTEXT (JSON):",
    stableJson(context),
    "OUTPUT CONTRACT:",
    contract,
    "Global output envelope:",
    stableJson({ schemaVersion: "1", stage, data: "<stage data object or array>", warnings: [] }),
    "Return only the JSON object now.",
  ].filter(Boolean).join("\n\n");
}

function stageContext(stage: Exclude<PreproductionStage, "prompt_compilation" | "storyboard_document" | "preproduction_approval">, snapshot: PreproductionSnapshot): Record<string, unknown> {
  const project = {
    id: snapshot.project.id,
    title: snapshot.project.title,
    revision: snapshot.revision.revision,
    brief: snapshot.project.brief,
    source: {
      ...snapshot.project.source,
      text: truncate(snapshot.project.source.text, MAX_SOURCE_PROMPT_CHARS),
    },
  };
  switch (stage) {
    case "story_analysis":
      return { project };
    case "story_bible":
      return { project, storyAnalysis: requireValue(snapshot.analysis, "story_analysis") };
    case "scene_breakdown":
      return {
        project,
        storyAnalysis: requireValue(snapshot.analysis, "story_analysis"),
        storyBible: requireValue(snapshot.bible, "story_bible"),
      };
    case "shot_planning":
      return {
        project: { ...project, source: { ...project.source, text: truncate(project.source.text, 80_000) } },
        storyAnalysis: requireValue(snapshot.analysis, "story_analysis"),
        storyBible: requireValue(snapshot.bible, "story_bible"),
        scenes: requireValue(snapshot.scenes, "scene_breakdown"),
      };
    case "continuity_review":
      return {
        project: { ...project, source: { ...project.source, text: "[omitted; review structured production data]" } },
        storyBible: requireValue(snapshot.bible, "story_bible"),
        scenes: requireValue(snapshot.scenes, "scene_breakdown"),
        shots: requireValue(snapshot.shots, "shot_planning"),
      };
    default:
      return assertNever(stage);
  }
}

function stageContract(stage: Exclude<PreproductionStage, "prompt_compilation" | "storyboard_document" | "preproduction_approval">): string {
  switch (stage) {
    case "story_analysis":
      return `data must contain:
{
  "logline": "one concise sentence",
  "premise": "dramatic premise",
  "genres": ["..."],
  "themes": ["..."],
  "audiencePromise": "what the audience experiences",
  "pointOfView": "narrative POV",
  "structure": [{
    "id": "BEAT-001",
    "label": "...",
    "summary": "...",
    "emotionalValue": "...",
    "importance": "required|supporting|optional"
  }],
  "characterGoals": [{
    "characterId": "CHAR-001",
    "name": "...",
    "goal": "...",
    "obstacle": "...",
    "change": "..."
  }],
  "emotionalArc": ["..."],
  "compressionPlan": {
    "strategy": "...",
    "preserve": ["..."],
    "compress": ["..."],
    "omit": ["..."]
  },
  "risks": ["..."]
}
Rules: identify every narratively necessary beat; fit the target duration; use stable BEAT/CHAR IDs.`;
    case "story_bible":
      return `data must contain:
{
  "worldRules": ["..."],
  "visualBible": {
    "styleStatement": "...",
    "palette": ["..."],
    "lighting": ["..."],
    "texture": ["..."],
    "compositionRules": ["..."],
    "cameraRules": ["..."],
    "forbiddenElements": ["..."]
  },
  "characters": [{
    "id": "CHAR-001",
    "name": "...",
    "role": "...",
    "agePresentation": "...",
    "appearance": "precise repeatable visible traits",
    "wardrobe": "precise repeatable wardrobe",
    "behavior": "physical behavior",
    "voice": "...",
    "continuityAnchors": ["..."],
    "negativeConstraints": ["..."],
    "referenceIds": []
  }],
  "locations": [{
    "id": "LOC-001",
    "name": "...",
    "description": "...",
    "geography": "spatial layout",
    "palette": ["..."],
    "lightingRules": ["..."],
    "continuityAnchors": ["..."],
    "referenceIds": []
  }],
  "props": [{
    "id": "PROP-001",
    "name": "...",
    "description": "...",
    "ownerCharacterId": "CHAR-001",
    "continuityAnchors": ["..."],
    "referenceIds": []
  }]
}
Rules: reuse character IDs from story analysis; every anchor must be visually checkable.`;
    case "scene_breakdown":
      return `data must be {"scenes": SceneSpec[]} where every SceneSpec contains:
{
  "id": "SCENE-001",
  "order": 1,
  "slugline": "INT./EXT. LOCATION - TIME",
  "summary": "visible events",
  "purpose": "narrative purpose",
  "storyBeatIds": ["BEAT-001"],
  "locationId": "LOC-001",
  "timeOfDay": "...",
  "characters": ["CHAR-001"],
  "props": ["PROP-001"],
  "emotionalBeat": "...",
  "estimatedDurationSec": 8,
  "continuityIn": {
    "characterStates": {"CHAR-001": "..."},
    "propStates": {"PROP-001": "..."},
    "environmentState": "...",
    "screenDirection": "..."
  },
  "continuityOut": {"characterStates": {}, "propStates": {}, "environmentState": "...", "screenDirection": "..."}
}
Rules: scene duration sum should fit target; reference only declared IDs; every required beat must appear.`;
    case "shot_planning":
      return `data must be {"shots": ShotSpec[]} where every ShotSpec contains:
{
  "id": "SHOT-001",
  "sceneId": "SCENE-001",
  "order": 1,
  "narrativePurpose": "...",
  "storyBeat": "...",
  "durationSec": 4,
  "shotSize": "...",
  "cameraAngle": "...",
  "lens": "...",
  "composition": "...",
  "cameraMovement": "...",
  "blocking": "who is where and how they move",
  "visibleAction": "one executable visible action",
  "locationId": "LOC-001",
  "timeOfDay": "...",
  "weather": "...",
  "atmosphere": "...",
  "lighting": "...",
  "palette": ["..."],
  "texture": "...",
  "characterIds": ["CHAR-001"],
  "wardrobe": ["..."],
  "propIds": ["PROP-001"],
  "referenceIds": [],
  "audio": {"dialogue": "...", "voiceOver": "...", "soundEffects": ["..."], "music": "..."},
  "startFrame": "observable state at first frame",
  "endFrame": "observable state at last frame",
  "continuityDependencies": ["..."],
  "negativeConstraints": ["..."],
  "editIntent": "...",
  "transitionOut": "...",
  "qcCriteria": ["observable acceptance criteria"]
}
Rules: at least one shot per scene; use cinematic variety only when motivated; avoid impossible compound actions; durations must fit target.`;
    case "continuity_review":
      return `data must contain:
{
  "verdict": "pass|pass_with_warnings|fail",
  "summary": "...",
  "issues": [{
    "id": "CONT-001",
    "severity": "error|warning|note",
    "scope": "project|scene|shot",
    "sceneId": "SCENE-001",
    "shotId": "SHOT-001",
    "field": "wardrobe",
    "message": "specific inconsistency",
    "suggestedFix": "specific fix"
  }],
  "checkedRules": ["character appearance", "wardrobe", "props", "location geography", "time/weather", "screen direction", "start/end frame", "duration", "ID references"]
}
Rules: do not rewrite shots; report precise defects and fixes; verdict is fail when any error remains.`;
    default:
      return assertNever(stage);
  }
}

export function selectShotsForScene(shots: ShotSpec[], scene: SceneSpec): ShotSpec[] {
  return shots.filter((shot) => shot.sceneId === scene.id).sort((a, b) => a.order - b.order);
}

function requireValue<T>(value: T | undefined, dependency: string): T {
  if (value === undefined) throw new Error(`missing_stage_dependency:${dependency}`);
  return value;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n[truncated ${value.length - max} chars]`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, sortKeys(item)]));
}

function assertNever(value: never): never {
  throw new Error(`unsupported_stage:${String(value)}`);
}
