# Plan: Video Agent Sprint checklist from PRD pack

> **Status**: Draft
> **Created**: 20260620-1218
> **Slug**: think-users-chris-documents-growth-hacker-plans-prds-video-agent
> **Planning Source**: waza-think
> **Orchestration Kind**: waza-think
> **Source Ref**: think 根据/Users/chris/Documents/growth-hacker/plans/prds/video-agent-pack 写一个详细的Sprint checklist
> **Spec**: `docs/spec.md`
> **Research**: See `docs/researches/`
> **Task Contract**: `tasks/contracts/20260620-1218-think-users-chris-documents-growth-hacker-plans-prds-video-agent.contract.md`
> **Task Review**: `tasks/reviews/20260620-1218-think-users-chris-documents-growth-hacker-plans-prds-video-agent.review.md`
> **Implementation Notes**: `tasks/notes/20260620-1218-think-users-chris-documents-growth-hacker-plans-prds-video-agent.notes.md`

## Goal And Success Criteria

Turn `plans/prds/video-agent-pack/` into an approval-gated Sprint checklist for integrating the Video Agent V1 preproduction slice into Growth Hacker.

Success criteria:
- Verify the bundle inventory and `MANIFEST.sha256` before applying anything.
- Apply the bundle only after explicit implementation approval.
- Keep Video Agent platform-independent: content production belongs to Video Studio; YouTube/XHS remain downstream distribution targets.
- Integrate the backend/domain/CLI/docs/skill vertical slice without starting paid rendering, upload, publish, OAuth mutation, or credential migration.
- Pass or precisely classify failures for `bun install`, `bash scripts/verify-video-agent.sh`, `bun run typecheck`, `bun test apps packages`, and `bash scripts/check-task-workflow.sh --strict`.
- Keep this work separate from the existing repo-harness 0.7.3 refresh and unrelated untracked research artifacts.

## Scope And Non-Scope

In scope:
- Validate and, after approval, run `plans/prds/video-agent-pack/growth-hacker-video-agent-refactor/scripts/apply.sh .`.
- Integrate `packages/video-agent`, `apps/server/src/video`, `apps/growthctl`, `examples/video-agent`, video docs, and `skills/creative/video-production-agent-skill`.
- Review the script's narrow edits to `package.json`, `apps/server/package.json`, `apps/server/src/server.ts`, `apps/server/src/index.ts`, `docs/spec.md`, and `.ai/context/capabilities.json`.
- Verify local compile/test behavior and document any failing gate with exact command evidence.

Out of scope:
- React Video Studio UI.
- Real paid media-provider execution.
- Publishing or upload to YouTube, XHS, Reels, or any public platform.
- Deleting the old YouTube one-shot video path.
- Rebasing/pushing the current branch or resolving `main...origin/main [ahead 2, behind 2]`.
- Committing the entire untracked source pack unless explicitly requested.

## Constraints

- Current repo has staged harness follow-up files; do not mix them into a Video Agent implementation commit by accident.
- `plans/prds/video-agent-pack/` is source material and remains untracked until a packaging decision is made.
- Browser code must not receive Hermes keys, provider keys, OAuth tokens, or platform credentials.
- Local API defaults to `127.0.0.1`; `GROWTH_HACKER_HOST` must remain an explicit operator override.
- External cost and external publish require separate approval gates.
- The bundle's own backup directory `.video-agent-refactor-backup/<stamp>/` must be preserved until verification is complete.

## P1 Architecture Map

Real boundary:
- Growth Hacker is a local-first Bun/Hono/React app with server-side credential boundaries.
- Video Agent adds a platform-independent Content Studio/Video Production domain, not a YouTube feature.
- Large artifacts live on local filesystem; relational workflow/project state lives in SQLite.

Major modules:
- `packages/video-agent`: domain types, schemas, validation, prompt compiler, storyboard/render manifest helpers.
- `apps/server/src/video`: repository, artifact store, Hermes adapter, workflow coordinator, Hono routes.
- `apps/growthctl`: thin localhost HTTP CLI.
- `skills/creative/video-production-agent-skill`: video-production Agent skill.
- `docs/product`, `docs/architecture`, `docs/examples`, `examples/video-agent`: product, architecture, and operator references.
- Composition roots: `apps/server/src/server.ts`, `apps/server/src/index.ts`, package manifests, `docs/spec.md`, `.ai/context/capabilities.json`.

Ownership boundaries:
- Domain logic must not import Hono, React, Hermes runtime, Bun server entrypoints, or provider SDKs.
- Server module owns HTTP, SQLite, artifact filesystem, scheduler lifecycle, and Hermes adapter boundaries.
- CLI calls localhost API only and does not read SQLite or credentials directly.
- Provider rendering remains a port; V1 does not auto-spend.

## P2 Concrete Trace

Trace: story source to exportable preproduction package.

1. Operator or agent creates a video project through `growthctl` or `/api/video` with source story and Production Brief.
2. Hono route validates input and calls the Video application use case.
3. Repository persists project, immutable Revision, source checksum, brief, workflow run, and first step state in SQLite WAL.
4. Coordinator leases a run/step and invokes Hermes only for creative stages: story analysis, story bible, scene breakdown, shot planning, continuity review.
5. Each Agent output is stored raw, schema-validated, and only valid structured JSON advances the workflow.
6. Deterministic TypeScript compiles Canonical PromptSpec, provider prompts, render manifest, storyboard markdown, CSV/export artifacts, and package manifest.
7. Artifact store writes no-replace files with SHA-256 metadata and source chain.
8. Workflow stops at preproduction approval. No paid render or publish happens in this sprint.

Error paths:
- Invalid Agent output becomes stored invalid artifact plus retry/manual-review state.
- Crash before provider ID persistence becomes `ambiguous_external_submission`; no automatic duplicate external submission.
- Revision mismatch returns expectedRevision/CAS conflict.
- Artifact path traversal or hash mismatch fails closed.

Pressure point:
- The first integration pressure point is whether `apply.sh` anchors still match `apps/server/src/server.ts`, `apps/server/src/index.ts`, and current package manifests.

## P3 Decision Rationale

Decision: apply the bundle as an additive backend/domain/CLI vertical slice after approval, then defer UI/provider-spend work.

Why:
- The PRD's MVP is professional preproduction artifacts, not a one-shot generated video.
- The bundle already encodes narrow, idempotent integration edits and a backup plan.
- Preserving `packages/video-agent` as pure domain keeps workflow contracts testable.
- Keeping `/api/video` separate prevents YouTube distribution from owning content production.

Rejected alternatives:
- Do not manually cherry-pick files; that risks drifting from `MANIFEST.sha256` and missing package/server/capability edits.
- Do not implement UI first; UI should sit on verified backend/workflow contracts.
- Do not expand the old YouTube video route; it preserves the wrong ownership boundary.

10x scale failure mode:
- Workflow lease/retry/recovery and artifact registration fail first under concurrent long-running runs, process restarts, large exports, and local operator retries.

Smallest coherent change:
- Verify, apply, and test the additive bundle. Stop before UI, provider spending, or publishing.

## Public API, Config, And File Interface Changes

Expected additions:
- `/api/video` routes for projects, revisions, workflow runs/events, approvals, artifacts, and package export.
- Root scripts: `growthctl`, `test:video-agent`, `verify:video-agent`.
- Workspace package `@growth-hacker/video-agent` and app `apps/growthctl`.
- Server dependency on `@growth-hacker/video-agent`.
- `GROWTH_HACKER_HOST` explicit override with `127.0.0.1` default bind.
- `.ai/context/capabilities.json` capability `video-agent-v1`.
- `docs/spec.md` Video Studio block.

External dependencies:
- No new provider API key is required for local compile/test gates.
- Existing Hermes runtime may be needed for a live preproduction smoke, but that smoke is optional and must not include paid provider submission.

## Fragile Assumptions

- The current server composition roots still match `apply.sh` patch anchors.
- Bun workspace filters match the bundle package names.
- Existing SQLite/runtime paths can coexist with new video tables/migrations.
- Bundle files match `MANIFEST.sha256`.
- `.DS_Store` and zip files are not implementation truth.
- Staged harness follow-up files remain isolated from Video Agent implementation staging.

## Rollback And Failure Handling

Before apply:
- Record `git status --short --branch --untracked-files=all`.
- Verify bundle hashes from `growth-hacker-video-agent-refactor/MANIFEST.sha256`.
- Decide whether source pack files are source artifacts, archive artifacts, or out-of-repo handoff material.

During apply:
- Run `bash plans/prds/video-agent-pack/growth-hacker-video-agent-refactor/scripts/apply.sh .` only after implementation approval.
- Capture the backup path printed by the script.

Rollback:
- If apply fails, restore tracked edits from `.video-agent-refactor-backup/<stamp>/` or targeted `git restore`.
- Remove copied untracked implementation directories only after confirming they came from the bundle.
- Do not delete source pack files unless explicitly asked.

Failure reporting:
- For every failing gate, record command, exit code, first actionable error, and classification: bundle code, repo drift, dependency install, existing app regression, missing external runtime, or live provider unavailable.

## Phase Independence

- Phase 0 is read-only intake and can complete without applying code.
- Phase 1 applies the additive bundle and can be rolled back from backup/git.
- Phase 2 verifies compile/test without live Hermes.
- Phase 3 optionally runs a local server smoke without provider spending.
- UI/provider/publishing are later sprints and do not block backend integration acceptance.

## Sprint Checklist

### Phase 0 - Intake And Freeze
- [x] Record `git status --short --branch --untracked-files=all`.
- [x] Confirm staged harness follow-up files are isolated from Video Agent staging.
- [x] Inventory source pack with `find plans/prds/video-agent-pack -maxdepth 3 -type f | sort`.
- [x] Verify hashes under `growth-hacker-video-agent-refactor/` using `MANIFEST.sha256`.
- [x] Exclude `.DS_Store`, generated zip, and unrelated research files from implementation staging unless explicitly requested.
- [x] Read source references: PRD, architecture V2, implementation report, refactor README, apply script, verify script.

### Phase 1 - Apply Additive Bundle
- [ ] Confirm explicit implementation approval.
- [ ] Run `bash plans/prds/video-agent-pack/growth-hacker-video-agent-refactor/scripts/apply.sh .`.
- [ ] Capture `.video-agent-refactor-backup/<stamp>/`.
- [ ] Review `package.json` and `apps/server/package.json` for expected script/dependency edits only.
- [ ] Review `apps/server/src/server.ts` and `apps/server/src/index.ts` for route mount, scheduler shutdown, and `127.0.0.1` default bind.
- [ ] Review `docs/spec.md` and `.ai/context/capabilities.json` for one `video-agent-v1` block/entry.

### Phase 2 - Verification
- [ ] Run `bun install`.
- [ ] Run `bash scripts/verify-video-agent.sh`.
- [ ] Run `bun run typecheck`.
- [ ] Run `bun test apps packages`.
- [ ] Run `bash scripts/check-task-workflow.sh --strict`.
- [ ] Confirm no paid provider call or public publish path executed.

### Phase 3 - Local Operator Smoke
- [ ] Start local server only after compile/test gates pass.
- [ ] Run `bun run growthctl -- video project create --input @examples/video-agent/project.json`.
- [ ] Run `bun run growthctl -- video workflow start <projectId> --idempotency-key video-agent-smoke-v1`.
- [ ] Observe events through `bun run growthctl -- workflow events <runId> --follow`.
- [ ] Stop at preproduction approval; do not approve paid render or publish.
- [ ] Export package manifest with `bun run growthctl -- video package export <projectId> --revision 1`.
- [ ] Stop server and confirm scheduler/SQLite shutdown is clean.

### Phase 4 - Review And Packaging
- [ ] Inspect `git diff --stat` and verify it matches bundle scope.
- [ ] Keep source pack, plan files, and implementation diff staging decisions explicit.
- [ ] Update implementation notes with commands, pass/fail status, backup path, and skipped live checks.
- [ ] Prepare commit/PR summary: backend preproduction only, no UI, no paid provider, no publishing.

## Tests And Evidence

Required gates:
- `bash scripts/verify-video-agent.sh`
- `bun run typecheck`
- `bun test apps packages`
- `bash scripts/check-task-workflow.sh --strict`

Optional smoke gates:
- `bun run growthctl -- video project create --input @examples/video-agent/project.json`
- `bun run growthctl -- video workflow start <projectId> --idempotency-key video-agent-smoke-v1`
- `bun run growthctl -- workflow events <runId> --follow`
- `bun run growthctl -- video package export <projectId> --revision 1`

Evidence contract:
- Bundle hash verification result.
- Apply backup path.
- Exact verification commands and outputs.
- `git diff --stat` after apply.
- Confirmation that external cost/publish paths were not invoked.

## Stop Condition

Stop at Draft planning unless the user explicitly approves implementation. After approval, stop when the additive bundle is applied, required gates pass or failures are classified, and the review packet records the residual risk.
