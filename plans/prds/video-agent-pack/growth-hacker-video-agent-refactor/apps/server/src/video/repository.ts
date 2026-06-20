import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import {
  PREPRODUCTION_STAGES,
  VideoAgentError,
  assertRunTransition,
  assertStepTransition,
  stageOrdinal,
  stageProgress,
} from "@growth-hacker/video-agent";
import type {
  CreateVideoProjectInput,
  PreproductionStage,
  ReviseVideoProjectInput,
  VideoArtifact,
  VideoProject,
  VideoRevision,
  WorkflowApproval,
  WorkflowEvent,
  WorkflowRun,
  WorkflowStatus,
  WorkflowStep,
  WorkflowStepStatus,
} from "@growth-hacker/video-agent";
import type { AppConfig } from "../config";

interface ProjectRow {
  id: string;
  title: string;
  status: string;
  current_revision: number;
  source_json: string;
  brief_json: string;
  created_at: number;
  updated_at: number;
}

interface RevisionRow {
  project_id: string;
  revision: number;
  title: string;
  source_json: string;
  brief_json: string;
  reason: string | null;
  created_at: number;
}

interface RunRow {
  id: string;
  definition: string;
  project_id: string;
  revision: number;
  status: string;
  current_step: string | null;
  progress: number;
  idempotency_key: string | null;
  requested_agent_id: string | null;
  requested_provider: string | null;
  requested_model: string | null;
  error_code: string | null;
  error_message: string | null;
  lease_owner: string | null;
  lease_expires_at: number | null;
  created_at: number;
  updated_at: number;
  finished_at: number | null;
}

interface StepRow {
  id: string;
  run_id: string;
  name: string;
  ordinal: number;
  status: string;
  attempt: number;
  max_attempts: number;
  external_run_id: string | null;
  input_artifact_ids_json: string;
  output_artifact_ids_json: string;
  error_code: string | null;
  error_message: string | null;
  started_at: number | null;
  finished_at: number | null;
  updated_at: number;
}

interface ArtifactRow {
  id: string;
  project_id: string;
  revision: number;
  run_id: string | null;
  step_id: string | null;
  kind: string;
  media_type: string;
  relative_path: string;
  byte_size: number;
  sha256: string;
  schema_version: string | null;
  producer: string;
  source_artifact_ids_json: string;
  metadata_json: string;
  created_at: number;
}

interface EventRow {
  id: number;
  run_id: string;
  step_id: string | null;
  type: string;
  payload_json: string;
  created_at: number;
}

interface ApprovalRow {
  id: string;
  run_id: string;
  project_id: string;
  revision: number;
  risk: string;
  status: string;
  summary: string;
  estimated_cost_json: string | null;
  requested_by: string;
  decided_by: string | null;
  decision_note: string | null;
  created_at: number;
  decided_at: number | null;
}

export interface CreatePreproductionRunInput {
  projectId: string;
  revision?: number;
  idempotencyKey?: string;
  agentId?: string;
  provider?: string;
  model?: string;
  maxAttempts?: number;
}

export interface WorkflowRunDetail {
  run: WorkflowRun;
  steps: WorkflowStep[];
  approval?: WorkflowApproval;
}

export interface ArtifactInsert {
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
  sourceArtifactIds?: string[];
  metadata?: Record<string, unknown>;
  createdAt?: number;
}

export class VideoRepository {
  readonly db: Database;

  constructor(config: AppConfig) {
    const root = join(config.growthRoot, "dashboard");
    mkdirSync(root, { recursive: true });
    this.db = new Database(join(root, "video-studio.sqlite"), { create: true });
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  createProject(input: CreateVideoProjectInput, now = Date.now()): { project: VideoProject; revision: VideoRevision } {
    const project: VideoProject = {
      id: createId("vprj"),
      title: input.title,
      status: "draft",
      currentRevision: 1,
      source: input.source,
      brief: input.brief,
      createdAt: now,
      updatedAt: now,
    };
    const revision: VideoRevision = {
      projectId: project.id,
      revision: 1,
      title: project.title,
      source: project.source,
      brief: project.brief,
      reason: "Initial project creation",
      createdAt: now,
    };
    const transaction = this.db.transaction(() => {
      this.db.query(`
        insert into video_projects
          (id, title, status, current_revision, source_json, brief_json, created_at, updated_at)
        values
          ($id, $title, $status, $revision, $sourceJson, $briefJson, $createdAt, $updatedAt)
      `).run(projectParams(project));
      this.insertRevision(revision);
    });
    transaction();
    return { project, revision };
  }

  listProjects(limit = 100): VideoProject[] {
    const normalizedLimit = Math.max(1, Math.min(1_000, Math.floor(limit)));
    return this.db.query<ProjectRow, { $limit: number }>(`
      select id, title, status, current_revision, source_json, brief_json, created_at, updated_at
      from video_projects
      order by updated_at desc
      limit $limit
    `).all({ $limit: normalizedLimit }).map(mapProject);
  }

  getProject(projectId: string): VideoProject {
    const row = this.db.query<ProjectRow, { $id: string }>(`
      select id, title, status, current_revision, source_json, brief_json, created_at, updated_at
      from video_projects where id = $id
    `).get({ $id: normalizeId(projectId) });
    if (!row) throw new VideoAgentError("project_not_found", `Video project '${projectId}' was not found.`);
    return mapProject(row);
  }

  getRevision(projectId: string, revision?: number): VideoRevision {
    const project = this.getProject(projectId);
    const target = revision ?? project.currentRevision;
    const row = this.db.query<RevisionRow, { $projectId: string; $revision: number }>(`
      select project_id, revision, title, source_json, brief_json, reason, created_at
      from video_revisions
      where project_id = $projectId and revision = $revision
    `).get({ $projectId: project.id, $revision: target });
    if (!row) throw new VideoAgentError("revision_conflict", `Revision ${target} does not exist for '${project.id}'.`);
    return mapRevision(row);
  }

  reviseProject(projectId: string, input: ReviseVideoProjectInput, now = Date.now()): { project: VideoProject; revision: VideoRevision } {
    let result: { project: VideoProject; revision: VideoRevision } | undefined;
    const transaction = this.db.transaction(() => {
      const current = this.getProject(projectId);
      if (current.currentRevision !== input.expectedRevision) {
        throw new VideoAgentError(
          "revision_conflict",
          `Expected revision ${input.expectedRevision} but current revision is ${current.currentRevision}.`,
          { details: { expectedRevision: input.expectedRevision, currentRevision: current.currentRevision } },
        );
      }
      const revisionNumber = current.currentRevision + 1;
      const project: VideoProject = {
        ...current,
        title: input.title ?? current.title,
        source: input.source ?? current.source,
        brief: input.brief ?? current.brief,
        currentRevision: revisionNumber,
        status: "draft",
        updatedAt: now,
      };
      const revision: VideoRevision = {
        projectId: project.id,
        revision: revisionNumber,
        title: project.title,
        source: project.source,
        brief: project.brief,
        reason: input.reason,
        createdAt: now,
      };
      const update = this.db.query(`
        update video_projects
        set title = $title,
            status = $status,
            current_revision = $revision,
            source_json = $sourceJson,
            brief_json = $briefJson,
            updated_at = $updatedAt
        where id = $id and current_revision = $expectedRevision
      `).run({
        $id: project.id,
        $title: project.title,
        $status: project.status,
        $revision: project.currentRevision,
        $sourceJson: JSON.stringify(project.source),
        $briefJson: JSON.stringify(project.brief),
        $updatedAt: project.updatedAt,
        $expectedRevision: input.expectedRevision,
      });
      if (update.changes !== 1) {
        throw new VideoAgentError("revision_conflict", `Video project '${project.id}' changed concurrently.`, {
          status: 409,
          details: { expectedRevision: input.expectedRevision },
        });
      }
      this.insertRevision(revision);
      result = { project, revision };
    });
    transaction();
    return result!;
  }

  updateProjectStatus(projectId: string, status: VideoProject["status"], now = Date.now()): VideoProject {
    const project = this.getProject(projectId);
    this.db.query(`update video_projects set status = $status, updated_at = $updatedAt where id = $id`).run({
      $id: project.id,
      $status: status,
      $updatedAt: now,
    });
    return { ...project, status, updatedAt: now };
  }

  createPreproductionRun(input: CreatePreproductionRunInput, now = Date.now()): WorkflowRunDetail {
    const project = this.getProject(input.projectId);
    const revision = input.revision ?? project.currentRevision;
    this.getRevision(project.id, revision);
    const idempotencyKey = normalizeOptionalKey(input.idempotencyKey);
    const requestedAgentId = normalizeOptionalKey(input.agentId);
    const requestedProvider = normalizeOptionalKey(input.provider);
    const requestedModel = normalizeOptionalKey(input.model);
    const maxAttempts = Math.max(1, Math.min(5, input.maxAttempts ?? 3));
    if (idempotencyKey) {
      const existing = this.findIdempotentRun(project.id, revision, idempotencyKey);
      if (existing) {
        const detail = this.getRunDetail(existing);
        const sameRequest = detail.run.requestedAgentId === requestedAgentId
          && detail.run.requestedProvider === requestedProvider
          && detail.run.requestedModel === requestedModel
          && detail.steps.every((step) => step.maxAttempts === maxAttempts);
        if (!sameRequest) {
          throw new VideoAgentError("idempotency_conflict", "The idempotency key was already used with different workflow options.", {
            details: { runId: existing, projectId: project.id, revision },
          });
        }
        return detail;
      }
    }

    const active = this.db.query<{ id: string }, { $projectId: string; $revision: number }>(`
      select id from video_workflow_runs
      where project_id = $projectId and revision = $revision
        and definition = 'video.preproduction.v1'
        and status in ('queued', 'running', 'waiting_approval')
      order by created_at desc limit 1
    `).get({ $projectId: project.id, $revision: revision });
    if (active) {
      throw new VideoAgentError("idempotency_conflict", "An active preproduction run already exists for this revision.", {
        details: { runId: active.id, projectId: project.id, revision },
      });
    }

    const runId = createId("vrun");
    const run: WorkflowRun = {
      id: runId,
      definition: "video.preproduction.v1",
      projectId: project.id,
      revision,
      status: "queued",
      currentStep: PREPRODUCTION_STAGES[0],
      progress: 0,
      idempotencyKey,
      requestedAgentId,
      requestedProvider,
      requestedModel,
      createdAt: now,
      updatedAt: now,
    };
    const steps = PREPRODUCTION_STAGES.map((name): WorkflowStep => ({
      id: createId("vstep"),
      runId,
      name,
      ordinal: stageOrdinal(name),
      status: "pending",
      attempt: 1,
      maxAttempts,
      inputArtifactIds: [],
      outputArtifactIds: [],
      updatedAt: now,
    }));

    const transaction = this.db.transaction(() => {
      this.db.query(`
        insert into video_workflow_runs
          (id, definition, project_id, revision, status, current_step, progress,
           idempotency_key, requested_agent_id, requested_provider, requested_model,
           created_at, updated_at)
        values
          ($id, $definition, $projectId, $revision, $status, $currentStep, $progress,
           $idempotencyKey, $agentId, $provider, $model, $createdAt, $updatedAt)
      `).run({
        $id: run.id,
        $definition: run.definition,
        $projectId: run.projectId,
        $revision: run.revision,
        $status: run.status,
        $currentStep: run.currentStep ?? null,
        $progress: run.progress,
        $idempotencyKey: run.idempotencyKey ?? null,
        $agentId: run.requestedAgentId ?? null,
        $provider: run.requestedProvider ?? null,
        $model: run.requestedModel ?? null,
        $createdAt: now,
        $updatedAt: now,
      });
      for (const step of steps) this.insertStep(step);
      if (idempotencyKey) {
        this.db.query(`
          insert into video_idempotency_keys(scope, key, run_id, created_at)
          values($scope, $key, $runId, $createdAt)
        `).run({ $scope: idempotencyScope(project.id, revision), $key: idempotencyKey, $runId: runId, $createdAt: now });
      }
      this.setProjectStatusForRevision(project.id, revision, "in_preproduction", now);
      this.insertEvent(runId, undefined, "workflow.created", { definition: run.definition, revision }, now);
    });
    transaction();
    return { run, steps };
  }

  getRun(runId: string): WorkflowRun {
    const row = this.db.query<RunRow, { $id: string }>(`
      select id, definition, project_id, revision, status, current_step, progress,
             idempotency_key, requested_agent_id, requested_provider, requested_model,
             error_code, error_message, lease_owner, lease_expires_at,
             created_at, updated_at, finished_at
      from video_workflow_runs where id = $id
    `).get({ $id: normalizeId(runId) });
    if (!row) throw new VideoAgentError("run_not_found", `Workflow run '${runId}' was not found.`);
    return mapRun(row);
  }

  getRunDetail(runId: string): WorkflowRunDetail {
    const run = this.getRun(runId);
    const steps = this.listSteps(run.id);
    const approval = this.getApprovalForRun(run.id, false);
    return { run, steps, approval };
  }

  findLatestPreproductionRun(projectId: string, revision?: number): WorkflowRun | undefined {
    const project = this.getProject(projectId);
    const targetRevision = revision ?? project.currentRevision;
    const row = this.db.query<RunRow, { $projectId: string; $revision: number }>(`
      select id, definition, project_id, revision, status, current_step, progress,
             idempotency_key, requested_agent_id, requested_provider, requested_model,
             error_code, error_message, lease_owner, lease_expires_at,
             created_at, updated_at, finished_at
      from video_workflow_runs
      where project_id = $projectId and revision = $revision and definition = 'video.preproduction.v1'
      order by created_at desc, id desc
      limit 1
    `).get({ $projectId: project.id, $revision: targetRevision });
    return row ? mapRun(row) : undefined;
  }

  listSteps(runId: string): WorkflowStep[] {
    return this.db.query<StepRow, { $runId: string }>(`
      select id, run_id, name, ordinal, status, attempt, max_attempts, external_run_id,
             input_artifact_ids_json, output_artifact_ids_json, error_code, error_message,
             started_at, finished_at, updated_at
      from video_workflow_steps where run_id = $runId order by ordinal asc
    `).all({ $runId: normalizeId(runId) }).map(mapStep);
  }

  getStep(runId: string, name: PreproductionStage): WorkflowStep {
    const row = this.db.query<StepRow, { $runId: string; $name: string }>(`
      select id, run_id, name, ordinal, status, attempt, max_attempts, external_run_id,
             input_artifact_ids_json, output_artifact_ids_json, error_code, error_message,
             started_at, finished_at, updated_at
      from video_workflow_steps where run_id = $runId and name = $name
    `).get({ $runId: normalizeId(runId), $name: name });
    if (!row) throw new VideoAgentError("step_not_found", `Step '${name}' was not found in run '${runId}'.`);
    return mapStep(row);
  }

  listRunnableRunIds(limit = 10, now = Date.now()): string[] {
    return this.db.query<{ id: string }, { $limit: number; $now: number }>(`
      select id from video_workflow_runs
      where status in ('queued', 'running')
        and (lease_expires_at is null or lease_expires_at < $now)
      order by updated_at asc
      limit $limit
    `).all({ $limit: Math.max(1, Math.min(100, limit)), $now: now }).map((row) => row.id);
  }

  tryAcquireLease(runId: string, owner: string, leaseMs: number, now = Date.now()): boolean {
    const result = this.db.query(`
      update video_workflow_runs
      set lease_owner = $owner, lease_expires_at = $expiresAt
      where id = $id
        and status in ('queued', 'running')
        and (lease_expires_at is null or lease_expires_at < $now)
    `).run({ $id: normalizeId(runId), $owner: owner, $expiresAt: now + leaseMs, $now: now });
    return result.changes === 1;
  }

  renewLease(runId: string, owner: string, leaseMs: number, now = Date.now()): boolean {
    const result = this.db.query(`
      update video_workflow_runs
      set lease_expires_at = $expiresAt
      where id = $id and lease_owner = $owner and status in ('queued', 'running')
    `).run({
      $id: normalizeId(runId),
      $owner: owner,
      $expiresAt: now + leaseMs,
    });
    return result.changes === 1;
  }

  releaseLease(runId: string, owner: string): void {
    this.db.query(`
      update video_workflow_runs set lease_owner = null, lease_expires_at = null
      where id = $id and lease_owner = $owner
    `).run({ $id: normalizeId(runId), $owner: owner });
  }

  transitionRun(runId: string, to: WorkflowStatus, patch: {
    currentStep?: PreproductionStage | null;
    progress?: number;
    errorCode?: string | null;
    errorMessage?: string | null;
    finishedAt?: number | null;
  } = {}, now = Date.now()): WorkflowRun {
    const current = this.getRun(runId);
    assertRunTransition(current.status, to);
    const finishedAt = patch.finishedAt !== undefined
      ? patch.finishedAt
      : (to === "succeeded" || to === "failed" || to === "cancelled" ? now : current.finishedAt ?? null);
    const result = this.db.query(`
      update video_workflow_runs
      set status = $status,
          current_step = $currentStep,
          progress = $progress,
          error_code = $errorCode,
          error_message = $errorMessage,
          updated_at = $updatedAt,
          finished_at = $finishedAt
      where id = $id and status = $expectedStatus
    `).run({
      $id: current.id,
      $expectedStatus: current.status,
      $status: to,
      $currentStep: patch.currentStep === undefined ? current.currentStep ?? null : patch.currentStep,
      $progress: patch.progress ?? current.progress,
      $errorCode: patch.errorCode === undefined ? current.errorCode ?? null : patch.errorCode,
      $errorMessage: patch.errorMessage === undefined ? current.errorMessage ?? null : patch.errorMessage,
      $updatedAt: now,
      $finishedAt: finishedAt,
    });
    if (result.changes !== 1) {
      throw new VideoAgentError("invalid_state_transition", `Workflow run '${current.id}' changed concurrently.`, {
        status: 409,
        details: { expectedStatus: current.status, requestedStatus: to },
      });
    }
    this.insertEvent(current.id, undefined, "workflow.status_changed", { from: current.status, to }, now);
    return this.getRun(current.id);
  }

  transitionStep(stepId: string, to: WorkflowStepStatus, patch: {
    externalRunId?: string | null;
    inputArtifactIds?: string[];
    outputArtifactIds?: string[];
    errorCode?: string | null;
    errorMessage?: string | null;
    attempt?: number;
    startedAt?: number | null;
    finishedAt?: number | null;
  } = {}, now = Date.now()): WorkflowStep {
    const current = this.getStepById(stepId);
    assertStepTransition(current.status, to);
    const startedAt = patch.startedAt !== undefined
      ? patch.startedAt
      : ((to === "submitting" || to === "running") && !current.startedAt ? now : current.startedAt ?? null);
    const finishedAt = patch.finishedAt !== undefined
      ? patch.finishedAt
      : ((to === "succeeded" || to === "failed" || to === "skipped" || to === "cancelled") ? now : current.finishedAt ?? null);
    const result = this.db.query(`
      update video_workflow_steps
      set status = $status,
          attempt = $attempt,
          external_run_id = $externalRunId,
          input_artifact_ids_json = $inputArtifactIds,
          output_artifact_ids_json = $outputArtifactIds,
          error_code = $errorCode,
          error_message = $errorMessage,
          started_at = $startedAt,
          finished_at = $finishedAt,
          updated_at = $updatedAt
      where id = $id and status = $expectedStatus
    `).run({
      $id: current.id,
      $expectedStatus: current.status,
      $status: to,
      $attempt: patch.attempt ?? current.attempt,
      $externalRunId: patch.externalRunId === undefined ? current.externalRunId ?? null : patch.externalRunId,
      $inputArtifactIds: JSON.stringify(patch.inputArtifactIds ?? current.inputArtifactIds),
      $outputArtifactIds: JSON.stringify(patch.outputArtifactIds ?? current.outputArtifactIds),
      $errorCode: patch.errorCode === undefined ? current.errorCode ?? null : patch.errorCode,
      $errorMessage: patch.errorMessage === undefined ? current.errorMessage ?? null : patch.errorMessage,
      $startedAt: startedAt,
      $finishedAt: finishedAt,
      $updatedAt: now,
    });
    if (result.changes !== 1) {
      throw new VideoAgentError("invalid_state_transition", `Workflow step '${current.id}' changed concurrently.`, {
        status: 409,
        details: { expectedStatus: current.status, requestedStatus: to },
      });
    }
    this.insertEvent(current.runId, current.id, "workflow.step_status_changed", { name: current.name, from: current.status, to, attempt: patch.attempt ?? current.attempt }, now);
    return this.getStepById(current.id);
  }

  advanceRunAfterStep(runId: string, stage: PreproductionStage, nextStage: PreproductionStage | undefined, now = Date.now()): WorkflowRun {
    const run = this.getRun(runId);
    if (run.status !== "running") throw new VideoAgentError("invalid_state_transition", `Run '${run.id}' is not running.`);
    const result = this.db.query(`
      update video_workflow_runs
      set current_step = $currentStep, progress = $progress, updated_at = $updatedAt
      where id = $id and status = 'running' and current_step = $expectedStep
    `).run({
      $id: run.id,
      $expectedStep: stage,
      $currentStep: nextStage ?? null,
      $progress: stageProgress(stage, true),
      $updatedAt: now,
    });
    if (result.changes !== 1) {
      throw new VideoAgentError("invalid_state_transition", `Workflow run '${run.id}' could not advance from '${stage}'.`, {
        status: 409,
        details: { expectedStep: stage, actualStep: run.currentStep },
      });
    }
    this.insertEvent(run.id, undefined, "workflow.advanced", { completedStage: stage, nextStage }, now);
    return this.getRun(run.id);
  }

  retryFailedStep(runId: string, stage?: PreproductionStage, now = Date.now()): WorkflowRunDetail {
    const detail = this.getRunDetail(runId);
    if (detail.run.status !== "failed") throw new VideoAgentError("workflow_not_ready", "Only a failed workflow can be retried.");
    const step = stage
      ? detail.steps.find((item) => item.name === stage)
      : [...detail.steps].reverse().find((item) => item.status === "failed");
    if (!step) throw new VideoAgentError("step_not_found", "No failed workflow step is available to retry.");
    if (step.attempt >= step.maxAttempts) {
      throw new VideoAgentError("workflow_terminal", `Step '${step.name}' exhausted ${step.maxAttempts} attempts.`);
    }
    const transaction = this.db.transaction(() => {
      this.transitionStep(step.id, "pending", {
        attempt: step.attempt + 1,
        externalRunId: null,
        errorCode: null,
        errorMessage: step.errorMessage ?? null,
        startedAt: null,
        finishedAt: null,
      }, now);
      this.transitionRun(detail.run.id, "running", {
        currentStep: step.name,
        progress: stageProgress(step.name, false),
        errorCode: null,
        errorMessage: null,
        finishedAt: null,
      }, now);
      this.setProjectStatusForRevision(detail.run.projectId, detail.run.revision, "in_preproduction", now);
    });
    transaction();
    return this.getRunDetail(detail.run.id);
  }

  failRun(
    runId: string,
    code: string,
    message: string,
    currentStep?: PreproductionStage,
    now = Date.now(),
  ): WorkflowRunDetail {
    const transaction = this.db.transaction(() => {
      const run = this.getRun(runId);
      if (run.status !== "failed") {
        this.transitionRun(run.id, "failed", {
          currentStep: currentStep ?? run.currentStep ?? null,
          errorCode: code,
          errorMessage: message,
        }, now);
      }
      this.setProjectStatusForRevision(run.projectId, run.revision, "draft", now);
    });
    transaction();
    return this.getRunDetail(runId);
  }

  failRunAndStep(runId: string, stepId: string, code: string, message: string, now = Date.now()): WorkflowRunDetail {
    const transaction = this.db.transaction(() => {
      const step = this.getStepById(stepId);
      if (step.status !== "failed") this.transitionStep(step.id, "failed", { errorCode: code, errorMessage: message }, now);
      const run = this.getRun(runId);
      if (run.status !== "failed") this.transitionRun(run.id, "failed", { currentStep: step.name, errorCode: code, errorMessage: message }, now);
      this.setProjectStatusForRevision(run.projectId, run.revision, "draft", now);
    });
    transaction();
    return this.getRunDetail(runId);
  }

  cancelRun(runId: string, now = Date.now()): WorkflowRunDetail {
    const transaction = this.db.transaction(() => {
      const run = this.getRun(runId);
      if (run.status === "succeeded" || run.status === "cancelled") return;
      for (const step of this.listSteps(run.id)) {
        if (step.status === "pending" || step.status === "submitting" || step.status === "running" || step.status === "failed") {
          this.transitionStep(step.id, "cancelled", {}, now);
        }
      }
      this.transitionRun(run.id, "cancelled", { errorCode: "cancelled_by_operator", errorMessage: "Workflow cancelled by operator." }, now);
      this.setProjectStatusForRevision(run.projectId, run.revision, "draft", now);
    });
    transaction();
    return this.getRunDetail(runId);
  }

  requestPreproductionApproval(runId: string, requestedBy: string, now = Date.now()): WorkflowApproval {
    const run = this.getRun(runId);
    const step = this.getStep(run.id, "preproduction_approval");
    const existing = this.getApprovalForRun(run.id, false);
    if (existing?.status === "pending") return existing;
    if (run.status !== "running" || step.status !== "pending") {
      throw new VideoAgentError("workflow_not_ready", "Workflow is not ready for preproduction approval.");
    }
    const approval: WorkflowApproval = {
      id: createId("vapr"),
      runId: run.id,
      projectId: run.projectId,
      revision: run.revision,
      risk: "local_write",
      status: "pending",
      summary: "Approve the generated preproduction package and mark the project ready for render planning.",
      requestedBy: requestedBy || "video-workflow",
      createdAt: now,
    };
    const transaction = this.db.transaction(() => {
      this.db.query(`
        insert into video_approvals
          (id, run_id, project_id, revision, risk, status, summary, requested_by, created_at)
        values
          ($id, $runId, $projectId, $revision, $risk, $status, $summary, $requestedBy, $createdAt)
      `).run({
        $id: approval.id,
        $runId: approval.runId,
        $projectId: approval.projectId,
        $revision: approval.revision,
        $risk: approval.risk,
        $status: approval.status,
        $summary: approval.summary,
        $requestedBy: approval.requestedBy,
        $createdAt: approval.createdAt,
      });
      this.transitionStep(step.id, "running", {}, now);
      this.transitionRun(run.id, "waiting_approval", { currentStep: "preproduction_approval", progress: stageProgress("preproduction_approval", false) }, now);
      this.insertEvent(run.id, step.id, "approval.requested", { approvalId: approval.id, risk: approval.risk }, now);
    });
    transaction();
    return approval;
  }

  decidePreproductionApproval(input: {
    runId: string;
    decision: "approve" | "reject";
    expectedRevision: number;
    decidedBy: string;
    note?: string;
  }, now = Date.now()): WorkflowRunDetail {
    const transaction = this.db.transaction(() => {
      const run = this.getRun(input.runId);
      const project = this.getProject(run.projectId);
      if (run.revision !== input.expectedRevision || project.currentRevision !== input.expectedRevision) {
        throw new VideoAgentError(
          "revision_conflict",
          `Approval targets revision ${input.expectedRevision}, while run/project revisions are ${run.revision}/${project.currentRevision}.`,
          { status: 409, details: { expectedRevision: input.expectedRevision, runRevision: run.revision, currentRevision: project.currentRevision } },
        );
      }
      if (run.status !== "waiting_approval") throw new VideoAgentError("workflow_not_ready", "Workflow is not waiting for approval.");
      const approval = this.getApprovalForRun(run.id, true)!;
      const step = this.getStep(run.id, "preproduction_approval");
      const status = input.decision === "approve" ? "approved" : "rejected";
      const decisionResult = this.db.query(`
        update video_approvals
        set status = $status, decided_by = $decidedBy, decision_note = $note, decided_at = $decidedAt
        where id = $id and status = 'pending'
      `).run({
        $id: approval.id,
        $status: status,
        $decidedBy: input.decidedBy,
        $note: input.note ?? null,
        $decidedAt: now,
      });
      if (decisionResult.changes !== 1) {
        throw new VideoAgentError("invalid_state_transition", `Approval '${approval.id}' was already decided.`, { status: 409 });
      }
      if (input.decision === "approve") {
        this.transitionStep(step.id, "succeeded", {}, now);
        this.transitionRun(run.id, "succeeded", { currentStep: null, progress: 100, errorCode: null, errorMessage: null }, now);
        this.setProjectStatusForRevision(run.projectId, run.revision, "ready_for_render", now);
      } else {
        this.transitionStep(step.id, "failed", { errorCode: "approval_rejected", errorMessage: input.note ?? "Preproduction approval rejected." }, now);
        this.transitionRun(run.id, "failed", { errorCode: "approval_rejected", errorMessage: input.note ?? "Preproduction approval rejected." }, now);
        this.setProjectStatusForRevision(run.projectId, run.revision, "draft", now);
      }
      this.insertEvent(run.id, step.id, "approval.decided", { approvalId: approval.id, decision: input.decision, decidedBy: input.decidedBy }, now);
    });
    transaction();
    return this.getRunDetail(input.runId);
  }

  insertArtifact(input: ArtifactInsert): VideoArtifact {
    const artifact: VideoArtifact = {
      id: input.id,
      projectId: input.projectId,
      revision: input.revision,
      runId: input.runId,
      stepId: input.stepId,
      kind: input.kind,
      mediaType: input.mediaType,
      relativePath: input.relativePath,
      byteSize: input.byteSize,
      sha256: input.sha256,
      schemaVersion: input.schemaVersion,
      producer: input.producer,
      sourceArtifactIds: input.sourceArtifactIds ?? [],
      metadata: input.metadata ?? {},
      createdAt: input.createdAt ?? Date.now(),
    };
    const transaction = this.db.transaction(() => {
      this.db.query(`
        insert into video_artifacts
          (id, project_id, revision, run_id, step_id, kind, media_type, relative_path,
           byte_size, sha256, schema_version, producer, source_artifact_ids_json, metadata_json, created_at)
        values
          ($id, $projectId, $revision, $runId, $stepId, $kind, $mediaType, $relativePath,
           $byteSize, $sha256, $schemaVersion, $producer, $sourceArtifactIds, $metadata, $createdAt)
      `).run({
        $id: artifact.id,
        $projectId: artifact.projectId,
        $revision: artifact.revision,
        $runId: artifact.runId ?? null,
        $stepId: artifact.stepId ?? null,
        $kind: artifact.kind,
        $mediaType: artifact.mediaType,
        $relativePath: artifact.relativePath,
        $byteSize: artifact.byteSize,
        $sha256: artifact.sha256,
        $schemaVersion: artifact.schemaVersion ?? null,
        $producer: artifact.producer,
        $sourceArtifactIds: JSON.stringify(artifact.sourceArtifactIds),
        $metadata: JSON.stringify(artifact.metadata),
        $createdAt: artifact.createdAt,
      });
      if (artifact.runId) {
        this.insertEvent(artifact.runId, artifact.stepId, "artifact.created", {
          artifactId: artifact.id,
          kind: artifact.kind,
        }, artifact.createdAt);
      }
    });
    transaction();
    return artifact;
  }

  listArtifacts(projectId: string, revision?: number): VideoArtifact[] {
    const project = this.getProject(projectId);
    const targetRevision = revision ?? project.currentRevision;
    return this.db.query<ArtifactRow, { $projectId: string; $revision: number }>(`
      select id, project_id, revision, run_id, step_id, kind, media_type, relative_path,
             byte_size, sha256, schema_version, producer, source_artifact_ids_json, metadata_json, created_at
      from video_artifacts
      where project_id = $projectId and revision = $revision
      order by created_at asc, id asc
    `).all({ $projectId: project.id, $revision: targetRevision }).map(mapArtifact);
  }

  getArtifact(artifactId: string): VideoArtifact {
    const row = this.db.query<ArtifactRow, { $id: string }>(`
      select id, project_id, revision, run_id, step_id, kind, media_type, relative_path,
             byte_size, sha256, schema_version, producer, source_artifact_ids_json, metadata_json, created_at
      from video_artifacts where id = $id
    `).get({ $id: normalizeId(artifactId) });
    if (!row) throw new VideoAgentError("artifact_not_found", `Artifact '${artifactId}' was not found.`);
    return mapArtifact(row);
  }

  findArtifactByRelativePath(projectId: string, revision: number, relativePath: string): VideoArtifact | undefined {
    const row = this.db.query<ArtifactRow, { $projectId: string; $revision: number; $relativePath: string }>(`
      select id, project_id, revision, run_id, step_id, kind, media_type, relative_path,
             byte_size, sha256, schema_version, producer, source_artifact_ids_json, metadata_json, created_at
      from video_artifacts
      where project_id = $projectId and revision = $revision and relative_path = $relativePath
      limit 1
    `).get({
      $projectId: normalizeId(projectId),
      $revision: revision,
      $relativePath: relativePath,
    });
    return row ? mapArtifact(row) : undefined;
  }

  findLatestArtifact(projectId: string, revision: number, kind: string, runId?: string): VideoArtifact | undefined {
    const baseParams = { $projectId: normalizeId(projectId), $revision: revision, $kind: kind };
    const select = `
      select id, project_id, revision, run_id, step_id, kind, media_type, relative_path,
             byte_size, sha256, schema_version, producer, source_artifact_ids_json, metadata_json, created_at
      from video_artifacts
      where project_id = $projectId and revision = $revision and kind = $kind
    `;
    const row = runId
      ? this.db.query<ArtifactRow, typeof baseParams & { $runId: string }>(`${select} and run_id = $runId order by created_at desc, id desc limit 1`).get({
          ...baseParams,
          $runId: normalizeId(runId),
        })
      : this.db.query<ArtifactRow, typeof baseParams>(`${select} order by created_at desc, id desc limit 1`).get(baseParams);
    return row ? mapArtifact(row) : undefined;
  }

  appendStepOutputArtifact(stepId: string, artifactId: string, now = Date.now()): WorkflowStep {
    const step = this.getStepById(stepId);
    const outputArtifactIds = [...new Set([...step.outputArtifactIds, normalizeId(artifactId)])];
    this.db.query(`
      update video_workflow_steps set output_artifact_ids_json = $ids, updated_at = $updatedAt where id = $id
    `).run({ $id: step.id, $ids: JSON.stringify(outputArtifactIds), $updatedAt: now });
    return this.getStepById(step.id);
  }

  listEvents(runId: string, afterId = 0, limit = 500): WorkflowEvent[] {
    return this.db.query<EventRow, { $runId: string; $afterId: number; $limit: number }>(`
      select id, run_id, step_id, type, payload_json, created_at
      from video_workflow_events
      where run_id = $runId and id > $afterId
      order by id asc limit $limit
    `).all({ $runId: normalizeId(runId), $afterId: Math.max(0, afterId), $limit: Math.max(1, Math.min(2_000, limit)) }).map(mapEvent);
  }

  appendEvent(runId: string, stepId: string | undefined, type: string, payload: Record<string, unknown>, now = Date.now()): void {
    this.insertEvent(runId, stepId, type, payload, now);
  }

  getApprovalForRun(runId: string, required = true): WorkflowApproval | undefined {
    const row = this.db.query<ApprovalRow, { $runId: string }>(`
      select id, run_id, project_id, revision, risk, status, summary, estimated_cost_json,
             requested_by, decided_by, decision_note, created_at, decided_at
      from video_approvals where run_id = $runId order by created_at desc, id desc limit 1
    `).get({ $runId: normalizeId(runId) });
    if (!row && required) throw new VideoAgentError("approval_not_found", `Approval for run '${runId}' was not found.`);
    return row ? mapApproval(row) : undefined;
  }

  private getStepById(stepId: string): WorkflowStep {
    const row = this.db.query<StepRow, { $id: string }>(`
      select id, run_id, name, ordinal, status, attempt, max_attempts, external_run_id,
             input_artifact_ids_json, output_artifact_ids_json, error_code, error_message,
             started_at, finished_at, updated_at
      from video_workflow_steps where id = $id
    `).get({ $id: normalizeId(stepId) });
    if (!row) throw new VideoAgentError("step_not_found", `Workflow step '${stepId}' was not found.`);
    return mapStep(row);
  }

  private setProjectStatusForRevision(
    projectId: string,
    revision: number,
    status: VideoProject["status"],
    now: number,
  ): void {
    this.db.query(`
      update video_projects
      set status = $status, updated_at = $updatedAt
      where id = $id and current_revision = $revision
    `).run({
      $id: normalizeId(projectId),
      $revision: revision,
      $status: status,
      $updatedAt: now,
    });
  }

  private findIdempotentRun(projectId: string, revision: number, key: string): string | undefined {
    const row = this.db.query<{ run_id: string }, { $scope: string; $key: string }>(`
      select run_id from video_idempotency_keys where scope = $scope and key = $key
    `).get({ $scope: idempotencyScope(projectId, revision), $key: key });
    return row?.run_id;
  }

  private insertRevision(revision: VideoRevision): void {
    this.db.query(`
      insert into video_revisions
        (project_id, revision, title, source_json, brief_json, reason, created_at)
      values
        ($projectId, $revision, $title, $sourceJson, $briefJson, $reason, $createdAt)
    `).run({
      $projectId: revision.projectId,
      $revision: revision.revision,
      $title: revision.title,
      $sourceJson: JSON.stringify(revision.source),
      $briefJson: JSON.stringify(revision.brief),
      $reason: revision.reason ?? null,
      $createdAt: revision.createdAt,
    });
  }

  private insertStep(step: WorkflowStep): void {
    this.db.query(`
      insert into video_workflow_steps
        (id, run_id, name, ordinal, status, attempt, max_attempts, external_run_id,
         input_artifact_ids_json, output_artifact_ids_json, error_code, error_message,
         started_at, finished_at, updated_at)
      values
        ($id, $runId, $name, $ordinal, $status, $attempt, $maxAttempts, $externalRunId,
         $inputArtifacts, $outputArtifacts, $errorCode, $errorMessage,
         $startedAt, $finishedAt, $updatedAt)
    `).run({
      $id: step.id,
      $runId: step.runId,
      $name: step.name,
      $ordinal: step.ordinal,
      $status: step.status,
      $attempt: step.attempt,
      $maxAttempts: step.maxAttempts,
      $externalRunId: step.externalRunId ?? null,
      $inputArtifacts: JSON.stringify(step.inputArtifactIds),
      $outputArtifacts: JSON.stringify(step.outputArtifactIds),
      $errorCode: step.errorCode ?? null,
      $errorMessage: step.errorMessage ?? null,
      $startedAt: step.startedAt ?? null,
      $finishedAt: step.finishedAt ?? null,
      $updatedAt: step.updatedAt,
    });
  }

  private insertEvent(runId: string, stepId: string | undefined, type: string, payload: Record<string, unknown>, now: number): void {
    this.db.query(`
      insert into video_workflow_events(run_id, step_id, type, payload_json, created_at)
      values($runId, $stepId, $type, $payload, $createdAt)
    `).run({
      $runId: normalizeId(runId),
      $stepId: stepId ? normalizeId(stepId) : null,
      $type: type.slice(0, 160),
      $payload: JSON.stringify(payload),
      $createdAt: now,
    });
  }

  private migrate(): void {
    this.db.run("pragma journal_mode = WAL");
    this.db.run("pragma foreign_keys = ON");
    this.db.run("pragma busy_timeout = 5000");
    this.db.run("pragma user_version = 1");
    this.db.run(`
      create table if not exists video_projects (
        id text primary key,
        title text not null,
        status text not null,
        current_revision integer not null,
        source_json text not null,
        brief_json text not null,
        created_at integer not null,
        updated_at integer not null
      )
    `);
    this.db.run(`
      create table if not exists video_revisions (
        project_id text not null references video_projects(id) on delete cascade,
        revision integer not null,
        title text not null,
        source_json text not null,
        brief_json text not null,
        reason text,
        created_at integer not null,
        primary key(project_id, revision)
      )
    `);
    this.db.run(`
      create table if not exists video_workflow_runs (
        id text primary key,
        definition text not null,
        project_id text not null references video_projects(id) on delete cascade,
        revision integer not null,
        status text not null,
        current_step text,
        progress integer not null default 0,
        idempotency_key text,
        requested_agent_id text,
        requested_provider text,
        requested_model text,
        error_code text,
        error_message text,
        lease_owner text,
        lease_expires_at integer,
        created_at integer not null,
        updated_at integer not null,
        finished_at integer,
        foreign key(project_id, revision) references video_revisions(project_id, revision)
      )
    `);
    this.db.run(`
      create table if not exists video_workflow_steps (
        id text primary key,
        run_id text not null references video_workflow_runs(id) on delete cascade,
        name text not null,
        ordinal integer not null,
        status text not null,
        attempt integer not null,
        max_attempts integer not null,
        external_run_id text,
        input_artifact_ids_json text not null,
        output_artifact_ids_json text not null,
        error_code text,
        error_message text,
        started_at integer,
        finished_at integer,
        updated_at integer not null,
        unique(run_id, name)
      )
    `);
    this.db.run(`
      create table if not exists video_artifacts (
        id text primary key,
        project_id text not null references video_projects(id) on delete cascade,
        revision integer not null,
        run_id text references video_workflow_runs(id) on delete set null,
        step_id text references video_workflow_steps(id) on delete set null,
        kind text not null,
        media_type text not null,
        relative_path text not null,
        byte_size integer not null,
        sha256 text not null,
        schema_version text,
        producer text not null,
        source_artifact_ids_json text not null,
        metadata_json text not null,
        created_at integer not null,
        unique(project_id, revision, relative_path)
      )
    `);
    this.db.run(`
      create table if not exists video_workflow_events (
        id integer primary key autoincrement,
        run_id text not null references video_workflow_runs(id) on delete cascade,
        step_id text references video_workflow_steps(id) on delete set null,
        type text not null,
        payload_json text not null,
        created_at integer not null
      )
    `);
    this.db.run(`
      create table if not exists video_approvals (
        id text primary key,
        run_id text not null references video_workflow_runs(id) on delete cascade,
        project_id text not null references video_projects(id) on delete cascade,
        revision integer not null,
        risk text not null,
        status text not null,
        summary text not null,
        estimated_cost_json text,
        requested_by text not null,
        decided_by text,
        decision_note text,
        created_at integer not null,
        decided_at integer
      )
    `);
    this.db.run(`
      create table if not exists video_idempotency_keys (
        scope text not null,
        key text not null,
        run_id text not null references video_workflow_runs(id) on delete cascade,
        created_at integer not null,
        primary key(scope, key)
      )
    `);
    this.db.run("create index if not exists video_projects_updated_idx on video_projects(updated_at desc)");
    this.db.run("create index if not exists video_runs_runnable_idx on video_workflow_runs(status, lease_expires_at, updated_at)");
    this.db.run(`
      create unique index if not exists video_runs_one_active_revision_idx
      on video_workflow_runs(project_id, revision, definition)
      where status in ('queued', 'running', 'waiting_approval')
    `);
    this.db.run("create index if not exists video_events_run_idx on video_workflow_events(run_id, id)");
    this.db.run("create index if not exists video_artifacts_project_idx on video_artifacts(project_id, revision, kind, created_at)");
  }
}

function projectParams(project: VideoProject): Record<string, string | number> {
  return {
    $id: project.id,
    $title: project.title,
    $status: project.status,
    $revision: project.currentRevision,
    $sourceJson: JSON.stringify(project.source),
    $briefJson: JSON.stringify(project.brief),
    $createdAt: project.createdAt,
    $updatedAt: project.updatedAt,
  };
}

function mapProject(row: ProjectRow): VideoProject {
  return {
    id: row.id,
    title: row.title,
    status: row.status as VideoProject["status"],
    currentRevision: row.current_revision,
    source: parseJson(row.source_json),
    brief: parseJson(row.brief_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRevision(row: RevisionRow): VideoRevision {
  return {
    projectId: row.project_id,
    revision: row.revision,
    title: row.title,
    source: parseJson(row.source_json),
    brief: parseJson(row.brief_json),
    reason: row.reason ?? undefined,
    createdAt: row.created_at,
  };
}

function mapRun(row: RunRow): WorkflowRun {
  return {
    id: row.id,
    definition: row.definition as WorkflowRun["definition"],
    projectId: row.project_id,
    revision: row.revision,
    status: row.status as WorkflowRun["status"],
    currentStep: (row.current_step as PreproductionStage | null) ?? undefined,
    progress: row.progress,
    idempotencyKey: row.idempotency_key ?? undefined,
    requestedAgentId: row.requested_agent_id ?? undefined,
    requestedProvider: row.requested_provider ?? undefined,
    requestedModel: row.requested_model ?? undefined,
    errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at ?? undefined,
  };
}

function mapStep(row: StepRow): WorkflowStep {
  return {
    id: row.id,
    runId: row.run_id,
    name: row.name as PreproductionStage,
    ordinal: row.ordinal,
    status: row.status as WorkflowStep["status"],
    attempt: row.attempt,
    maxAttempts: row.max_attempts,
    externalRunId: row.external_run_id ?? undefined,
    inputArtifactIds: parseJson(row.input_artifact_ids_json),
    outputArtifactIds: parseJson(row.output_artifact_ids_json),
    errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
    updatedAt: row.updated_at,
  };
}

function mapArtifact(row: ArtifactRow): VideoArtifact {
  return {
    id: row.id,
    projectId: row.project_id,
    revision: row.revision,
    runId: row.run_id ?? undefined,
    stepId: row.step_id ?? undefined,
    kind: row.kind,
    mediaType: row.media_type,
    relativePath: row.relative_path,
    byteSize: row.byte_size,
    sha256: row.sha256,
    schemaVersion: row.schema_version ?? undefined,
    producer: row.producer,
    sourceArtifactIds: parseJson(row.source_artifact_ids_json),
    metadata: parseJson(row.metadata_json),
    createdAt: row.created_at,
  };
}

function mapEvent(row: EventRow): WorkflowEvent {
  return {
    id: row.id,
    runId: row.run_id,
    stepId: row.step_id ?? undefined,
    type: row.type,
    payload: parseJson(row.payload_json),
    createdAt: row.created_at,
  };
}

function mapApproval(row: ApprovalRow): WorkflowApproval {
  return {
    id: row.id,
    runId: row.run_id,
    projectId: row.project_id,
    revision: row.revision,
    risk: row.risk as WorkflowApproval["risk"],
    status: row.status as WorkflowApproval["status"],
    summary: row.summary,
    estimatedCost: row.estimated_cost_json ? parseJson(row.estimated_cost_json) : undefined,
    requestedBy: row.requested_by,
    decidedBy: row.decided_by ?? undefined,
    decisionNote: row.decision_note ?? undefined,
    createdAt: row.created_at,
    decidedAt: row.decided_at ?? undefined,
  };
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function normalizeId(value: string): string {
  const id = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,179}$/.test(id)) throw new VideoAgentError("invalid_input", `Invalid identifier '${value}'.`);
  return id;
}

function normalizeOptionalKey(value: string | undefined): string | undefined {
  const key = value?.trim();
  if (!key) return undefined;
  if (key.length > 200 || /[\u0000-\u001f]/.test(key)) throw new VideoAgentError("invalid_input", "Invalid idempotency or selector value.");
  return key;
}

function idempotencyScope(projectId: string, revision: number): string {
  return `video.preproduction.v1:${projectId}:${revision}`;
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
