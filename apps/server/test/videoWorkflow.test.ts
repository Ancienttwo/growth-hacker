import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  VideoAgentError,
  parseCreateVideoProjectInput,
} from "@growth-hacker/video-agent";
import type {
  ContinuityReport,
  PreproductionStage,
  SceneSpec,
  ShotSpec,
  StoryAnalysis,
  StoryBible,
} from "@growth-hacker/video-agent";
import { VideoArtifactStore } from "../src/video/artifactStore";
import { VideoWorkflowCoordinator } from "../src/video/coordinator";
import type {
  AgentStageStatus,
  StartAgentStageInput,
  VideoAgentPort,
} from "../src/video/hermesAgent";
import { VideoRepository } from "../src/video/repository";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const analysis: StoryAnalysis = {
  logline: "A traveler returns a lost red umbrella at an empty station.",
  premise: "A quiet act of care resolves an absence.",
  genres: ["drama"],
  themes: ["kindness"],
  audiencePromise: "A precise emotional reveal.",
  pointOfView: "traveler",
  structure: [{
    id: "BEAT-001",
    label: "Return",
    summary: "The umbrella is returned.",
    emotionalValue: "relief",
    importance: "required",
  }],
  characterGoals: [{
    characterId: "CHAR-001",
    name: "Traveler",
    goal: "return the umbrella",
    obstacle: "the station is empty",
    change: "accepts no recognition",
  }],
  emotionalArc: ["uncertainty", "relief"],
  compressionPlan: { strategy: "single action", preserve: ["return"], compress: [], omit: [] },
  risks: [],
};

const bible: StoryBible = {
  worldRules: ["contemporary physical reality"],
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
    appearance: "short dark hair and tired eyes",
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
  continuityIn: {
    characterStates: { "CHAR-001": "standing" },
    propStates: { "PROP-001": "held closed" },
    environmentState: "rain easing",
  },
  continuityOut: {
    characterStates: { "CHAR-001": "walking away" },
    propStates: { "PROP-001": "on bench" },
    environmentState: "rain easing",
  },
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

const continuity: ContinuityReport = {
  verdict: "pass",
  summary: "No blocking continuity issues.",
  issues: [],
  checkedRules: ["IDs", "props", "screen direction"],
};

const stageOutputs: Record<string, unknown> = {
  story_analysis: analysis,
  story_bible: bible,
  scene_breakdown: scenes,
  shot_planning: shots,
  continuity_review: continuity,
};

class FixtureAgent implements VideoAgentPort {
  readonly startCalls: string[] = [];
  readonly getCalls: string[] = [];

  async startStage(input: StartAgentStageInput): Promise<{ externalRunId: string }> {
    this.startCalls.push(input.step.name);
    return { externalRunId: `fixture:${input.step.name}:${input.step.attempt}` };
  }

  async getStage(externalRunId: string): Promise<AgentStageStatus> {
    this.getCalls.push(externalRunId);
    const stage = externalRunId.split(":")[1] as PreproductionStage | undefined;
    const data = stage ? stageOutputs[stage] : undefined;
    if (!stage || data === undefined) return { status: "failed", error: "unknown fixture stage" };
    return {
      status: "succeeded",
      output: JSON.stringify({ schemaVersion: "1", stage, data, warnings: [] }),
      usage: { inputTokens: 100, outputTokens: 50 },
    };
  }

  async stopStage(): Promise<void> {}
}

function projectInput() {
  return parseCreateVideoProjectInput({
    title: "Rain Station",
    source: {
      kind: "story",
      text: "A traveler returns a lost red umbrella at a deserted station.",
      language: "en",
    },
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
  });
}

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "growth-video-agent-"));
  roots.push(root);
  return root;
}

function harness(root: string, agent: FixtureAgent, clockStart = 1_700_000_000_000) {
  const config = { growthRoot: root } as ConstructorParameters<typeof VideoRepository>[0];
  const repository = new VideoRepository(config);
  const artifacts = new VideoArtifactStore(config, repository);
  let clock = clockStart;
  const coordinator = new VideoWorkflowCoordinator({
    repository,
    artifacts,
    agent,
    workerId: `test-worker-${clockStart}`,
    now: () => ++clock,
  });
  return { repository, artifacts, coordinator };
}

async function driveToApproval(coordinator: VideoWorkflowCoordinator, runId: string) {
  for (let index = 0; index < 40; index += 1) {
    const detail = await coordinator.tickRun(runId);
    if (detail.run.status === "waiting_approval") return detail;
    if (detail.run.status === "failed" || detail.run.status === "cancelled") {
      throw new Error(`workflow stopped unexpectedly: ${detail.run.errorCode} ${detail.run.errorMessage}`);
    }
  }
  throw new Error("workflow did not reach approval within the bounded test loop");
}

describe("Video Workflow integration", () => {
  test("resumes the same external run after restart, approves, and exports only manifest-selected artifacts", async () => {
    const root = temporaryRoot();
    const firstAgent = new FixtureAgent();
    const first = harness(root, firstAgent);
    const project = first.coordinator.createProject(projectInput()).project;
    const run = first.coordinator.startPreproduction({
      projectId: project.id,
      idempotencyKey: "restart-v1",
      agentId: "fixture-agent",
      maxAttempts: 3,
    }).run;

    const submitted = await first.coordinator.tickRun(run.id);
    expect(submitted.steps.find((step) => step.name === "story_analysis")?.status).toBe("running");
    expect(firstAgent.startCalls).toEqual(["story_analysis"]);
    first.repository.close();

    const resumedAgent = new FixtureAgent();
    const resumed = harness(root, resumedAgent, 1_700_000_100_000);
    const firstRecoveredTick = await resumed.coordinator.tickRun(run.id);
    expect(firstRecoveredTick.steps.find((step) => step.name === "story_analysis")?.status).toBe("succeeded");
    expect(resumedAgent.startCalls).toEqual([]);
    expect(resumedAgent.getCalls).toEqual(["fixture:story_analysis:1"]);

    const waiting = await driveToApproval(resumed.coordinator, run.id);
    expect(waiting.run.status).toBe("waiting_approval");
    expect(waiting.approval?.status).toBe("pending");
    expect(waiting.artifacts.some((artifact) => artifact.kind === "storyboard")).toBe(true);
    expect(waiting.artifacts.some((artifact) => artifact.kind === "render-manifest")).toBe(true);
    const promptStep = waiting.steps.find((step) => step.name === "prompt_compilation");
    const storyboardStep = waiting.steps.find((step) => step.name === "storyboard_document");
    const renderArtifact = waiting.artifacts.find((artifact) => artifact.kind === "render-manifest");
    const packageArtifact = waiting.artifacts.find((artifact) => artifact.kind === "preproduction-package");
    if (!promptStep?.startedAt || !storyboardStep?.startedAt || !renderArtifact || !packageArtifact) {
      throw new Error("deterministic stage timestamps or artifacts are missing");
    }
    expect(resumed.artifacts.readJson<{ createdAt: number }>(renderArtifact).createdAt).toBe(promptStep.startedAt);
    expect(resumed.artifacts.readJson<{ generatedAt: number }>(packageArtifact).generatedAt).toBe(storyboardStep.startedAt);

    const approved = resumed.coordinator.decideApproval({
      runId: run.id,
      decision: "approve",
      expectedRevision: 1,
      decidedBy: "test-producer",
    });
    expect(approved.run.status).toBe("succeeded");
    expect(resumed.coordinator.getProject(project.id).project.status).toBe("ready_for_render");

    const exported = resumed.coordinator.exportPackage(project.id, 1);
    expect(exported.exportUri.startsWith("growth://video/exports/")).toBe(true);
    expect(exported.files.some((file) => file.endsWith("storyboard.md"))).toBe(true);
    expect(exported.files.some((file) => file.endsWith("package-manifest.json"))).toBe(true);
    expect(exported.files.some((file) => file.includes("agent-output.raw"))).toBe(false);
    expect(exported.files.some((file) => file.includes("agent-output.invalid"))).toBe(false);
    resumed.repository.close();
  });

  test("stops an ambiguous submission after restart and requires an explicit retry", async () => {
    const root = temporaryRoot();
    const initialAgent = new FixtureAgent();
    const initial = harness(root, initialAgent);
    const project = initial.coordinator.createProject(projectInput()).project;
    const run = initial.coordinator.startPreproduction({ projectId: project.id, maxAttempts: 3 }).run;
    initial.repository.transitionRun(run.id, "running", { currentStep: "story_analysis" }, 1_700_000_000_100);
    const step = initial.repository.getStep(run.id, "story_analysis");
    initial.repository.transitionStep(step.id, "submitting", { startedAt: 1_700_000_000_101 }, 1_700_000_000_101);
    initial.repository.close();

    const resumedAgent = new FixtureAgent();
    const resumed = harness(root, resumedAgent, 1_700_000_200_000);
    const failed = await resumed.coordinator.tickRun(run.id);
    expect(failed.run.status).toBe("failed");
    expect(failed.run.errorCode).toBe("ambiguous_external_submission");
    expect(resumedAgent.startCalls).toEqual([]);
    expect(resumed.coordinator.getProject(project.id).project.status).toBe("draft");

    const retried = resumed.coordinator.retryRun(run.id, "story_analysis");
    expect(retried.run.status).toBe("running");
    expect(retried.steps.find((item) => item.name === "story_analysis")?.attempt).toBe(2);
    expect(retried.steps.find((item) => item.name === "story_analysis")?.startedAt).toBe(undefined);
    expect(resumed.coordinator.getProject(project.id).project.status).toBe("in_preproduction");
    await resumed.coordinator.tickRun(run.id);
    expect(resumedAgent.startCalls).toEqual(["story_analysis"]);
    resumed.repository.close();
  });

  test("enforces revision CAS, idempotency request equality, and idempotent artifact registration", () => {
    const root = temporaryRoot();
    const agent = new FixtureAgent();
    const instance = harness(root, agent);
    const project = instance.coordinator.createProject(projectInput()).project;
    const firstRun = instance.coordinator.startPreproduction({
      projectId: project.id,
      idempotencyKey: "same-request",
      agentId: "agent-a",
      model: "model-a",
      maxAttempts: 2,
    });
    const replay = instance.coordinator.startPreproduction({
      projectId: project.id,
      idempotencyKey: "same-request",
      agentId: "agent-a",
      model: "model-a",
      maxAttempts: 2,
    });
    expect(replay.run.id).toBe(firstRun.run.id);
    expect(() => instance.coordinator.startPreproduction({
      projectId: project.id,
      idempotencyKey: "same-request",
      agentId: "agent-a",
      model: "different-model",
      maxAttempts: 2,
    })).toThrow(VideoAgentError);

    const written = instance.artifacts.writeText({
      projectId: project.id,
      revision: 1,
      kind: "test-artifact",
      mediaType: "text/plain; charset=utf-8",
      relativePath: "revisions/1/tests/idempotent.txt",
      content: "same bytes\n",
      producer: "integration-test@1",
    });
    const replayed = instance.artifacts.writeText({
      projectId: project.id,
      revision: 1,
      kind: "test-artifact",
      mediaType: "text/plain; charset=utf-8",
      relativePath: "revisions/1/tests/idempotent.txt",
      content: "same bytes\n",
      producer: "integration-test@1",
    });
    expect(replayed.id).toBe(written.id);
    expect(() => instance.artifacts.writeText({
      projectId: project.id,
      revision: 1,
      kind: "test-artifact",
      mediaType: "text/plain; charset=utf-8",
      relativePath: "revisions/1/tests/idempotent.txt",
      content: "different bytes\n",
      producer: "integration-test@1",
    })).toThrow(VideoAgentError);
    expect(() => instance.artifacts.writeText({
      projectId: project.id,
      revision: 1,
      kind: "test-artifact",
      mediaType: "text/plain; charset=utf-8",
      relativePath: "revisions/1/tests/idempotent.txt",
      content: "same bytes\n",
      producer: "different-producer@1",
    })).toThrow(VideoAgentError);

    // Simulate a crash after immutable file publication but before artifact metadata
    // was inserted. A retry must adopt matching bytes rather than deadlock on EEXIST.
    const orphanRelativePath = "revisions/1/tests/crash-orphan.txt";
    const orphanDirectory = join(root, "video-projects", project.id, "revisions", "1", "tests");
    mkdirSync(orphanDirectory, { recursive: true });
    writeFileSync(join(root, "video-projects", project.id, orphanRelativePath), "orphan bytes\n", { mode: 0o600 });
    const adopted = instance.artifacts.writeText({
      projectId: project.id,
      revision: 1,
      kind: "test-orphan",
      mediaType: "text/plain; charset=utf-8",
      relativePath: orphanRelativePath,
      content: "orphan bytes\n",
      producer: "integration-test@1",
    });
    expect(instance.repository.findArtifactByRelativePath(project.id, 1, orphanRelativePath)?.id).toBe(adopted.id);

    const revision = instance.coordinator.reviseProject(project.id, {
      expectedRevision: 1,
      title: "Rain Station Revised",
    }).project;
    expect(revision.currentRevision).toBe(2);
    expect(() => instance.coordinator.reviseProject(project.id, {
      expectedRevision: 1,
      title: "Stale update",
    })).toThrow(VideoAgentError);
    instance.repository.close();
  });

  test("serializes concurrent ticks so an Agent stage is submitted only once", async () => {
    const root = temporaryRoot();
    const agent = new FixtureAgent();
    const instance = harness(root, agent);
    const project = instance.coordinator.createProject(projectInput()).project;
    const run = instance.coordinator.startPreproduction({ projectId: project.id }).run;

    await Promise.all([
      instance.coordinator.tickRun(run.id),
      instance.coordinator.tickRun(run.id),
    ]);

    expect(agent.startCalls).toEqual(["story_analysis"]);
    expect(instance.coordinator.getRun(run.id).steps.find((step) => step.name === "story_analysis")?.status).toBe("running");
    instance.repository.close();
  });
});
