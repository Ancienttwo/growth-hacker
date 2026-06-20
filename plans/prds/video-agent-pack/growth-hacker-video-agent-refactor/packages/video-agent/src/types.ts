export const VIDEO_SCHEMA_VERSION = "1" as const;

export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:3";
export type StorySourceKind = "story" | "outline" | "screenplay" | "voiceover" | "article" | "unknown";
export type VideoProjectStatus =
  | "draft"
  | "in_preproduction"
  | "ready_for_render"
  | "rendering"
  | "completed"
  | "archived";
export type WorkflowStatus = "queued" | "running" | "waiting_approval" | "succeeded" | "failed" | "cancelled";
export type WorkflowStepStatus = "pending" | "submitting" | "running" | "succeeded" | "failed" | "skipped" | "cancelled";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";
export type ApprovalRisk = "local_write" | "external_cost" | "external_publish" | "destructive" | "credential_admin";

export interface StorySource {
  kind: StorySourceKind;
  text: string;
  language: string;
  sourceName?: string;
  checksum?: string;
}

export interface ProductionReference {
  id: string;
  label: string;
  uri?: string;
  notes?: string;
}

export interface ProductionBrief {
  targetAudience: string;
  intendedUse: string;
  aspectRatio: AspectRatio;
  targetDurationSec: number;
  language: string;
  narrativeFormat: string;
  visualStyle: string;
  pace: "slow" | "measured" | "dynamic" | "fast";
  contentRating?: string;
  mustKeep: string[];
  avoid: string[];
  references: ProductionReference[];
  providerPreference?: string;
}

export interface CreateVideoProjectInput {
  title: string;
  source: StorySource;
  brief: ProductionBrief;
  agentId?: string;
}

export interface ReviseVideoProjectInput {
  expectedRevision: number;
  title?: string;
  source?: StorySource;
  brief?: ProductionBrief;
  reason?: string;
}

export interface VideoProject {
  id: string;
  title: string;
  status: VideoProjectStatus;
  currentRevision: number;
  source: StorySource;
  brief: ProductionBrief;
  createdAt: number;
  updatedAt: number;
}

export interface VideoRevision {
  projectId: string;
  revision: number;
  title: string;
  source: StorySource;
  brief: ProductionBrief;
  reason?: string;
  createdAt: number;
}

export interface StoryBeat {
  id: string;
  label: string;
  summary: string;
  emotionalValue: string;
  importance: "required" | "supporting" | "optional";
}

export interface StoryAnalysis {
  logline: string;
  premise: string;
  genres: string[];
  themes: string[];
  audiencePromise: string;
  pointOfView: string;
  structure: StoryBeat[];
  characterGoals: Array<{
    characterId: string;
    name: string;
    goal: string;
    obstacle: string;
    change: string;
  }>;
  emotionalArc: string[];
  compressionPlan: {
    strategy: string;
    preserve: string[];
    compress: string[];
    omit: string[];
  };
  risks: string[];
}

export interface CharacterBible {
  id: string;
  name: string;
  role: string;
  agePresentation?: string;
  appearance: string;
  wardrobe: string;
  behavior: string;
  voice?: string;
  continuityAnchors: string[];
  negativeConstraints: string[];
  referenceIds: string[];
}

export interface LocationBible {
  id: string;
  name: string;
  description: string;
  geography: string;
  palette: string[];
  lightingRules: string[];
  continuityAnchors: string[];
  referenceIds: string[];
}

export interface PropBible {
  id: string;
  name: string;
  description: string;
  ownerCharacterId?: string;
  continuityAnchors: string[];
  referenceIds: string[];
}

export interface StoryBible {
  worldRules: string[];
  visualBible: {
    styleStatement: string;
    palette: string[];
    lighting: string[];
    texture: string[];
    compositionRules: string[];
    cameraRules: string[];
    forbiddenElements: string[];
  };
  characters: CharacterBible[];
  locations: LocationBible[];
  props: PropBible[];
}

export interface ContinuityState {
  characterStates: Record<string, string>;
  propStates: Record<string, string>;
  environmentState: string;
  screenDirection?: string;
}

export interface SceneSpec {
  id: string;
  order: number;
  slugline: string;
  summary: string;
  purpose: string;
  storyBeatIds: string[];
  locationId?: string;
  timeOfDay?: string;
  characters: string[];
  props: string[];
  emotionalBeat: string;
  estimatedDurationSec: number;
  continuityIn: ContinuityState;
  continuityOut: ContinuityState;
}

export interface ShotAudio {
  dialogue?: string;
  voiceOver?: string;
  soundEffects: string[];
  music?: string;
}

export interface ShotSpec {
  id: string;
  sceneId: string;
  order: number;
  narrativePurpose: string;
  storyBeat: string;
  durationSec: number;
  shotSize: string;
  cameraAngle: string;
  lens: string;
  composition: string;
  cameraMovement: string;
  blocking: string;
  visibleAction: string;
  locationId?: string;
  timeOfDay?: string;
  weather?: string;
  atmosphere: string;
  lighting: string;
  palette: string[];
  texture: string;
  characterIds: string[];
  wardrobe: string[];
  propIds: string[];
  referenceIds: string[];
  audio: ShotAudio;
  startFrame: string;
  endFrame: string;
  continuityDependencies: string[];
  negativeConstraints: string[];
  editIntent: string;
  transitionOut: string;
  qcCriteria: string[];
}

export interface ContinuityIssue {
  id: string;
  severity: "error" | "warning" | "note";
  scope: "project" | "scene" | "shot";
  sceneId?: string;
  shotId?: string;
  field?: string;
  message: string;
  suggestedFix: string;
}

export interface ContinuityReport {
  verdict: "pass" | "pass_with_warnings" | "fail";
  summary: string;
  issues: ContinuityIssue[];
  checkedRules: string[];
}

export interface PromptSpec {
  schemaVersion: typeof VIDEO_SCHEMA_VERSION;
  shotId: string;
  subject: string;
  action: string;
  environment: string;
  cinematography: string;
  lighting: string;
  style: string;
  continuity: string[];
  negative: string[];
  audio?: string;
  durationSec: number;
  aspectRatio: AspectRatio;
  startFrame: string;
  endFrame: string;
  qcCriteria: string[];
}

export interface ProviderPrompt {
  schemaVersion: typeof VIDEO_SCHEMA_VERSION;
  compiler: string;
  compilerVersion: string;
  provider: string;
  shotId: string;
  prompt: string;
  negativePrompt: string;
  parameters: {
    aspectRatio: AspectRatio;
    durationSec: number;
    resolution?: string;
  };
  warnings: string[];
}

export interface RenderManifestItem {
  shotId: string;
  provider: string;
  providerPromptArtifactId?: string;
  prompt: string;
  negativePrompt: string;
  durationSec: number;
  aspectRatio: AspectRatio;
  referenceIds: string[];
  status: "planned" | "approved" | "submitted" | "succeeded" | "failed" | "skipped";
}

export interface RenderManifest {
  schemaVersion: typeof VIDEO_SCHEMA_VERSION;
  projectId: string;
  revision: number;
  createdAt: number;
  requiresApproval: true;
  risk: "external_cost";
  items: RenderManifestItem[];
  warnings: string[];
}

export type PreproductionStage =
  | "story_analysis"
  | "story_bible"
  | "scene_breakdown"
  | "shot_planning"
  | "continuity_review"
  | "prompt_compilation"
  | "storyboard_document"
  | "preproduction_approval";

export interface StageOutputEnvelope<T = unknown> {
  schemaVersion: typeof VIDEO_SCHEMA_VERSION;
  stage: PreproductionStage;
  data: T;
  warnings: string[];
}

export interface WorkflowRun {
  id: string;
  definition: "video.preproduction.v1" | "video.render.v1";
  projectId: string;
  revision: number;
  status: WorkflowStatus;
  currentStep?: PreproductionStage;
  progress: number;
  idempotencyKey?: string;
  requestedAgentId?: string;
  requestedProvider?: string;
  requestedModel?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
}

export interface WorkflowStep {
  id: string;
  runId: string;
  name: PreproductionStage;
  ordinal: number;
  status: WorkflowStepStatus;
  attempt: number;
  maxAttempts: number;
  externalRunId?: string;
  inputArtifactIds: string[];
  outputArtifactIds: string[];
  errorCode?: string;
  errorMessage?: string;
  startedAt?: number;
  finishedAt?: number;
  updatedAt: number;
}

export interface WorkflowEvent {
  id: number;
  runId: string;
  stepId?: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

export interface VideoArtifact {
  id: string;
  projectId: string;
  revision: number;
  runId?: string;
  stepId?: string;
  kind: string;
  mediaType: string;
  relativePath: string;
  byteSize: number;
  sha256: string;
  schemaVersion?: string;
  producer: string;
  sourceArtifactIds: string[];
  metadata: Record<string, unknown>;
  createdAt: number;
}

export interface WorkflowApproval {
  id: string;
  runId: string;
  projectId: string;
  revision: number;
  risk: ApprovalRisk;
  status: ApprovalStatus;
  summary: string;
  estimatedCost?: Record<string, unknown>;
  requestedBy: string;
  decidedBy?: string;
  decisionNote?: string;
  createdAt: number;
  decidedAt?: number;
}

export interface PreproductionSnapshot {
  project: VideoProject;
  revision: VideoRevision;
  analysis?: StoryAnalysis;
  bible?: StoryBible;
  scenes?: SceneSpec[];
  shots?: ShotSpec[];
  continuity?: ContinuityReport;
  prompts?: PromptSpec[];
  providerPrompts?: ProviderPrompt[];
}
