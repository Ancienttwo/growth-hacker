# Video Agent Refactor V1

> Decision: modular monolith, durable workflow, ports and adapters  
> Migration style: additive strangler; no big-bang rewrite

## 1. Decision

Growth Hacker remains a local-first Bun/Hono/React application. Video production becomes a first-class bounded context and is not implemented as a YouTube subfeature.

```text
React UI ───────┐
growthctl ──────┼── Protocol adapters ── Application service ── Video domain
Agent/MCP ──────┘                              │                    │
                                             │                    └─ pure schemas/rules
                                             ├─ Workflow repository (SQLite)
                                             ├─ Artifact store (filesystem)
                                             ├─ Hermes agent port
                                             └─ Media provider ports
```

V1 adds one pure package, one server feature module, and one thin CLI:

```text
packages/video-agent/       pure domain, validators, workflow definition,
                            prompt compiler, storyboard renderer, command contracts
apps/server/src/video/      SQLite repository, Hermes adapter, coordinator, routes
apps/growthctl/             localhost HTTP CLI adapter
skills/creative/...         Hermes operating instructions and output contracts
```

As the domain grows, `packages/video-agent` can be split into `video-domain`, `workflow`, `contracts`, and `video-application` without changing external contracts. V1 avoids premature package fragmentation while enforcing dependency direction now.

## 2. Dependency rules

1. `packages/video-agent` imports no Hono, React, `bun:sqlite`, filesystem or Hermes code.
2. Server routes do not contain SQL, prompts or domain rules.
3. Repository does not call Hermes.
4. Coordinator owns state transitions but delegates parsing/validation/compilation to the pure package.
5. CLI never opens SQLite and never invokes internal TypeScript through a subprocess; it talks to the local API.
6. Agent roles are workflow implementation details, not public commands.
7. Platform adapters consume approved delivery artifacts; they do not own video projects.

## 3. Runtime model

### 3.1 Server bootstrap

`createApp()` creates one `VideoModule`:

```text
openVideoDatabase(config)
  → VideoRepository
  → HermesVideoAgentAdapter
  → VideoWorkflowCoordinator
  → start scheduler
  → register /api/video routes
```

The module exposes `stop()` so shutdown/test code can clear the scheduler.

### 3.2 Durable scheduler

The scheduler is deliberately small:

- scans runnable workflows on a bounded interval;
- obtains a database lease before progressing a run;
- starts at most one new external call per run per tick;
- persists the Step as `submitting` before the external call and stores the Hermes run ID immediately after acceptance;
- polls an existing Hermes run instead of resubmitting after restart;
- applies retry policy only to retryable transport/format failures;
- stops at approval and terminal states.

This is not a distributed workflow platform. It is a reliable single-machine workflow kernel appropriate to the product constraint.

### 3.3 State machine

```text
queued → running → waiting_approval → succeeded
             │               │
             ├──────────────→ failed
             └──────────────→ cancelled
```

Step states:

```text
pending → submitting → running → succeeded
   │           │           │
   │           ├─────────→ failed
   │                       └──────→ pending (retry, attempt + 1)
   └──────────────────────────────→ skipped / cancelled
```

A process crash in `submitting` without a durably recorded provider ID is treated as `ambiguous_external_submission`; it is never automatically retried because the provider may already have accepted the request.

Transitions are checked in code and persisted with an expected prior state. Invalid transitions throw stable errors.

## 4. Persistence

Database path:

```text
~/.growth/dashboard/video-studio.sqlite
```

Artifact root:

```text
~/.growth/video-projects/<project-id>/
  revisions/<revision>/
    runs/<run-id>/
      <stage>/attempt-<n>/
        ...immutable artifacts...
```

SQLite tables:

- `video_projects`
- `video_revisions`
- `video_workflow_runs`
- `video_workflow_steps`
- `video_workflow_events`
- `video_artifacts`
- `video_approvals`
- `video_idempotency_keys`

Project source and Brief snapshots are versioned in SQLite for V1. Generated stage outputs and delivery documents are immutable files; DB rows keep hashes, lineage, media type and indexed workflow state.

Required pragmas:

```sql
pragma journal_mode = WAL;
pragma foreign_keys = ON;
pragma busy_timeout = 5000;
```

Runnable workflows are protected by unique per-tick lease tokens. A heartbeat renews the lease while a unit of work is active; concurrent scheduler/API ticks cannot submit the same Agent stage twice, and a crashed owner becomes recoverable after expiry.

## 5. Artifact protocol

Every Agent stage records the immutable raw response and, after validation, a typed JSON artifact:

```text
<stage>/attempt-<n>/agent-output.raw.txt
<stage>/attempt-<n>/<domain-kind>.json
<stage>/attempt-<n>/agent-output.invalid.txt   # only when validation fails
```

Deterministic stages create:

```text
canonical-prompts.jsonl
hermes-video-prompts.jsonl
render-manifest.json
project-snapshot.json
production-brief.json
source.txt
storyboard.md
scenes.csv
shots.csv
package-manifest.json
```

Write algorithm:

1. resolve the target beneath the project root and reject traversal;
2. calculate SHA-256 and byte count from the exact output bytes;
3. write `<name>.tmp-<uuid>`, fsync and close where available;
4. publish with an atomic no-replace hard link so an existing immutable file cannot be overwritten;
5. if a file already exists, adopt it only when checksum and size match exactly—this recovers a crash after file publication but before database registration;
6. insert the artifact row and its durable event in one SQLite transaction;
7. on a concurrent registration race, accept the existing row only when content, owner, producer, schema version and source lineage match;
8. verify checksums again before and after package export.

Deterministic documents use the durable workflow-step start timestamp rather than a fresh wall-clock value, so retrying an orphaned write reproduces identical bytes.

## 6. Agent stage contract

Each stage receives a versioned instruction and a compact context object. Output is one JSON object:

```json
{
  "schemaVersion": "1",
  "stage": "scene_breakdown",
  "data": {},
  "warnings": []
}
```

The coordinator does not infer valid domain data from prose. It permits a fenced JSON wrapper only as a recovery convenience, records a warning, then validates the same schema.

Retry policy:

- transport timeout/5xx: retryable;
- malformed JSON: retryable with validation errors and the prior invalid output supplied to the repair attempt;
- domain-reference error: retryable within the configured attempt budget;
- policy/safety error: not automatically retried;
- maximum attempts: 3 by default.

## 7. Prompt compilation

`ShotSpec` is provider-independent. Compilation has two phases:

```text
ShotSpec + Bible + Brief
  → Canonical PromptSpec
  → ProviderCompiler(version, capabilities)
  → ProviderPrompt
```

The compiler preserves:

- visible subject/action;
- environment and temporal state;
- camera and lens;
- composition and movement;
- lighting, palette, material and style;
- continuity anchors;
- explicit negative constraints;
- duration and aspect ratio;
- first/last frame intent when supported.

Unsupported capabilities produce warnings or a validation error; they are not silently discarded.

Paid generation is isolated behind `VideoRenderProviderPort`, whose contract covers capability discovery, estimate, idempotent submit, poll and cancel. The V1 preproduction workflow creates a render manifest but does not invoke that port.

## 8. Command surface

Public application commands:

```text
video.project.create
video.project.list
video.project.get
video.project.revise
video.preproduction.start
video.workflow.get
video.workflow.events
video.workflow.tick
video.workflow.retry
video.workflow.cancel
video.workflow.approve
video.artifact.list
video.artifact.read
video.package.export
```

Adapters:

- Hono routes expose REST;
- `growthctl` exposes shell usage;
- a future MCP adapter consumes the same command descriptors;
- internal server code invokes application methods directly.

## 9. Risk policy

```text
read              automatic
local_write       automatic, audited
external_cost     approval required
external_publish  approval required
destructive       approval required
credential_admin  operator-only
```

Preproduction stages are `local_write`. Render submission is `external_cost`. YouTube/XHS publish is `external_publish` and remains a separate workflow.

## 10. Migration

### Stage A — additive foundation

Add package/module/CLI/skill. Mount `/api/video`. Existing YouTube video endpoint remains operational.

### Stage B — UI adoption

New Video Studio uses `/api/video`. Existing YouTube UI links to a Video Project rather than creating one-shot runs.

### Stage C — compatibility adapter

Old endpoint creates a Video Project and optionally a single-shot render plan through the new application service. Response includes deprecation metadata.

### Stage D — removal

Remove the old one-shot prompt builder after one release with no consumers.

## 11. Verification

Required checks after application:

```bash
bun install
bun --filter @growth-hacker/video-agent typecheck
bun --filter @growth-hacker/video-agent test
bun --filter @growth-hacker/server typecheck
bun --filter @growth-hacker/growthctl typecheck
bun test packages/video-agent/test apps/server/test/videoWorkflow.test.ts
bun test apps packages
bun run typecheck
```

Manual scenarios:

1. create project through CLI;
2. start preproduction;
3. stop server during an Agent stage;
4. restart and observe the same Hermes run being polled;
5. complete all stages and approve;
6. export the package and verify it contains only manifest-selected validated artifacts;
7. attempt stale revision update and verify conflict;
8. verify existing Chat/XHS/YouTube endpoints still respond.
