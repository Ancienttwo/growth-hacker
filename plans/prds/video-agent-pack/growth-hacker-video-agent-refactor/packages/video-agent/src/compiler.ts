import { VideoAgentError } from "./errors";
import type {
  PromptSpec,
  ProviderPrompt,
  RenderManifest,
  SceneSpec,
  ShotSpec,
  StoryBible,
  VideoProject,
} from "./types";
import { VIDEO_SCHEMA_VERSION } from "./types";

export interface ProviderCapabilities {
  provider: string;
  compilerVersion: string;
  aspectRatios: string[];
  minDurationSec: number;
  maxDurationSec: number;
  supportsNegativePrompt: boolean;
  supportsAudioPrompt: boolean;
  supportsStartEndFrames: boolean;
  defaultResolution?: string;
}

export const HERMES_VIDEO_CAPABILITIES: ProviderCapabilities = {
  provider: "hermes-video",
  compilerVersion: "1.0.0",
  aspectRatios: ["16:9", "9:16", "1:1"],
  minDurationSec: 3,
  maxDurationSec: 30,
  supportsNegativePrompt: true,
  supportsAudioPrompt: false,
  supportsStartEndFrames: false,
  defaultResolution: "720p",
};

export function compileCanonicalPromptSpecs(input: {
  project: VideoProject;
  bible: StoryBible;
  scenes: SceneSpec[];
  shots: ShotSpec[];
}): PromptSpec[] {
  const sceneById = new Map(input.scenes.map((scene) => [scene.id, scene]));
  const characterById = new Map(input.bible.characters.map((item) => [item.id, item]));
  const locationById = new Map(input.bible.locations.map((item) => [item.id, item]));
  const propById = new Map(input.bible.props.map((item) => [item.id, item]));

  return input.shots.map((shot) => {
    const scene = sceneById.get(shot.sceneId);
    if (!scene) throw new VideoAgentError("invalid_input", `Shot '${shot.id}' references unknown scene '${shot.sceneId}'.`);
    const characters = shot.characterIds.map((id) => characterById.get(id)).filter(Boolean);
    const location = shot.locationId ? locationById.get(shot.locationId) : undefined;
    const props = shot.propIds.map((id) => propById.get(id)).filter(Boolean);
    const subjectParts = [
      ...characters.map((item) => `${item!.name}: ${item!.appearance}; wardrobe: ${item!.wardrobe}`),
      ...props.map((item) => `${item!.name}: ${item!.description}`),
    ];
    const environmentParts = [
      location ? `${location.name}: ${location.description}; geography: ${location.geography}` : scene.slugline,
      shot.timeOfDay ? `time: ${shot.timeOfDay}` : "",
      shot.weather ? `weather: ${shot.weather}` : "",
      shot.atmosphere,
    ].filter(Boolean);
    const cinematography = joinSentence([
      `shot size ${shot.shotSize}`,
      `camera angle ${shot.cameraAngle}`,
      `lens ${shot.lens}`,
      `composition ${shot.composition}`,
      `camera movement ${shot.cameraMovement}`,
      `blocking ${shot.blocking}`,
    ]);
    const style = joinSentence([
      input.bible.visualBible.styleStatement,
      `palette ${dedupe([...input.bible.visualBible.palette, ...shot.palette]).join(", ")}`,
      `texture ${shot.texture}`,
      ...input.bible.visualBible.compositionRules,
      ...input.bible.visualBible.cameraRules,
    ]);
    const continuity = dedupe([
      `Start frame: ${shot.startFrame}`,
      `End frame: ${shot.endFrame}`,
      ...shot.continuityDependencies,
      ...characters.flatMap((item) => item!.continuityAnchors),
      ...(location?.continuityAnchors ?? []),
      ...props.flatMap((item) => item!.continuityAnchors),
    ]);
    const negative = dedupe([
      ...input.project.brief.avoid,
      ...input.bible.visualBible.forbiddenElements,
      ...shot.negativeConstraints,
      ...characters.flatMap((item) => item!.negativeConstraints),
    ]);
    const audio = joinSentence([
      shot.audio.dialogue ? `dialogue: ${shot.audio.dialogue}` : "",
      shot.audio.voiceOver ? `voice-over: ${shot.audio.voiceOver}` : "",
      shot.audio.soundEffects.length ? `sound effects: ${shot.audio.soundEffects.join(", ")}` : "",
      shot.audio.music ? `music: ${shot.audio.music}` : "",
    ].filter(Boolean));

    return {
      schemaVersion: VIDEO_SCHEMA_VERSION,
      shotId: shot.id,
      subject: subjectParts.join(" | ") || "Environment-led shot with no visible named character",
      action: shot.visibleAction,
      environment: joinSentence(environmentParts),
      cinematography,
      lighting: joinSentence([shot.lighting, ...input.bible.visualBible.lighting]),
      style,
      continuity,
      negative,
      audio: audio || undefined,
      durationSec: shot.durationSec,
      aspectRatio: input.project.brief.aspectRatio,
      startFrame: shot.startFrame,
      endFrame: shot.endFrame,
      qcCriteria: dedupe(shot.qcCriteria),
    };
  });
}

export function compileProviderPrompts(
  specs: PromptSpec[],
  capabilities: ProviderCapabilities = HERMES_VIDEO_CAPABILITIES,
): ProviderPrompt[] {
  return specs.map((spec) => compileProviderPrompt(spec, capabilities));
}

export function compileProviderPrompt(spec: PromptSpec, capabilities: ProviderCapabilities): ProviderPrompt {
  const warnings: string[] = [];
  if (!capabilities.aspectRatios.includes(spec.aspectRatio)) {
    throw new VideoAgentError("provider_capability_missing", `${capabilities.provider} does not support aspect ratio ${spec.aspectRatio}.`, {
      details: { provider: capabilities.provider, aspectRatio: spec.aspectRatio },
    });
  }
  const durationSec = clamp(spec.durationSec, capabilities.minDurationSec, capabilities.maxDurationSec);
  if (durationSec !== spec.durationSec) warnings.push(`Duration clamped from ${spec.durationSec}s to ${durationSec}s.`);
  if (spec.audio && !capabilities.supportsAudioPrompt) warnings.push("Provider does not support native audio prompting; audio remains in the edit plan only.");
  if (!capabilities.supportsStartEndFrames) warnings.push("Provider does not support explicit first/last frame conditioning; states are preserved as text constraints.");

  const promptSections = [
    `SUBJECT: ${spec.subject}`,
    `VISIBLE ACTION: ${spec.action}`,
    `ENVIRONMENT: ${spec.environment}`,
    `CINEMATOGRAPHY: ${spec.cinematography}`,
    `LIGHTING: ${spec.lighting}`,
    `VISUAL STYLE: ${spec.style}`,
    `CONTINUITY: ${spec.continuity.join("; ")}`,
    `FIRST FRAME: ${spec.startFrame}`,
    `LAST FRAME: ${spec.endFrame}`,
    `ACCEPTANCE: ${spec.qcCriteria.join("; ")}`,
  ];
  const negativePrompt = capabilities.supportsNegativePrompt
    ? spec.negative.join(", ")
    : "";
  if (spec.negative.length && !capabilities.supportsNegativePrompt) {
    promptSections.push(`AVOID: ${spec.negative.join("; ")}`);
    warnings.push("Negative constraints were merged into the main prompt.");
  }

  return {
    schemaVersion: VIDEO_SCHEMA_VERSION,
    compiler: `${capabilities.provider}-compiler`,
    compilerVersion: capabilities.compilerVersion,
    provider: capabilities.provider,
    shotId: spec.shotId,
    prompt: promptSections.join("\n"),
    negativePrompt,
    parameters: {
      aspectRatio: spec.aspectRatio,
      durationSec,
      resolution: capabilities.defaultResolution,
    },
    warnings,
  };
}

export function createRenderManifest(input: {
  project: VideoProject;
  revision: number;
  shots: ShotSpec[];
  providerPrompts: ProviderPrompt[];
  createdAt?: number;
}): RenderManifest {
  const promptByShot = new Map(input.providerPrompts.map((item) => [item.shotId, item]));
  return {
    schemaVersion: VIDEO_SCHEMA_VERSION,
    projectId: input.project.id,
    revision: input.revision,
    createdAt: input.createdAt ?? Date.now(),
    requiresApproval: true,
    risk: "external_cost",
    items: input.shots.map((shot) => {
      const providerPrompt = promptByShot.get(shot.id);
      if (!providerPrompt) throw new VideoAgentError("invalid_input", `Missing provider prompt for shot '${shot.id}'.`);
      return {
        shotId: shot.id,
        provider: providerPrompt.provider,
        prompt: providerPrompt.prompt,
        negativePrompt: providerPrompt.negativePrompt,
        durationSec: providerPrompt.parameters.durationSec,
        aspectRatio: providerPrompt.parameters.aspectRatio,
        referenceIds: [...shot.referenceIds],
        status: "planned",
      };
    }),
    warnings: dedupe(input.providerPrompts.flatMap((item) => item.warnings)),
  };
}

export function toJsonLines(values: unknown[]): string {
  return values.map((value) => JSON.stringify(value)).join("\n") + (values.length ? "\n" : "");
}

function joinSentence(parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join("; ");
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((item) => item.trim()).filter(Boolean))];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
