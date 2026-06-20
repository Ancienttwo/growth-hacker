# Plan: Video Agent V1

## Outcome

Deliver a platform-independent, durable preproduction workflow that turns a story or screenplay into validated scene, shot, prompt, continuity and storyboard artifacts.

## Task Breakdown

- [x] Define PRD and architecture decision.
- [x] Add pure video domain/contracts package.
- [x] Add deterministic prompt compiler and storyboard renderer.
- [x] Add SQLite repository and artifact store.
- [x] Add resumable Hermes workflow coordinator and scheduler.
- [x] Add modular Hono routes.
- [x] Add `growthctl` HTTP CLI.
- [x] Add bundled Video Production Agent skill.
- [x] Add unit tests for validation/compiler/state behavior.
- [x] Add restart, approval, revision-conflict and manifest-scoped export integration tests.
- [x] Add idempotent installer, verification script and example payloads.
- [ ] Add React Video Studio surfaces.
- [ ] Add paid render provider execution and media QC.
- [ ] Migrate/deprecate the legacy YouTube one-shot video endpoint.

## Rollout Gate

The feature may be enabled when targeted typechecks and tests pass, a run survives restart, the export manifest excludes raw Agent output, and the repository-wide regression suite remains green.
