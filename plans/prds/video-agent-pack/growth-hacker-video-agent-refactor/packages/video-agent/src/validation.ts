import { createHash } from "node:crypto";
import { VideoAgentError } from "./errors";
import type {
  AspectRatio,
  ContinuityIssue,
  ContinuityReport,
  ContinuityState,
  CreateVideoProjectInput,
  ProductionBrief,
  ProductionReference,
  ReviseVideoProjectInput,
  SceneSpec,
  ShotAudio,
  ShotSpec,
  StoryAnalysis,
  StoryBeat,
  StoryBible,
  StorySource,
} from "./types";

const MAX_SOURCE_CHARS = 120_000;
const MAX_TITLE_CHARS = 160;
const MAX_LIST_ITEMS = 200;

export function parseCreateVideoProjectInput(value: unknown): CreateVideoProjectInput {
  const record = asRecord(value, "project");
  return {
    title: requiredString(record.title, "title", MAX_TITLE_CHARS),
    source: parseStorySource(record.source),
    brief: parseProductionBrief(record.brief),
    agentId: optionalIdentifier(record.agentId, "agentId"),
  };
}

export function parseReviseVideoProjectInput(value: unknown): ReviseVideoProjectInput {
  const record = asRecord(value, "revision");
  const expectedRevision = requiredInteger(record.expectedRevision, "expectedRevision", 1, Number.MAX_SAFE_INTEGER);
  const output: ReviseVideoProjectInput = { expectedRevision };
  if (record.title !== undefined) output.title = requiredString(record.title, "title", MAX_TITLE_CHARS);
  if (record.source !== undefined) output.source = parseStorySource(record.source);
  if (record.brief !== undefined) output.brief = parseProductionBrief(record.brief);
  if (record.reason !== undefined) output.reason = optionalString(record.reason, "reason", 1_000);
  return output;
}

export function parseStorySource(value: unknown): StorySource {
  const record = asRecord(value, "source");
  const kind = enumValue(
    record.kind,
    "source.kind",
    ["story", "outline", "screenplay", "voiceover", "article", "unknown"] as const,
    "unknown",
  );
  const text = requiredString(record.text, "source.text", MAX_SOURCE_CHARS);
  return {
    kind,
    text,
    language: optionalString(record.language, "source.language", 40) ?? "zh-CN",
    sourceName: optionalString(record.sourceName, "source.sourceName", 240),
    checksum: sha256Text(text),
  };
}

export function parseProductionBrief(value: unknown): ProductionBrief {
  const record = asRecord(value, "brief");
  return {
    targetAudience: requiredString(record.targetAudience, "brief.targetAudience", 500),
    intendedUse: requiredString(record.intendedUse, "brief.intendedUse", 300),
    aspectRatio: enumValue(record.aspectRatio, "brief.aspectRatio", ["16:9", "9:16", "1:1", "4:3"] as const, "16:9"),
    targetDurationSec: requiredNumber(record.targetDurationSec, "brief.targetDurationSec", 3, 14_400),
    language: optionalString(record.language, "brief.language", 40) ?? "zh-CN",
    narrativeFormat: requiredString(record.narrativeFormat, "brief.narrativeFormat", 160),
    visualStyle: requiredString(record.visualStyle, "brief.visualStyle", 2_000),
    pace: enumValue(record.pace, "brief.pace", ["slow", "measured", "dynamic", "fast"] as const, "measured"),
    contentRating: optionalString(record.contentRating, "brief.contentRating", 100),
    mustKeep: stringArray(record.mustKeep, "brief.mustKeep", 500),
    avoid: stringArray(record.avoid, "brief.avoid", 500),
    references: arrayValue(record.references, "brief.references").slice(0, MAX_LIST_ITEMS).map(parseReference),
    providerPreference: optionalIdentifier(record.providerPreference, "brief.providerPreference"),
  };
}

function parseReference(value: unknown, index: number): ProductionReference {
  const record = asRecord(value, `brief.references[${index}]`);
  return {
    id: optionalIdentifier(record.id, `brief.references[${index}].id`) ?? `REF-${String(index + 1).padStart(3, "0")}`,
    label: requiredString(record.label, `brief.references[${index}].label`, 240),
    uri: optionalString(record.uri, `brief.references[${index}].uri`, 2_000),
    notes: optionalString(record.notes, `brief.references[${index}].notes`, 2_000),
  };
}

export function parseStoryAnalysis(value: unknown): StoryAnalysis {
  const record = asRecord(value, "story_analysis");
  const compression = asRecord(record.compressionPlan, "story_analysis.compressionPlan");
  return {
    logline: requiredString(record.logline, "story_analysis.logline", 1_000),
    premise: requiredString(record.premise, "story_analysis.premise", 2_000),
    genres: nonEmptyStringArray(record.genres, "story_analysis.genres", 120),
    themes: nonEmptyStringArray(record.themes, "story_analysis.themes", 300),
    audiencePromise: requiredString(record.audiencePromise, "story_analysis.audiencePromise", 1_000),
    pointOfView: requiredString(record.pointOfView, "story_analysis.pointOfView", 500),
    structure: arrayValue(record.structure, "story_analysis.structure").map(parseStoryBeat),
    characterGoals: arrayValue(record.characterGoals, "story_analysis.characterGoals").map((item, index) => {
      const entry = asRecord(item, `story_analysis.characterGoals[${index}]`);
      return {
        characterId: requiredIdentifier(entry.characterId, `story_analysis.characterGoals[${index}].characterId`),
        name: requiredString(entry.name, `story_analysis.characterGoals[${index}].name`, 160),
        goal: requiredString(entry.goal, `story_analysis.characterGoals[${index}].goal`, 1_000),
        obstacle: requiredString(entry.obstacle, `story_analysis.characterGoals[${index}].obstacle`, 1_000),
        change: requiredString(entry.change, `story_analysis.characterGoals[${index}].change`, 1_000),
      };
    }),
    emotionalArc: nonEmptyStringArray(record.emotionalArc, "story_analysis.emotionalArc", 500),
    compressionPlan: {
      strategy: requiredString(compression.strategy, "story_analysis.compressionPlan.strategy", 2_000),
      preserve: stringArray(compression.preserve, "story_analysis.compressionPlan.preserve", 500),
      compress: stringArray(compression.compress, "story_analysis.compressionPlan.compress", 500),
      omit: stringArray(compression.omit, "story_analysis.compressionPlan.omit", 500),
    },
    risks: stringArray(record.risks, "story_analysis.risks", 1_000),
  };
}

function parseStoryBeat(value: unknown, index: number): StoryBeat {
  const record = asRecord(value, `story_analysis.structure[${index}]`);
  return {
    id: requiredIdentifier(record.id, `story_analysis.structure[${index}].id`),
    label: requiredString(record.label, `story_analysis.structure[${index}].label`, 160),
    summary: requiredString(record.summary, `story_analysis.structure[${index}].summary`, 2_000),
    emotionalValue: requiredString(record.emotionalValue, `story_analysis.structure[${index}].emotionalValue`, 500),
    importance: enumValue(
      record.importance,
      `story_analysis.structure[${index}].importance`,
      ["required", "supporting", "optional"] as const,
      "supporting",
    ),
  };
}

export function parseStoryBible(value: unknown): StoryBible {
  const record = asRecord(value, "story_bible");
  const visual = asRecord(record.visualBible, "story_bible.visualBible");
  return {
    worldRules: nonEmptyStringArray(record.worldRules, "story_bible.worldRules", 1_000),
    visualBible: {
      styleStatement: requiredString(visual.styleStatement, "story_bible.visualBible.styleStatement", 3_000),
      palette: nonEmptyStringArray(visual.palette, "story_bible.visualBible.palette", 200),
      lighting: nonEmptyStringArray(visual.lighting, "story_bible.visualBible.lighting", 500),
      texture: stringArray(visual.texture, "story_bible.visualBible.texture", 300),
      compositionRules: nonEmptyStringArray(visual.compositionRules, "story_bible.visualBible.compositionRules", 500),
      cameraRules: nonEmptyStringArray(visual.cameraRules, "story_bible.visualBible.cameraRules", 500),
      forbiddenElements: stringArray(visual.forbiddenElements, "story_bible.visualBible.forbiddenElements", 500),
    },
    characters: arrayValue(record.characters, "story_bible.characters").map((item, index) => {
      const entry = asRecord(item, `story_bible.characters[${index}]`);
      return {
        id: requiredIdentifier(entry.id, `story_bible.characters[${index}].id`),
        name: requiredString(entry.name, `story_bible.characters[${index}].name`, 160),
        role: requiredString(entry.role, `story_bible.characters[${index}].role`, 300),
        agePresentation: optionalString(entry.agePresentation, `story_bible.characters[${index}].agePresentation`, 120),
        appearance: requiredString(entry.appearance, `story_bible.characters[${index}].appearance`, 2_000),
        wardrobe: requiredString(entry.wardrobe, `story_bible.characters[${index}].wardrobe`, 2_000),
        behavior: requiredString(entry.behavior, `story_bible.characters[${index}].behavior`, 2_000),
        voice: optionalString(entry.voice, `story_bible.characters[${index}].voice`, 1_000),
        continuityAnchors: nonEmptyStringArray(entry.continuityAnchors, `story_bible.characters[${index}].continuityAnchors`, 500),
        negativeConstraints: stringArray(entry.negativeConstraints, `story_bible.characters[${index}].negativeConstraints`, 500),
        referenceIds: identifierArray(entry.referenceIds, `story_bible.characters[${index}].referenceIds`),
      };
    }),
    locations: arrayValue(record.locations, "story_bible.locations").map((item, index) => {
      const entry = asRecord(item, `story_bible.locations[${index}]`);
      return {
        id: requiredIdentifier(entry.id, `story_bible.locations[${index}].id`),
        name: requiredString(entry.name, `story_bible.locations[${index}].name`, 160),
        description: requiredString(entry.description, `story_bible.locations[${index}].description`, 2_000),
        geography: requiredString(entry.geography, `story_bible.locations[${index}].geography`, 1_000),
        palette: stringArray(entry.palette, `story_bible.locations[${index}].palette`, 200),
        lightingRules: nonEmptyStringArray(entry.lightingRules, `story_bible.locations[${index}].lightingRules`, 500),
        continuityAnchors: nonEmptyStringArray(entry.continuityAnchors, `story_bible.locations[${index}].continuityAnchors`, 500),
        referenceIds: identifierArray(entry.referenceIds, `story_bible.locations[${index}].referenceIds`),
      };
    }),
    props: arrayValue(record.props, "story_bible.props").map((item, index) => {
      const entry = asRecord(item, `story_bible.props[${index}]`);
      return {
        id: requiredIdentifier(entry.id, `story_bible.props[${index}].id`),
        name: requiredString(entry.name, `story_bible.props[${index}].name`, 160),
        description: requiredString(entry.description, `story_bible.props[${index}].description`, 1_500),
        ownerCharacterId: optionalIdentifier(entry.ownerCharacterId, `story_bible.props[${index}].ownerCharacterId`),
        continuityAnchors: nonEmptyStringArray(entry.continuityAnchors, `story_bible.props[${index}].continuityAnchors`, 500),
        referenceIds: identifierArray(entry.referenceIds, `story_bible.props[${index}].referenceIds`),
      };
    }),
  };
}

export function parseSceneBreakdown(value: unknown): SceneSpec[] {
  const items = Array.isArray(value) ? value : asRecord(value, "scene_breakdown").scenes;
  const scenes = arrayValue(items, "scene_breakdown.scenes").map((item, index) => {
    const record = asRecord(item, `scene_breakdown.scenes[${index}]`);
    return {
      id: requiredIdentifier(record.id, `scene_breakdown.scenes[${index}].id`),
      order: requiredInteger(record.order, `scene_breakdown.scenes[${index}].order`, 1, 10_000),
      slugline: requiredString(record.slugline, `scene_breakdown.scenes[${index}].slugline`, 300),
      summary: requiredString(record.summary, `scene_breakdown.scenes[${index}].summary`, 2_000),
      purpose: requiredString(record.purpose, `scene_breakdown.scenes[${index}].purpose`, 1_000),
      storyBeatIds: identifierArray(record.storyBeatIds, `scene_breakdown.scenes[${index}].storyBeatIds`, true),
      locationId: optionalIdentifier(record.locationId, `scene_breakdown.scenes[${index}].locationId`),
      timeOfDay: optionalString(record.timeOfDay, `scene_breakdown.scenes[${index}].timeOfDay`, 160),
      characters: identifierArray(record.characters, `scene_breakdown.scenes[${index}].characters`),
      props: identifierArray(record.props, `scene_breakdown.scenes[${index}].props`),
      emotionalBeat: requiredString(record.emotionalBeat, `scene_breakdown.scenes[${index}].emotionalBeat`, 500),
      estimatedDurationSec: requiredNumber(record.estimatedDurationSec, `scene_breakdown.scenes[${index}].estimatedDurationSec`, 0.5, 3_600),
      continuityIn: parseContinuityState(record.continuityIn, `scene_breakdown.scenes[${index}].continuityIn`),
      continuityOut: parseContinuityState(record.continuityOut, `scene_breakdown.scenes[${index}].continuityOut`),
    } satisfies SceneSpec;
  });
  assertUnique(scenes.map((scene) => scene.id), "scene_id_duplicate");
  assertUnique(scenes.map((scene) => String(scene.order)), "scene_order_duplicate");
  return [...scenes].sort((a, b) => a.order - b.order);
}

export function parseShotPlan(value: unknown): ShotSpec[] {
  const items = Array.isArray(value) ? value : asRecord(value, "shot_planning").shots;
  const shots = arrayValue(items, "shot_planning.shots").map((item, index) => parseShot(item, index));
  assertUnique(shots.map((shot) => shot.id), "shot_id_duplicate");
  assertUnique(shots.map((shot) => `${shot.sceneId}:${shot.order}`), "shot_order_duplicate");
  return [...shots].sort((a, b) => a.sceneId.localeCompare(b.sceneId) || a.order - b.order);
}

function parseShot(value: unknown, index: number): ShotSpec {
  const path = `shot_planning.shots[${index}]`;
  const record = asRecord(value, path);
  return {
    id: requiredIdentifier(record.id, `${path}.id`),
    sceneId: requiredIdentifier(record.sceneId, `${path}.sceneId`),
    order: requiredInteger(record.order, `${path}.order`, 1, 10_000),
    narrativePurpose: requiredString(record.narrativePurpose, `${path}.narrativePurpose`, 1_000),
    storyBeat: requiredString(record.storyBeat, `${path}.storyBeat`, 1_000),
    durationSec: requiredNumber(record.durationSec, `${path}.durationSec`, 0.5, 120),
    shotSize: requiredString(record.shotSize, `${path}.shotSize`, 160),
    cameraAngle: requiredString(record.cameraAngle, `${path}.cameraAngle`, 160),
    lens: requiredString(record.lens, `${path}.lens`, 160),
    composition: requiredString(record.composition, `${path}.composition`, 1_000),
    cameraMovement: requiredString(record.cameraMovement, `${path}.cameraMovement`, 500),
    blocking: requiredString(record.blocking, `${path}.blocking`, 1_500),
    visibleAction: requiredString(record.visibleAction, `${path}.visibleAction`, 1_500),
    locationId: optionalIdentifier(record.locationId, `${path}.locationId`),
    timeOfDay: optionalString(record.timeOfDay, `${path}.timeOfDay`, 160),
    weather: optionalString(record.weather, `${path}.weather`, 300),
    atmosphere: requiredString(record.atmosphere, `${path}.atmosphere`, 1_000),
    lighting: requiredString(record.lighting, `${path}.lighting`, 1_000),
    palette: stringArray(record.palette, `${path}.palette`, 200),
    texture: requiredString(record.texture, `${path}.texture`, 500),
    characterIds: identifierArray(record.characterIds, `${path}.characterIds`),
    wardrobe: stringArray(record.wardrobe, `${path}.wardrobe`, 500),
    propIds: identifierArray(record.propIds, `${path}.propIds`),
    referenceIds: identifierArray(record.referenceIds, `${path}.referenceIds`),
    audio: parseShotAudio(record.audio, `${path}.audio`),
    startFrame: requiredString(record.startFrame, `${path}.startFrame`, 1_500),
    endFrame: requiredString(record.endFrame, `${path}.endFrame`, 1_500),
    continuityDependencies: stringArray(record.continuityDependencies, `${path}.continuityDependencies`, 800),
    negativeConstraints: stringArray(record.negativeConstraints, `${path}.negativeConstraints`, 500),
    editIntent: requiredString(record.editIntent, `${path}.editIntent`, 1_000),
    transitionOut: requiredString(record.transitionOut, `${path}.transitionOut`, 500),
    qcCriteria: nonEmptyStringArray(record.qcCriteria, `${path}.qcCriteria`, 500),
  };
}

function parseShotAudio(value: unknown, path: string): ShotAudio {
  const record = asRecord(value ?? {}, path);
  return {
    dialogue: optionalString(record.dialogue, `${path}.dialogue`, 3_000),
    voiceOver: optionalString(record.voiceOver, `${path}.voiceOver`, 3_000),
    soundEffects: stringArray(record.soundEffects, `${path}.soundEffects`, 500),
    music: optionalString(record.music, `${path}.music`, 1_000),
  };
}

export function parseContinuityReport(value: unknown): ContinuityReport {
  const record = asRecord(value, "continuity_review");
  const issues = arrayValue(record.issues, "continuity_review.issues").map((item, index): ContinuityIssue => {
    const entry = asRecord(item, `continuity_review.issues[${index}]`);
    return {
      id: requiredIdentifier(entry.id, `continuity_review.issues[${index}].id`),
      severity: enumValue(entry.severity, `continuity_review.issues[${index}].severity`, ["error", "warning", "note"] as const),
      scope: enumValue(entry.scope, `continuity_review.issues[${index}].scope`, ["project", "scene", "shot"] as const),
      sceneId: optionalIdentifier(entry.sceneId, `continuity_review.issues[${index}].sceneId`),
      shotId: optionalIdentifier(entry.shotId, `continuity_review.issues[${index}].shotId`),
      field: optionalString(entry.field, `continuity_review.issues[${index}].field`, 200),
      message: requiredString(entry.message, `continuity_review.issues[${index}].message`, 1_500),
      suggestedFix: requiredString(entry.suggestedFix, `continuity_review.issues[${index}].suggestedFix`, 1_500),
    };
  });
  return {
    verdict: enumValue(record.verdict, "continuity_review.verdict", ["pass", "pass_with_warnings", "fail"] as const),
    summary: requiredString(record.summary, "continuity_review.summary", 2_000),
    issues,
    checkedRules: nonEmptyStringArray(record.checkedRules, "continuity_review.checkedRules", 500),
  };
}

export function validateCrossReferences(input: {
  analysis: StoryAnalysis;
  bible: StoryBible;
  scenes: SceneSpec[];
  shots: ShotSpec[];
  targetDurationSec: number;
}): ContinuityIssue[] {
  const issues: ContinuityIssue[] = [];
  const beatIds = new Set(input.analysis.structure.map((item) => item.id));
  const characterIds = new Set(input.bible.characters.map((item) => item.id));
  const locationIds = new Set(input.bible.locations.map((item) => item.id));
  const propIds = new Set(input.bible.props.map((item) => item.id));
  const sceneIds = new Set(input.scenes.map((item) => item.id));
  const referenceIds = new Set(input.bible.characters.flatMap((item) => item.referenceIds)
    .concat(input.bible.locations.flatMap((item) => item.referenceIds), input.bible.props.flatMap((item) => item.referenceIds)));

  for (const scene of input.scenes) {
    for (const beatId of scene.storyBeatIds) pushUnknown(issues, beatIds, beatId, "scene", scene.id, undefined, "storyBeatIds", "story beat");
    for (const characterId of scene.characters) pushUnknown(issues, characterIds, characterId, "scene", scene.id, undefined, "characters", "character");
    for (const propId of scene.props) pushUnknown(issues, propIds, propId, "scene", scene.id, undefined, "props", "prop");
    if (scene.locationId) pushUnknown(issues, locationIds, scene.locationId, "scene", scene.id, undefined, "locationId", "location");
  }

  for (const shot of input.shots) {
    if (!sceneIds.has(shot.sceneId)) {
      issues.push(issue("error", "shot", shot.sceneId, shot.id, "sceneId", `Unknown scene '${shot.sceneId}'.`, "Assign the shot to an existing scene."));
    }
    for (const characterId of shot.characterIds) pushUnknown(issues, characterIds, characterId, "shot", shot.sceneId, shot.id, "characterIds", "character");
    for (const propId of shot.propIds) pushUnknown(issues, propIds, propId, "shot", shot.sceneId, shot.id, "propIds", "prop");
    if (shot.locationId) pushUnknown(issues, locationIds, shot.locationId, "shot", shot.sceneId, shot.id, "locationId", "location");
    for (const referenceId of shot.referenceIds) {
      if (!referenceIds.has(referenceId)) {
        issues.push(issue("warning", "shot", shot.sceneId, shot.id, "referenceIds", `Reference '${referenceId}' is not declared in the story bible.`, "Declare the reference or remove it."));
      }
    }
  }

  const total = input.shots.reduce((sum, shot) => sum + shot.durationSec, 0);
  const tolerance = Math.max(3, input.targetDurationSec * 0.12);
  if (Math.abs(total - input.targetDurationSec) > tolerance) {
    issues.push(issue(
      "warning",
      "project",
      undefined,
      undefined,
      "durationSec",
      `Shot duration total ${round(total)}s differs from target ${round(input.targetDurationSec)}s by more than ${round(tolerance)}s.`,
      "Adjust shot durations or explicitly revise the production brief target duration.",
    ));
  }

  for (const scene of input.scenes) {
    if (!input.shots.some((shot) => shot.sceneId === scene.id)) {
      issues.push(issue("error", "scene", scene.id, undefined, "shots", "Scene has no shots.", "Add at least one executable shot."));
    }
  }

  return issues;
}

function pushUnknown(
  issues: ContinuityIssue[],
  allowed: Set<string>,
  value: string,
  scope: "scene" | "shot",
  sceneId: string | undefined,
  shotId: string | undefined,
  field: string,
  label: string,
): void {
  if (allowed.has(value)) return;
  issues.push(issue("error", scope, sceneId, shotId, field, `Unknown ${label} '${value}'.`, `Use a ${label} ID declared in the story bible/analysis.`));
}

function issue(
  severity: ContinuityIssue["severity"],
  scope: ContinuityIssue["scope"],
  sceneId: string | undefined,
  shotId: string | undefined,
  field: string,
  message: string,
  suggestedFix: string,
): ContinuityIssue {
  return {
    id: `SYS-${String(Math.abs(hashCode(`${scope}:${sceneId}:${shotId}:${field}:${message}`))).padStart(8, "0").slice(0, 8)}`,
    severity,
    scope,
    sceneId,
    shotId,
    field,
    message,
    suggestedFix,
  };
}

function parseContinuityState(value: unknown, path: string): ContinuityState {
  const record = asRecord(value, path);
  return {
    characterStates: stringRecord(record.characterStates, `${path}.characterStates`),
    propStates: stringRecord(record.propStates, `${path}.propStates`),
    environmentState: requiredString(record.environmentState, `${path}.environmentState`, 1_000),
    screenDirection: optionalString(record.screenDirection, `${path}.screenDirection`, 500),
  };
}

function stringRecord(value: unknown, path: string): Record<string, string> {
  if (value === undefined || value === null) return {};
  const record = asRecord(value, path);
  const output: Record<string, string> = {};
  for (const [key, item] of Object.entries(record)) {
    const normalizedKey = requiredIdentifier(key, `${path}.key`);
    output[normalizedKey] = requiredString(item, `${path}.${key}`, 1_000);
  }
  return output;
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "must be an object");
  return value as Record<string, unknown>;
}

export function requiredString(value: unknown, path: string, maxLength = 10_000): string {
  if (typeof value !== "string") fail(path, "must be a string");
  const output = value.trim();
  if (!output) fail(path, "must not be empty");
  if (output.length > maxLength) fail(path, `must not exceed ${maxLength} characters`);
  return output;
}

export function optionalString(value: unknown, path: string, maxLength = 10_000): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredString(value, path, maxLength);
}

export function requiredIdentifier(value: unknown, path: string): string {
  const output = requiredString(value, path, 180);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(output)) fail(path, "must be a stable identifier");
  return output;
}

export function optionalIdentifier(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredIdentifier(value, path);
}

function requiredNumber(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    fail(path, `must be a finite number between ${min} and ${max}`);
  }
  return value;
}

function requiredInteger(value: unknown, path: string, min: number, max: number): number {
  const number = requiredNumber(value, path, min, max);
  if (!Number.isInteger(number)) fail(path, "must be an integer");
  return number;
}

function arrayValue(value: unknown, path: string): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(path, "must be an array");
  if (value.length > MAX_LIST_ITEMS) fail(path, `must have at most ${MAX_LIST_ITEMS} items`);
  return value;
}

function stringArray(value: unknown, path: string, itemMaxLength: number): string[] {
  return arrayValue(value, path).map((item, index) => requiredString(item, `${path}[${index}]`, itemMaxLength));
}

function nonEmptyStringArray(value: unknown, path: string, itemMaxLength: number): string[] {
  const output = stringArray(value, path, itemMaxLength);
  if (!output.length) fail(path, "must contain at least one item");
  return output;
}

function identifierArray(value: unknown, path: string, requireOne = false): string[] {
  const output = arrayValue(value, path).map((item, index) => requiredIdentifier(item, `${path}[${index}]`));
  if (requireOne && !output.length) fail(path, "must contain at least one identifier");
  return output;
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  path: string,
  allowed: T,
  fallback?: T[number],
): T[number] {
  if ((value === undefined || value === null || value === "") && fallback !== undefined) return fallback;
  if (typeof value === "string" && allowed.includes(value)) return value as T[number];
  fail(path, `must be one of: ${allowed.join(", ")}`);
}

function assertUnique(values: string[], code: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) fail(code, `duplicate value '${value}'`);
    seen.add(value);
  }
}

function fail(path: string, message: string): never {
  throw new VideoAgentError("invalid_input", `${path} ${message}`, {
    retryable: false,
    details: { path, message },
  });
}

function hashCode(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash << 5) - hash + value.charCodeAt(index) | 0;
  return hash;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function normalizeAspectRatio(value: unknown): AspectRatio {
  return enumValue(value, "aspectRatio", ["16:9", "9:16", "1:1", "4:3"] as const, "16:9");
}
