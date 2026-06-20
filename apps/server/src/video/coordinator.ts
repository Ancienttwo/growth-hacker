import {
  HERMES_VIDEO_CAPABILITIES,
  PREPRODUCTION_STAGES,
  VideoAgentError,
  asVideoAgentError,
  compileCanonicalPromptSpecs,
  compileProviderPrompts,
  createRenderManifest,
  isAgentStage,
  isTerminalRunStatus,
  nextPreproductionStage,
  parseAgentStageOutput,
  renderScenesCsv,
  renderShotsCsv,
  renderStoryboardMarkdown,
  validateCrossReferences,
} from "@growth-hacker/video-agent";
import type {
  ContinuityIssue,
  ContinuityReport,
  CreateVideoProjectInput,
  PreproductionSnapshot,
  PreproductionStage,
  PromptSpec,
  ProviderPrompt,
  ReviseVideoProjectInput,
  SceneSpec,
  ShotSpec,
  StoryAnalysis,
  StoryBible,
  VideoArtifact,
  VideoProject,
  WorkflowRun,
  WorkflowStep,
} from "@growth-hacker/video-agent";
import type { VideoAgentPort } from "./hermesAgent";
import { VideoArtifactStore } from "./artifactStore";
import type { CreatePreproductionRunInput, WorkflowRunDetail } from "./repository";
import { VideoRepository } from "./repository";

const WORKFLOW_LEASE_MS = 30_000;
const PROVIDER_POLL_TIMEOUT_MS = 6 * 60 * 60 * 1_000;

const STAGE_ARTIFACT_KIND: Record<Exclude<PreproductionStage, "prompt_compilation" | "storyboard_document" | "preproduction_approval">, string> = {
  story_analysis: "story-analysis",
  story_bible: "story-bible",
  scene_breakdown: "scenes",
  shot_planning: "shots",
  continuity_review: "continuity-report",
};

export interface VideoWorkflowCoordinatorOptions {
  repository: VideoRepository;
  artifacts: VideoArtifactStore;
  agent: VideoAgentPort;
  workerId?: string;
  now?: () => number;
}

export interface VideoRunView extends WorkflowRunDetail {
  artifacts: VideoArtifact[];
}

export class VideoWorkflowCoordinator {
  private readonly repository: VideoRepository;
  private readonly artifacts: VideoArtifactStore;
  private readonly agent: VideoAgentPort;
  private readonly workerId: string;
  private readonly now: () => number;

  constructor(options: VideoWorkflowCoordinatorOptions) {
    this.repository = options.repository;
    this.artifacts = options.artifacts;
    this.agent = options.agent;
    this.workerId = options.workerId ?? `video-worker-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
    this.now = options.now ?? Date.now;
  }

  createProject(input: CreateVideoProjectInput): { project: VideoProject } {
    return { project: this.repository.createProject(input, this.now()).project };
  }

  listProjects(limit?: number): VideoProject[] {
    return this.repository.listProjects(limit);
  }

  getProject(projectId: string, revision?: number): PreproductionSnapshot {
    const project = this.repository.getProject(projectId);
    const targetRevision = revision ?? project.currentRevision;
    const latestRun = this.repository.findLatestPreproductionRun(project.id, targetRevision);
    return this.loadSnapshotForProject(project.id, targetRevision, latestRun?.id);
  }

  reviseProject(projectId: string, input: ReviseVideoProjectInput): { project: VideoProject } {
    return { project: this.repository.reviseProject(projectId, input, this.now()).project };
  }

  startPreproduction(input: CreatePreproductionRunInput): VideoRunView {
    const detail = this.repository.createPreproductionRun(input, this.now());
    return this.toRunView(detail);
  }

  getRun(runId: string): VideoRunView {
    return this.toRunView(this.repository.getRunDetail(runId));
  }

  listEvents(runId: string, afterId?: number, limit?: number) {
    this.repository.getRun(runId);
    return this.repository.listEvents(runId, afterId, limit);
  }

  listArtifacts(projectId: string, revision?: number): VideoArtifact[] {
    return this.repository.listArtifacts(projectId, revision);
  }

  getArtifact(artifactId: string): VideoArtifact {
    return this.repository.getArtifact(artifactId);
  }

  resolveArtifact(artifact: VideoArtifact): string {
    return this.artifacts.resolveArtifact(artifact);
  }

  exportPackage(projectId: string, revision?: number) {
    const project = this.repository.getProject(projectId);
    const targetRevision = revision ?? project.currentRevision;
    this.repository.getRevision(projectId, targetRevision);
    const packageArtifact = this.repository.findLatestArtifact(projectId, targetRevision, "preproduction-package");
    if (!packageArtifact?.runId) {
      throw new VideoAgentError("workflow_not_ready", "A completed preproduction package is required before export.", { status: 409 });
    }
    const run = this.repository.getRun(packageArtifact.runId);
    if (run.status !== "waiting_approval" && run.status !== "succeeded") {
      throw new VideoAgentError("workflow_not_ready", `Run '${run.id}' is not exportable while status is '${run.status}'.`, { status: 409 });
    }
    const manifest = this.artifacts.readJson<{ artifactIds?: unknown }>(packageArtifact);
    const sourceIds = Array.isArray(manifest.artifactIds)
      ? manifest.artifactIds.filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
      : [];
    const artifactIds = [...new Set([...sourceIds, packageArtifact.id])];
    const exported = this.artifacts.exportArtifacts(projectId, targetRevision, run.id, artifactIds);
    return { projectId, revision: targetRevision, runId: run.id, packageArtifactId: packageArtifact.id, artifactIds, ...exported };
  }

  retryRun(runId: string, stage?: PreproductionStage): VideoRunView {
    return this.toRunView(this.repository.retryFailedStep(runId, stage, this.now()));
  }

  async cancelRun(runId: string): Promise<VideoRunView> {
    const detail = this.repository.getRunDetail(runId);
    const active = detail.steps.find((step) => step.status === "running" && step.externalRunId);
    if (active?.externalRunId) {
      try {
        await this.agent.stopStage(active.externalRunId);
      } catch (error) {
        this.repository.appendEvent(runId, active.id, "provider.stop_failed", {
          externalRunId: active.externalRunId,
          message: error instanceof Error ? error.message : String(error),
        }, this.now());
      }
    }
    return this.toRunView(this.repository.cancelRun(runId, this.now()));
  }

  decideApproval(input: {
    runId: string;
    decision: "approve" | "reject";
    expectedRevision: number;
    decidedBy: string;
    note?: string;
  }): VideoRunView {
    const run = this.repository.getRun(input.runId);
    const project = this.repository.getProject(run.projectId);
    if (project.currentRevision !== input.expectedRevision || run.revision !== input.expectedRevision) {
      throw new VideoAgentError(
        "revision_conflict",
        `Approval targets revision ${input.expectedRevision}, while run/project revisions are ${run.revision}/${project.currentRevision}.`,
        { status: 409, details: { expectedRevision: input.expectedRevision, runRevision: run.revision, currentRevision: project.currentRevision } },
      );
    }
    if (input.decision === "approve") {
      const continuityArtifact = this.requiredArtifact(run, "continuity-report");
      const continuity = this.artifacts.readJson<ContinuityReport>(continuityArtifact);
      if (continuity.verdict === "fail" || continuity.issues.some((issue) => issue.severity === "error")) {
        throw new VideoAgentError("workflow_not_ready", "Preproduction approval is blocked by continuity errors.", {
          status: 409,
          details: { errorCount: continuity.issues.filter((issue) => issue.severity === "error").length },
        });
      }
    }
    return this.toRunView(this.repository.decidePreproductionApproval(input, this.now()));
  }

  async tick(limit = 5): Promise<void> {
    const runIds = this.repository.listRunnableRunIds(limit, this.now());
    for (const runId of runIds) {
      await this.tickRun(runId);
    }
  }

  async tickRun(runId: string): Promise<VideoRunView> {
    const leaseOwner = `${this.workerId}:${crypto.randomUUID().slice(0, 8)}`;
    if (!this.repository.tryAcquireLease(runId, leaseOwner, WORKFLOW_LEASE_MS, this.now())) {
      return this.getRun(runId);
    }
    const heartbeat = setInterval(() => {
      try {
        this.repository.renewLease(runId, leaseOwner, WORKFLOW_LEASE_MS, this.now());
      } catch {
        // A failed heartbeat is tolerated for this short unit of work. The unique lease
        // token still prevents same-process re-entry until the current lease expires.
      }
    }, Math.floor(WORKFLOW_LEASE_MS / 3));
    (heartbeat as unknown as { unref?: () => void }).unref?.();
    try {
      await this.processRun(runId);
    } catch (error) {
      const normalized = asVideoAgentError(error);
      const detail = this.repository.getRunDetail(runId);
      if (!isTerminalRunStatus(detail.run.status) && detail.run.status !== "waiting_approval") {
        const current = detail.steps.find((step) => step.name === detail.run.currentStep);
        if (current && current.status !== "succeeded" && current.status !== "skipped" && current.status !== "cancelled") {
          this.repository.failRunAndStep(runId, current.id, normalized.code, normalized.message, this.now());
        } else {
          this.repository.failRun(runId, normalized.code, normalized.message, detail.run.currentStep, this.now());
        }
      }
      this.repository.appendEvent(runId, undefined, "workflow.unhandled_error", {
        code: normalized.code,
        message: normalized.message,
        retryable: normalized.retryable,
      }, this.now());
    } finally {
      clearInterval(heartbeat);
      this.repository.releaseLease(runId, leaseOwner);
    }
    return this.getRun(runId);
  }

  private async processRun(runId: string): Promise<void> {
    let detail = this.repository.getRunDetail(runId);
    if (detail.run.status === "queued") {
      this.repository.transitionRun(runId, "running", {
        currentStep: detail.run.currentStep ?? PREPRODUCTION_STAGES[0],
        errorCode: null,
        errorMessage: null,
      }, this.now());
      detail = this.repository.getRunDetail(runId);
    }
    if (detail.run.status !== "running") return;
    const stage = detail.run.currentStep;
    if (!stage) {
      throw new VideoAgentError("workflow_not_ready", "Running workflow has no current step.", { status: 500 });
    }
    const step = detail.steps.find((item) => item.name === stage);
    if (!step) throw new VideoAgentError("step_not_found", `Step '${stage}' is missing from run '${runId}'.`, { status: 500 });

    if (step.status === "succeeded" || step.status === "skipped") {
      this.repository.advanceRunAfterStep(runId, stage, nextPreproductionStage(stage), this.now());
      return;
    }
    if (step.status === "failed") {
      this.repository.failRunAndStep(
        runId,
        step.id,
        step.errorCode ?? "internal_error",
        step.errorMessage ?? `Step '${stage}' failed.`,
        this.now(),
      );
      return;
    }
    if (stage === "preproduction_approval") {
      this.repository.requestPreproductionApproval(runId, "video-workflow", this.now());
      return;
    }
    if (stage === "prompt_compilation") {
      this.runPromptCompilation(detail.run, step);
      return;
    }
    if (stage === "storyboard_document") {
      this.runStoryboardGeneration(detail.run, step);
      return;
    }
    await this.runAgentStage(detail.run, step);
  }

  private async runAgentStage(run: WorkflowRun, step: WorkflowStep): Promise<void> {
    if (!isAgentStage(step.name)) throw new VideoAgentError("invalid_input", `Stage '${step.name}' is not an Agent stage.`);

    const existing = this.repository.findLatestArtifact(run.projectId, run.revision, STAGE_ARTIFACT_KIND[step.name], run.id);
    if (existing) {
      this.completeStepFromArtifacts(run, step, [existing]);
      return;
    }

    if (step.status === "submitting") {
      // We intentionally cannot auto-retry this state: the provider may have accepted the request
      // before the process crashed, while its external ID was not durably stored.
      this.repository.failRunAndStep(
        run.id,
        step.id,
        "ambiguous_external_submission",
        "Agent submission outcome is ambiguous. Manual retry is required to avoid an accidental duplicate run.",
        this.now(),
      );
      return;
    }

    if (step.status === "pending") {
      const snapshot = this.loadSnapshot(run);
      const inputArtifactIds = this.snapshotArtifactIds(run, step.name);
      const previousRaw = step.attempt > 1
        ? this.repository.findLatestArtifact(run.projectId, run.revision, `${step.name}.invalid`, run.id)
        : undefined;
      this.repository.transitionStep(step.id, "submitting", {
        inputArtifactIds,
        externalRunId: null,
        errorCode: null,
        errorMessage: null,
        startedAt: this.now(),
        finishedAt: null,
      }, this.now());
      try {
        const started = await this.agent.startStage({
          run,
          step: { ...step, status: "submitting", inputArtifactIds },
          snapshot,
          validationErrors: step.errorMessage ? [step.errorMessage] : undefined,
          previousRawOutput: previousRaw ? this.artifacts.readText(previousRaw) : undefined,
        });
        this.repository.transitionStep(step.id, "running", {
          externalRunId: started.externalRunId,
        }, this.now());
        this.repository.appendEvent(run.id, step.id, "provider.submitted", {
          provider: "hermes",
          externalRunId: started.externalRunId,
          attempt: step.attempt,
        }, this.now());
      } catch (error) {
        const normalized = asVideoAgentError(error, "external_provider_failed");
        this.repository.failRunAndStep(
          run.id,
          step.id,
          "ambiguous_external_submission",
          `Agent submission failed or returned an ambiguous result: ${normalized.message}`,
          this.now(),
        );
      }
      return;
    }

    if (step.status !== "running") return;
    if (!step.externalRunId) {
      this.repository.failRunAndStep(run.id, step.id, "external_provider_failed", "Running Agent step has no external run ID.", this.now());
      return;
    }

    let provider;
    try {
      provider = await this.agent.getStage(step.externalRunId);
    } catch (error) {
      const elapsed = this.now() - (step.startedAt ?? step.updatedAt);
      const normalized = asVideoAgentError(error, "external_provider_failed");
      this.repository.appendEvent(run.id, step.id, "provider.poll_failed", {
        externalRunId: step.externalRunId,
        elapsedMs: elapsed,
        message: normalized.message,
      }, this.now());
      if (elapsed > PROVIDER_POLL_TIMEOUT_MS) {
        this.retryOrFail(run, step, "external_provider_failed", `Provider polling exceeded timeout: ${normalized.message}`, true);
      }
      return;
    }

    if (provider.status === "running") {
      const elapsed = this.now() - (step.startedAt ?? step.updatedAt);
      if (elapsed > PROVIDER_POLL_TIMEOUT_MS) {
        this.retryOrFail(run, step, "external_provider_failed", "Provider run exceeded the six-hour polling timeout.", true);
      }
      return;
    }
    if (provider.status === "failed" || provider.status === "cancelled") {
      this.retryOrFail(run, step, "external_provider_failed", provider.error ?? `Agent run ${provider.status}.`, true);
      return;
    }
    if (!provider.output?.trim()) {
      this.retryOrFail(run, step, "invalid_stage_output", "Agent completed without a non-empty output.", true);
      return;
    }

    const rawArtifact = this.ensureRawArtifact(run, step, provider.output, provider.usage);
    try {
      const parsed = parseAgentStageOutput(step.name, provider.output);
      const validatedArtifact = this.writeValidatedAgentArtifact(run, step, parsed.data, parsed.warnings, [rawArtifact.id]);
      this.completeStepFromArtifacts(run, step, [rawArtifact, validatedArtifact]);
    } catch (error) {
      const normalized = asVideoAgentError(error, "invalid_stage_output");
      const invalid = this.ensureInvalidArtifact(run, step, provider.output, normalized);
      this.repository.appendStepOutputArtifact(step.id, invalid.id, this.now());
      this.retryOrFail(run, step, normalized.code, normalized.message, normalized.retryable || normalized.code === "invalid_stage_output");
    }
  }

  private runPromptCompilation(run: WorkflowRun, step: WorkflowStep): void {
    const existing = [
      this.repository.findLatestArtifact(run.projectId, run.revision, "canonical-prompts", run.id),
      this.repository.findLatestArtifact(run.projectId, run.revision, "provider-prompts", run.id),
      this.repository.findLatestArtifact(run.projectId, run.revision, "render-manifest", run.id),
    ];
    if (existing.every(Boolean)) {
      this.completeStepFromArtifacts(run, step, existing as VideoArtifact[]);
      return;
    }
    const activeStep = step.status === "pending"
      ? this.repository.transitionStep(step.id, "running", { inputArtifactIds: this.snapshotArtifactIds(run, step.name) }, this.now())
      : this.repository.getStep(run.id, step.name);

    const snapshot = this.loadSnapshot(run);
    const bible = requireValue(snapshot.bible, "story-bible");
    const scenes = requireValue(snapshot.scenes, "scenes");
    const shots = requireValue(snapshot.shots, "shots");
    const prompts = existing[0]
      ? requireValue(this.readJsonLinesArtifact<PromptSpec>(run.id, run.projectId, run.revision, "canonical-prompts"), "canonical-prompts")
      : compileCanonicalPromptSpecs({ project: snapshot.project, bible, scenes, shots });
    const providerPrompts = existing[1]
      ? requireValue(this.readJsonLinesArtifact<ProviderPrompt>(run.id, run.projectId, run.revision, "provider-prompts"), "provider-prompts")
      : compileProviderPrompts(prompts, HERMES_VIDEO_CAPABILITIES);
    const renderManifest = createRenderManifest({
      project: snapshot.project,
      revision: run.revision,
      shots,
      providerPrompts,
      createdAt: activeStep.startedAt ?? run.createdAt,
    });
    const base = this.stagePath(run, step);
    const sources = this.snapshotArtifactIds(run, step.name);
    const canonicalArtifact = existing[0] ?? this.artifacts.writeJsonLines({
      projectId: run.projectId,
      revision: run.revision,
      runId: run.id,
      stepId: step.id,
      kind: "canonical-prompts",
      relativePath: `${base}/canonical-prompts.jsonl`,
      values: prompts,
      schemaVersion: "1",
      producer: "video-agent.prompt-compiler@1",
      sourceArtifactIds: sources,
    });
    const providerArtifact = existing[1] ?? this.artifacts.writeJsonLines({
      projectId: run.projectId,
      revision: run.revision,
      runId: run.id,
      stepId: step.id,
      kind: "provider-prompts",
      relativePath: `${base}/hermes-video-prompts.jsonl`,
      values: providerPrompts,
      schemaVersion: "1",
      producer: "video-agent.hermes-compiler@1",
      sourceArtifactIds: [canonicalArtifact.id],
    });
    const manifestArtifact = existing[2] ?? this.artifacts.writeJson({
      projectId: run.projectId,
      revision: run.revision,
      runId: run.id,
      stepId: step.id,
      kind: "render-manifest",
      relativePath: `${base}/render-manifest.json`,
      content: renderManifest,
      schemaVersion: "1",
      producer: "video-agent.render-planner@1",
      sourceArtifactIds: [providerArtifact.id],
      metadata: { risk: "external_cost", requiresApproval: true },
    });
    this.completeStepFromArtifacts(run, activeStep, [canonicalArtifact, providerArtifact, manifestArtifact]);
  }

  private runStoryboardGeneration(run: WorkflowRun, step: WorkflowStep): void {
    const existing = {
      projectSnapshot: this.repository.findLatestArtifact(run.projectId, run.revision, "project-snapshot", run.id),
      productionBrief: this.repository.findLatestArtifact(run.projectId, run.revision, "production-brief", run.id),
      sourceDocument: this.repository.findLatestArtifact(run.projectId, run.revision, "source-document", run.id),
      storyboard: this.repository.findLatestArtifact(run.projectId, run.revision, "storyboard", run.id),
      scenesCsv: this.repository.findLatestArtifact(run.projectId, run.revision, "scenes-csv", run.id),
      shotsCsv: this.repository.findLatestArtifact(run.projectId, run.revision, "shots-csv", run.id),
      packageManifest: this.repository.findLatestArtifact(run.projectId, run.revision, "preproduction-package", run.id),
    };
    if (Object.values(existing).every(Boolean)) {
      this.completeStepFromArtifacts(run, step, Object.values(existing) as VideoArtifact[]);
      return;
    }
    const activeStep = step.status === "pending"
      ? this.repository.transitionStep(step.id, "running", { inputArtifactIds: this.snapshotArtifactIds(run, step.name) }, this.now())
      : this.repository.getStep(run.id, step.name);

    const snapshot = this.loadSnapshot(run);
    const bible = requireValue(snapshot.bible, "story-bible");
    const scenes = requireValue(snapshot.scenes, "scenes");
    const shots = requireValue(snapshot.shots, "shots");
    const continuity = requireValue(snapshot.continuity, "continuity-report");
    const prompts = requireValue(snapshot.prompts, "canonical-prompts");
    const providerPrompts = requireValue(snapshot.providerPrompts, "provider-prompts");
    const generatedAt = activeStep.startedAt ?? run.createdAt;
    const base = this.stagePath(run, step);
    const sources = this.snapshotArtifactIds(run, step.name);
    const projectSnapshotArtifact = existing.projectSnapshot ?? this.artifacts.writeJson({
      projectId: run.projectId,
      revision: run.revision,
      runId: run.id,
      stepId: step.id,
      kind: "project-snapshot",
      relativePath: `${base}/project-snapshot.json`,
      content: {
        schemaVersion: "1",
        project: snapshot.project,
        revision: snapshot.revision,
        generatedAt,
      },
      schemaVersion: "1",
      producer: "video-agent.package-builder@1",
      sourceArtifactIds: [],
    });
    const productionBriefArtifact = existing.productionBrief ?? this.artifacts.writeJson({
      projectId: run.projectId,
      revision: run.revision,
      runId: run.id,
      stepId: step.id,
      kind: "production-brief",
      relativePath: `${base}/production-brief.json`,
      content: snapshot.project.brief,
      schemaVersion: "1",
      producer: "video-agent.package-builder@1",
      sourceArtifactIds: [],
    });
    const sourceDocumentArtifact = existing.sourceDocument ?? this.artifacts.writeText({
      projectId: run.projectId,
      revision: run.revision,
      runId: run.id,
      stepId: step.id,
      kind: "source-document",
      mediaType: "text/plain; charset=utf-8",
      relativePath: `${base}/source.txt`,
      content: snapshot.project.source.text,
      producer: "video-agent.package-builder@1",
      sourceArtifactIds: [],
      metadata: {
        sourceKind: snapshot.project.source.kind,
        sourceName: snapshot.project.source.sourceName ?? "",
        language: snapshot.project.source.language,
        checksum: snapshot.project.source.checksum ?? "",
      },
    });
    const storyboardArtifact = existing.storyboard ?? this.artifacts.writeText({
      projectId: run.projectId,
      revision: run.revision,
      runId: run.id,
      stepId: step.id,
      kind: "storyboard",
      mediaType: "text/markdown; charset=utf-8",
      relativePath: `${base}/storyboard.md`,
      content: renderStoryboardMarkdown({
        project: snapshot.project,
        revision: run.revision,
        bible,
        scenes,
        shots,
        continuity,
        prompts,
        providerPrompts,
        generatedAt,
      }),
      producer: "video-agent.storyboard-renderer@1",
      sourceArtifactIds: sources,
    });
    const scenesArtifact = existing.scenesCsv ?? this.artifacts.writeText({
      projectId: run.projectId,
      revision: run.revision,
      runId: run.id,
      stepId: step.id,
      kind: "scenes-csv",
      mediaType: "text/csv; charset=utf-8",
      relativePath: `${base}/scenes.csv`,
      content: renderScenesCsv(scenes),
      producer: "video-agent.storyboard-renderer@1",
      sourceArtifactIds: sources,
    });
    const shotsArtifact = existing.shotsCsv ?? this.artifacts.writeText({
      projectId: run.projectId,
      revision: run.revision,
      runId: run.id,
      stepId: step.id,
      kind: "shots-csv",
      mediaType: "text/csv; charset=utf-8",
      relativePath: `${base}/shots.csv`,
      content: renderShotsCsv(shots),
      producer: "video-agent.storyboard-renderer@1",
      sourceArtifactIds: sources,
    });
    const packageSources = [...new Set([
      ...sources,
      projectSnapshotArtifact.id,
      productionBriefArtifact.id,
      sourceDocumentArtifact.id,
      storyboardArtifact.id,
      scenesArtifact.id,
      shotsArtifact.id,
    ])];
    const packageArtifact = existing.packageManifest ?? this.artifacts.writeJson({
      projectId: run.projectId,
      revision: run.revision,
      runId: run.id,
      stepId: step.id,
      kind: "preproduction-package",
      relativePath: `${base}/package-manifest.json`,
      content: {
        schemaVersion: "1",
        projectId: run.projectId,
        revision: run.revision,
        runId: run.id,
        generatedAt,
        continuityVerdict: continuity.verdict,
        sceneCount: scenes.length,
        shotCount: shots.length,
        totalShotDurationSec: shots.reduce((sum, shot) => sum + shot.durationSec, 0),
        artifactIds: packageSources,
        renderExecution: "not_started",
        externalCostApprovalRequired: true,
      },
      schemaVersion: "1",
      producer: "video-agent.package-builder@1",
      sourceArtifactIds: packageSources,
    });
    this.completeStepFromArtifacts(run, activeStep, [
      projectSnapshotArtifact,
      productionBriefArtifact,
      sourceDocumentArtifact,
      storyboardArtifact,
      scenesArtifact,
      shotsArtifact,
      packageArtifact,
    ]);
  }

  private writeValidatedAgentArtifact(
    run: WorkflowRun,
    step: WorkflowStep,
    data: StoryAnalysis | StoryBible | SceneSpec[] | ShotSpec[] | ContinuityReport,
    warnings: string[],
    sourceArtifactIds: string[],
  ): VideoArtifact {
    let output = data;
    if (step.name === "continuity_review") {
      const snapshot = this.loadSnapshot(run);
      const deterministic = validateCrossReferences({
        analysis: requireValue(snapshot.analysis, "story-analysis"),
        bible: requireValue(snapshot.bible, "story-bible"),
        scenes: requireValue(snapshot.scenes, "scenes"),
        shots: requireValue(snapshot.shots, "shots"),
        targetDurationSec: snapshot.project.brief.targetDurationSec,
      });
      output = mergeContinuity(data as ContinuityReport, deterministic);
    }
    return this.artifacts.writeJson({
      projectId: run.projectId,
      revision: run.revision,
      runId: run.id,
      stepId: step.id,
      kind: STAGE_ARTIFACT_KIND[step.name as keyof typeof STAGE_ARTIFACT_KIND],
      relativePath: `${this.stagePath(run, step)}/${STAGE_ARTIFACT_KIND[step.name as keyof typeof STAGE_ARTIFACT_KIND]}.json`,
      content: output,
      schemaVersion: "1",
      producer: `video-agent.${step.name}@1`,
      sourceArtifactIds,
      metadata: { warnings, attempt: step.attempt },
    });
  }

  private ensureRawArtifact(run: WorkflowRun, step: WorkflowStep, output: string, usage?: Record<string, unknown>): VideoArtifact {
    const kind = `${step.name}.raw`;
    const existing = this.repository.findLatestArtifact(run.projectId, run.revision, kind, run.id);
    if (existing && existing.metadata.attempt === step.attempt) return existing;
    return this.artifacts.writeText({
      projectId: run.projectId,
      revision: run.revision,
      runId: run.id,
      stepId: step.id,
      kind,
      mediaType: "text/plain; charset=utf-8",
      relativePath: `${this.stagePath(run, step)}/agent-output.raw.txt`,
      content: output,
      producer: "hermes",
      metadata: { attempt: step.attempt, externalRunId: step.externalRunId, usage: usage ?? {} },
    });
  }

  private ensureInvalidArtifact(run: WorkflowRun, step: WorkflowStep, output: string, error: VideoAgentError): VideoArtifact {
    const kind = `${step.name}.invalid`;
    const existing = this.repository.findLatestArtifact(run.projectId, run.revision, kind, run.id);
    if (existing && existing.metadata.attempt === step.attempt) return existing;
    return this.artifacts.writeText({
      projectId: run.projectId,
      revision: run.revision,
      runId: run.id,
      stepId: step.id,
      kind,
      mediaType: "text/plain; charset=utf-8",
      relativePath: `${this.stagePath(run, step)}/agent-output.invalid.txt`,
      content: output,
      producer: "video-agent.validator@1",
      metadata: { attempt: step.attempt, errorCode: error.code, errorMessage: error.message, details: error.details ?? {} },
    });
  }

  private completeStepFromArtifacts(run: WorkflowRun, step: WorkflowStep, artifacts: VideoArtifact[]): void {
    let current = this.repository.getStep(run.id, step.name);
    for (const artifact of artifacts) current = this.repository.appendStepOutputArtifact(current.id, artifact.id, this.now());
    if (current.status === "pending") current = this.repository.transitionStep(current.id, "running", {}, this.now());
    if (current.status === "submitting") current = this.repository.transitionStep(current.id, "running", {}, this.now());
    if (current.status === "running") this.repository.transitionStep(current.id, "succeeded", { errorCode: null, errorMessage: null }, this.now());
    this.repository.advanceRunAfterStep(run.id, step.name, nextPreproductionStage(step.name), this.now());
  }

  private retryOrFail(run: WorkflowRun, step: WorkflowStep, code: string, message: string, retryable: boolean): void {
    const current = this.repository.getStep(run.id, step.name);
    if (current.status !== "failed") this.repository.transitionStep(current.id, "failed", { errorCode: code, errorMessage: message }, this.now());
    if (retryable && current.attempt < current.maxAttempts) {
      this.repository.transitionStep(current.id, "pending", {
        attempt: current.attempt + 1,
        externalRunId: null,
        errorCode: code,
        errorMessage: message,
        startedAt: null,
        finishedAt: null,
      }, this.now());
      this.repository.appendEvent(run.id, current.id, "workflow.step_retry_scheduled", {
        name: current.name,
        previousAttempt: current.attempt,
        nextAttempt: current.attempt + 1,
        code,
      }, this.now());
      return;
    }
    this.repository.failRunAndStep(run.id, current.id, code, message, this.now());
  }

  private loadSnapshot(run: WorkflowRun): PreproductionSnapshot {
    return this.loadSnapshotForProject(run.projectId, run.revision, run.id);
  }

  private loadSnapshotForProject(projectId: string, revisionNumber?: number, runId?: string): PreproductionSnapshot {
    const current = this.repository.getProject(projectId);
    const revision = this.repository.getRevision(projectId, revisionNumber);
    const project: VideoProject = {
      ...current,
      title: revision.title,
      currentRevision: revision.revision,
      source: revision.source,
      brief: revision.brief,
    };
    const read = <T>(kind: string): T | undefined => {
      const artifact = this.repository.findLatestArtifact(project.id, revision.revision, kind, runId);
      return artifact ? this.artifacts.readJson<T>(artifact) : undefined;
    };
    return {
      project,
      revision,
      analysis: read<StoryAnalysis>("story-analysis"),
      bible: read<StoryBible>("story-bible"),
      scenes: read<SceneSpec[]>("scenes"),
      shots: read<ShotSpec[]>("shots"),
      continuity: read<ContinuityReport>("continuity-report"),
      prompts: this.readJsonLinesArtifact(runId, project.id, revision.revision, "canonical-prompts"),
      providerPrompts: this.readJsonLinesArtifact(runId, project.id, revision.revision, "provider-prompts"),
    };
  }

  private readJsonLinesArtifact<T>(runId: string | undefined, projectId: string, revision: number, kind: string): T[] | undefined {
    const artifact = this.repository.findLatestArtifact(projectId, revision, kind, runId);
    if (!artifact) return undefined;
    const text = this.artifacts.readText(artifact).trim();
    if (!text) return [];
    try {
      return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as T);
    } catch (error) {
      throw new VideoAgentError("invalid_input", `Artifact '${artifact.id}' contains invalid JSONL: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private snapshotArtifactIds(run: WorkflowRun, stage: PreproductionStage): string[] {
    const requiredKinds: Record<PreproductionStage, string[]> = {
      story_analysis: [],
      story_bible: ["story-analysis"],
      scene_breakdown: ["story-analysis", "story-bible"],
      shot_planning: ["story-analysis", "story-bible", "scenes"],
      continuity_review: ["story-bible", "scenes", "shots"],
      prompt_compilation: ["story-bible", "scenes", "shots", "continuity-report"],
      storyboard_document: ["story-analysis", "story-bible", "scenes", "shots", "continuity-report", "canonical-prompts", "provider-prompts", "render-manifest"],
      preproduction_approval: ["preproduction-package"],
    };
    return requiredKinds[stage]
      .map((kind) => this.repository.findLatestArtifact(run.projectId, run.revision, kind, run.id)?.id)
      .filter((value): value is string => Boolean(value));
  }

  private requiredArtifact(run: WorkflowRun, kind: string): VideoArtifact {
    const artifact = this.repository.findLatestArtifact(run.projectId, run.revision, kind, run.id);
    if (!artifact) throw new VideoAgentError("artifact_not_found", `Required artifact '${kind}' is missing from run '${run.id}'.`);
    return artifact;
  }

  private stagePath(run: WorkflowRun, step: WorkflowStep): string {
    return `revisions/${run.revision}/runs/${run.id}/${step.name}/attempt-${step.attempt}`;
  }

  private toRunView(detail: WorkflowRunDetail): VideoRunView {
    return {
      ...detail,
      artifacts: this.repository.listArtifacts(detail.run.projectId, detail.run.revision).filter((artifact) => artifact.runId === detail.run.id),
    };
  }
}

export function startVideoWorkflowScheduler(
  coordinator: VideoWorkflowCoordinator,
  options: { intervalMs?: number; batchSize?: number; onError?: (error: unknown) => void } = {},
): () => void {
  const intervalMs = Math.max(250, options.intervalMs ?? 1_500);
  const batchSize = Math.max(1, Math.min(20, options.batchSize ?? 5));
  let active = false;
  const tick = async () => {
    if (active) return;
    active = true;
    try {
      await coordinator.tick(batchSize);
    } catch (error) {
      options.onError?.(error);
    } finally {
      active = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  (timer as unknown as { unref?: () => void }).unref?.();
  queueMicrotask(() => void tick());
  return () => clearInterval(timer);
}

function mergeContinuity(agent: ContinuityReport, deterministic: ContinuityIssue[]): ContinuityReport {
  const byKey = new Map<string, ContinuityIssue>();
  for (const item of [...agent.issues, ...deterministic]) {
    const key = `${item.severity}:${item.scope}:${item.sceneId ?? ""}:${item.shotId ?? ""}:${item.field ?? ""}:${item.message}`;
    if (!byKey.has(key)) byKey.set(key, item);
  }
  const issues = [...byKey.values()];
  const errors = issues.filter((item) => item.severity === "error").length;
  const warnings = issues.filter((item) => item.severity === "warning").length;
  const verdict: ContinuityReport["verdict"] = errors ? "fail" : warnings || agent.verdict === "pass_with_warnings" ? "pass_with_warnings" : "pass";
  return {
    verdict,
    summary: `${agent.summary} Deterministic validation added ${deterministic.length} finding(s); ${errors} error(s), ${warnings} warning(s) in the merged report.`,
    issues,
    checkedRules: [...new Set([...agent.checkedRules, "deterministic ID cross-references", "shot duration total", "scene shot coverage"])],
  };
}

function requireValue<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new VideoAgentError("workflow_not_ready", `Required '${label}' data is missing.`);
  return value;
}
