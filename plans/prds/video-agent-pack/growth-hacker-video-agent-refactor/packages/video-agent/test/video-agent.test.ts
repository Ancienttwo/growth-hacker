import { describe, expect, test } from "bun:test";
import {
  HERMES_VIDEO_CAPABILITIES,
  assertRunTransition,
  compileCanonicalPromptSpecs,
  compileProviderPrompts,
  parseAgentStageOutput,
  parseCreateVideoProjectInput,
  renderStoryboardMarkdown,
  validateCrossReferences,
} from "../src";
import type {
  ContinuityReport,
  SceneSpec,
  ShotSpec,
  StoryAnalysis,
  StoryBible,
  VideoProject,
} from "../src";

const input = {
  title: "Rain Station",
  source: { kind: "story", text: "A traveler returns a lost red umbrella at a deserted station.", language: "en" },
  brief: {
    targetAudience: "general audience",
    intendedUse: "short film",
    aspectRatio: "16:9",
    targetDurationSec: 8,
    language: "en",
    narrativeFormat: "cinematic short",
    visualStyle: "restrained live-action realism",
    pace: "measured",
    mustKeep: ["red umbrella"],
    avoid: ["logos"],
    references: [],
  },
};

const analysis: StoryAnalysis = {
  logline: "A traveler returns a lost red umbrella.",
  premise: "A quiet act of care resolves an absence.",
  genres: ["drama"],
  themes: ["kindness"],
  audiencePromise: "A precise emotional reveal.",
  pointOfView: "traveler",
  structure: [{ id: "BEAT-001", label: "Return", summary: "The umbrella is returned.", emotionalValue: "relief", importance: "required" }],
  characterGoals: [{ characterId: "CHAR-001", name: "Traveler", goal: "return the umbrella", obstacle: "empty station", change: "accepts no recognition" }],
  emotionalArc: ["uncertainty", "relief"],
  compressionPlan: { strategy: "single action", preserve: ["return"], compress: [], omit: [] },
  risks: [],
};

const bible: StoryBible = {
  worldRules: ["contemporary reality"],
  visualBible: {
    styleStatement: "restrained live-action realism",
    palette: ["slate", "red"],
    lighting: ["soft overcast daylight"],
    texture: ["wet concrete"],
    compositionRules: ["clean negative space"],
    cameraRules: ["motivated movement only"],
    forbiddenElements: ["logos"],
  },
  characters: [{
    id: "CHAR-001",
    name: "Traveler",
    role: "protagonist",
    appearance: "short dark hair, tired eyes",
    wardrobe: "charcoal raincoat",
    behavior: "deliberate economical movement",
    continuityAnchors: ["charcoal raincoat remains wet"],
    negativeConstraints: ["no hat"],
    referenceIds: [],
  }],
  locations: [{
    id: "LOC-001",
    name: "Station platform",
    description: "an empty concrete railway platform",
    geography: "bench left, track right",
    palette: ["slate"],
    lightingRules: ["overcast daylight"],
    continuityAnchors: ["bench remains on screen left"],
    referenceIds: [],
  }],
  props: [{
    id: "PROP-001",
    name: "Red umbrella",
    description: "small saturated red umbrella",
    ownerCharacterId: "CHAR-001",
    continuityAnchors: ["closed before it is placed on the bench"],
    referenceIds: [],
  }],
};

const scenes: SceneSpec[] = [{
  id: "SCENE-001",
  order: 1,
  slugline: "EXT. STATION PLATFORM - DAY",
  summary: "The traveler places the umbrella on the bench.",
  purpose: "resolve the return",
  storyBeatIds: ["BEAT-001"],
  locationId: "LOC-001",
  timeOfDay: "day",
  characters: ["CHAR-001"],
  props: ["PROP-001"],
  emotionalBeat: "relief",
  estimatedDurationSec: 8,
  continuityIn: { characterStates: { "CHAR-001": "standing" }, propStates: { "PROP-001": "held closed" }, environmentState: "rain easing" },
  continuityOut: { characterStates: { "CHAR-001": "walking away" }, propStates: { "PROP-001": "on bench" }, environmentState: "rain easing" },
}];

const shots: ShotSpec[] = [{
  id: "SHOT-001",
  sceneId: "SCENE-001",
  order: 1,
  narrativePurpose: "show the return",
  storyBeat: "return",
  durationSec: 8,
  shotSize: "medium wide",
  cameraAngle: "eye level",
  lens: "35mm",
  composition: "bench on left third, track on right",
  cameraMovement: "slow lateral track",
  blocking: "traveler enters right and stops beside bench",
  visibleAction: "the traveler places the closed red umbrella on the bench and walks away",
  locationId: "LOC-001",
  timeOfDay: "day",
  weather: "light rain",
  atmosphere: "quiet after rain",
  lighting: "soft overcast daylight",
  palette: ["slate", "red"],
  texture: "wet concrete",
  characterIds: ["CHAR-001"],
  wardrobe: ["charcoal raincoat"],
  propIds: ["PROP-001"],
  referenceIds: [],
  audio: { soundEffects: ["distant rail hum", "soft rain"] },
  startFrame: "traveler enters holding a closed red umbrella",
  endFrame: "umbrella rests on bench as traveler exits frame",
  continuityDependencies: ["bench stays screen left"],
  negativeConstraints: ["no other passengers"],
  editIntent: "hold for emotional resolution",
  transitionOut: "cut on empty frame",
  qcCriteria: ["umbrella remains closed", "bench remains screen left"],
}];

const report: ContinuityReport = { verdict: "pass", summary: "No blocking issues.", issues: [], checkedRules: ["IDs", "props", "screen direction"] };

function project(): VideoProject {
  const parsed = parseCreateVideoProjectInput(input);
  return { id: "prj_test", status: "in_preproduction", currentRevision: 1, createdAt: 1, updatedAt: 1, ...parsed };
}

describe("video agent domain", () => {
  test("normalizes project input and computes source checksum", () => {
    const parsed = parseCreateVideoProjectInput(input);
    expect(parsed.brief.aspectRatio).toBe("16:9");
    expect(parsed.source.checksum).toHaveLength(64);
  });

  test("rejects source text that would be silently truncated in an Agent prompt", () => {
    expect(() => parseCreateVideoProjectInput({
      ...input,
      source: { ...input.source, text: "x".repeat(120_001) },
    })).toThrow();
  });

  test("parses a strict stage envelope", () => {
    const output = parseAgentStageOutput("story_analysis", JSON.stringify({ schemaVersion: "1", stage: "story_analysis", data: analysis, warnings: [] }));
    expect(output.stage).toBe("story_analysis");
    expect(output.data).toEqual(analysis);
  });

  test("rejects a stage mismatch", () => {
    expect(() => parseAgentStageOutput("story_analysis", JSON.stringify({ schemaVersion: "1", stage: "story_bible", data: {}, warnings: [] }))).toThrow();
  });

  test("detects unknown cross references", () => {
    const invalid = [{ ...shots[0], characterIds: ["CHAR-404"] }];
    const issues = validateCrossReferences({ analysis, bible, scenes, shots: invalid, targetDurationSec: 8 });
    expect(issues.some((issue) => issue.severity === "error" && issue.field === "characterIds")).toBe(true);
  });

  test("compiles deterministic canonical and provider prompts", () => {
    const first = compileCanonicalPromptSpecs({ project: project(), bible, scenes, shots });
    const second = compileCanonicalPromptSpecs({ project: project(), bible, scenes, shots });
    expect(first).toEqual(second);
    const provider = compileProviderPrompts(first, HERMES_VIDEO_CAPABILITIES);
    expect(provider[0].prompt).toContain("VISIBLE ACTION");
    expect(provider[0].negativePrompt).toContain("logos");
  });

  test("renders a complete storyboard document", () => {
    const prompts = compileCanonicalPromptSpecs({ project: project(), bible, scenes, shots });
    const providerPrompts = compileProviderPrompts(prompts);
    const markdown = renderStoryboardMarkdown({ project: project(), revision: 1, bible, scenes, shots, continuity: report, prompts, providerPrompts, generatedAt: 1 });
    expect(markdown).toContain("# Storyboard — Rain Station");
    expect(markdown).toContain("SHOT-001");
    expect(markdown).toContain("Provider prompt");
  });

  test("guards invalid run transitions", () => {
    expect(() => assertRunTransition("succeeded", "running")).toThrow();
  });
});
