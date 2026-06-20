# Video Agent Sprint Implementation Notes

## Phase 0 - Intake And Freeze

- `git status --short --branch --untracked-files=all`: repository was on `main...origin/main`; Video Agent plan and source pack files were untracked.
- `git diff --cached --name-only`: no staged files, so there were no staged harness follow-up files to isolate.
- `find plans/prds/video-agent-pack -maxdepth 3 -type f | sort`: source pack inventory recorded; implementation staging excludes `.DS_Store`, generated zip, and unrelated research artifacts unless explicitly requested.
- `shasum -a 256 -c MANIFEST.sha256` from `plans/prds/video-agent-pack/growth-hacker-video-agent-refactor`: all bundle files reported `OK`.
- Source references read: `growth-hacker-video-agent-PRD.md`, `growth-hacker-architecture-v2.md`, `growth-hacker-video-agent-IMPLEMENTATION.md`, refactor `README.md`, `scripts/apply.sh`, and `scripts/verify-video-agent.sh`.
- Local repo pressure point checked: `apps/server/src/server.ts`, `apps/server/src/index.ts`, root `package.json`, `apps/server/package.json`, and `.ai/context/capabilities.json` match the apply script's expected anchors.

## Phase 1 - Apply Additive Bundle

- User instruction to complete this plan was treated as implementation approval.
- First `bash plans/prds/video-agent-pack/growth-hacker-video-agent-refactor/scripts/apply.sh .` failed with `Could not patch index.ts: Bun.serve anchor was not found`; cause was repo formatting drift from the script's single-line `Bun.serve` anchor to the checkout's multi-line call.
- Manual compatibility patch applied to `apps/server/src/index.ts`: destructure both scheduler stops, bind `Bun.serve` to `process.env.GROWTH_HACKER_HOST?.trim() || "127.0.0.1"`, and register `SIGINT`/`SIGTERM` shutdown.
- Second apply run succeeded. Backup path: `.video-agent-refactor-backup/20260620T043006Z-48613-18112`; the earlier partial backup remains at `.video-agent-refactor-backup/20260620T042932Z-44283-1599`.
- Review confirmed expected edits only in root/server package manifests, server route mount, server lifecycle, `docs/spec.md`, and `.ai/context/capabilities.json`.
- Concurrent repo state changed after Phase 0: `HEAD` advanced to `f01cf52 chore(video-agent): add video-agent reference implementation pack`, so `plans/prds/video-agent-pack/growth-hacker-video-agent-refactor/` is now tracked source material rather than untracked source material.

## Phase 2 - Verification

- `bun install`: passed with Bun 1.3.10 and saved `bun.lock`; no package install changes beyond new workspace lockfile entries.
- First `bash scripts/verify-video-agent.sh`: failed because Bun matched duplicate tracked reference-pack tests under `plans/prds/video-agent-pack/growth-hacker-video-agent-refactor/**`.
- Fix applied: root `test:video-agent` and `scripts/verify-video-agent.sh` now pass absolute test file paths so Bun runs only the integrated workspace tests.
- `bun run test:video-agent`: passed, 12 tests, 51 assertions.
- `bash scripts/verify-video-agent.sh`: passed; `@growth-hacker/video-agent`, `@growth-hacker/growthctl`, and `@growth-hacker/server` typechecks exited 0, then 12 tests passed.
- `bun run verify:video-agent`: passed; it delegates to `bash scripts/verify-video-agent.sh` and produced the same 12-test/51-assertion pass.
- `bun run typecheck`: passed for `core`, `growthctl`, `video-agent`, `youtube-cli`, `server`, and `web`.
- `bun test apps packages`: failed after 193 passing tests because Bun treats `apps` and `packages` as substring filters and still discovers tracked reference-pack tests under `plans/prds/video-agent-pack/growth-hacker-video-agent-refactor/apps/server/test/videoWorkflow.test.ts`; that duplicate pack test cannot resolve workspace package `@growth-hacker/video-agent` from inside the source pack. Classification: source-pack/test-discovery contamination, not integrated Video Agent code failure.
- `repo-harness run check-task-workflow --strict`: failed before task validation because repo-harness reported missing user-level script directories/files such as `new-spec.sh`, `check-task-workflow.sh`, and stale handoff resume/current ordering. Classification: repo-harness runtime/source resolution drift outside the Video Agent implementation path.
- No paid media provider, OAuth mutation, upload, public publish, or Video Agent external render approval path was executed. Video workflow tests used fake Agent ports.

## Phase 4 - Review And Packaging

- Implementation commit: `b4de860 feat(video-agent): integrate preproduction slice`.
- Verification follow-up keeps source pack and backup directories out of staging; only root script/lockfile, plan, and notes changes are staged for the verification commit.
- Local operator smoke was skipped because the required full test/workflow gates were not fully green; failures are classified above.

## Acceptance Gate Cleanup

- Added root TypeScript path aliases for `@growth-hacker/core` and `@growth-hacker/video-agent`; this lets Bun resolve workspace package imports even when its substring test discovery reaches the tracked reference pack under `plans/prds/video-agent-pack/`.
- `bun test apps packages`: passed after the alias fix, 185 tests, 544 assertions.
- `bun run typecheck`: passed after the alias fix for `core`, `growthctl`, `video-agent`, `youtube-cli`, `server`, and `web`.
- `bun run verify:video-agent`: passed after the alias fix, 12 tests, 51 assertions.
- `repo-harness adopt --repo /Users/chris/Documents/growth-hacker --compact --sync-codegraph --json`: exited 0, refreshed repo-local workflow contract and handoff, synced CodeGraph, and reported `[workflow] OK`.
- `repo-harness run check-task-workflow --strict`: passed with `[workflow] OK`.

## Phase 3 - Local Operator Smoke

- Smoke config used an isolated temp workspace at `/tmp/growth-hacker-video-smoke.fnGyAO`, with `growthRoot` under that temp directory, API bind port `18878`, and `videoWorkflowScheduler: false`; this kept the smoke off the user's real `~/.growth` state and prevented Hermes/provider execution.
- `bun /Users/chris/Documents/growth-hacker/apps/server/src/index.ts` from the temp config directory: started successfully and reported `Growth Hacker dashboard API listening on http://127.0.0.1:18878`.
- `curl -sS http://127.0.0.1:18878/api/health`: returned `{"ok":true,"growthRoot":"/tmp/growth-hacker-video-smoke.fnGyAO/growth"}`.
- `bun run growthctl -- --server http://127.0.0.1:18878 capabilities`: passed and confirmed the local CLI could reach the server capability surface.
- `bun run growthctl -- --server http://127.0.0.1:18878 video project create --input @examples/video-agent/project.json`: passed; project `vprj_mqlzgngv_2c8d7e3098bc43cc`, title `雨夜归伞`, status `draft`, revision `1`, source checksum `8d2b3a9f500926b23481852d59c7eaef8b219959a897f4630119c2249b8b0b80`.
- `bun run growthctl -- --server http://127.0.0.1:18878 video workflow start vprj_mqlzgngv_2c8d7e3098bc43cc --idempotency-key video-agent-smoke-v1`: passed; run `vrun_mqlzgrwt_f84b74bf47fc417a`, status `queued`, current step `story_analysis`, progress `0`, all workflow steps pending.
- `bun run growthctl -- --server http://127.0.0.1:18878 workflow events vrun_mqlzgrwt_f84b74bf47fc417a`: passed with one `workflow.created` event for `video.preproduction.v1` revision `1`; a bounded `--follow` smoke printed the same event before the local timeout stopped the continuous stream.
- `bun run growthctl -- --server http://127.0.0.1:18878 video package export vprj_mqlzgngv_2c8d7e3098bc43cc --revision 1`: returned the expected guard envelope `ok: false`, error code `workflow_not_ready`, message `A completed preproduction package is required before export.` Classification: correct preproduction-package guard before Hermes-generated artifacts and approval, not a server crash.
- `bun run growthctl -- --server http://127.0.0.1:18878 workflow status vrun_mqlzgrwt_f84b74bf47fc417a`: confirmed the run remained `queued` at `story_analysis` with no artifacts, which is expected because the smoke intentionally disabled the scheduler.
- Server shutdown via `SIGINT` exited 0. Follow-up `curl -sS --max-time 2 http://127.0.0.1:18878/api/health || true` failed to connect, confirming the local listener was closed.
- No Hermes request, paid media-provider call, OAuth mutation, upload, public publish, external render approval, or user's real Growth Hacker state was touched.
- Post-smoke `repo-harness run check-task-workflow --strict` initially failed on handoff freshness (`resume.md < current.md`); `repo-harness adopt --repo /Users/chris/Documents/growth-hacker --compact --sync-codegraph --json` refreshed the handoff/CodeGraph state, and the final `repo-harness run check-task-workflow --strict` passed with `[workflow] OK`.

## Phase 5 - Hermes-enabled Preproduction Smoke

- Live Hermes preflight: `curl -sS --max-time 3 http://127.0.0.1:8642/health` returned `{"status":"ok","platform":"hermes-agent"}` and `hermes status` showed the gateway running. Secret-bearing values were masked by Hermes status output and were not copied into repo files.
- Smoke config used isolated temp workspace `/tmp/growth-hacker-hermes-video-smoke.unBt2M`, `growthRoot` under that temp directory, API bind port `18879`, `videoWorkflowScheduler: true`, `hermesApiBaseUrl: http://127.0.0.1:8642`, and `allowedHermesAgents: ["growth-agent"]`.
- `bun /Users/chris/Documents/growth-hacker/apps/server/src/index.ts` from the temp config directory: started successfully and reported `Growth Hacker dashboard API listening on http://127.0.0.1:18879`; `curl -sS http://127.0.0.1:18879/api/health` returned the temp `growthRoot`.
- `bun run growthctl -- --server http://127.0.0.1:18879 video project create --input @examples/video-agent/project.json`: passed; project `vprj_mqlzucxe_b8d2b8b20cad467f`, revision `1`, source checksum `8d2b3a9f500926b23481852d59c7eaef8b219959a897f4630119c2249b8b0b80`.
- Default-provider run `vrun_mqlzuhrp_11ea60bfad0a466d`: scheduler submitted Hermes external runs for `story_analysis`, retried to attempt 3, then failed with `external_provider_failed` because Hermes default provider `OpenAI Codex` lacked a valid Codex OAuth `access_token`. Classification: operator auth/runtime blocker, not Video Agent route/coordinator failure.
- `xai-oauth` probe run `vrun_mqlzwgey_d0eb815a67d34aa2` with `maxAttempts: 1`: failed because the run inherited default model `gpt-5.4`, which the xAI provider did not expose. `xai-oauth` probe run `vrun_mqlzxl7a_5aa98514eb384758` with model `x-ai/grok-4.3` also failed with model-not-found/no-team-access. Classification: provider/model entitlement mismatch.
- Successful Hermes run used HTTP API body `{"revision":1,"provider":"xai-oauth","model":"grok-4.3","maxAttempts":1}` and idempotency key `video-agent-hermes-smoke-xai-grok43-noprefix-v1`; run `vrun_mqlzyimn_a540d2fe7e414b90` reached `waiting_approval`, current step `preproduction_approval`, progress `88`.
- Successful run stage results: `story_analysis`, `story_bible`, `scene_breakdown`, `shot_planning`, `continuity_review`, `prompt_compilation`, and `storyboard_document` all reached `succeeded`; `preproduction_approval` was requested but not decided.
- Artifact evidence for successful run: 20 runtime artifacts under `/tmp/growth-hacker-hermes-video-smoke.unBt2M/growth/video-projects/...`, including raw Agent outputs, validated JSON, canonical/provider prompts, render manifest, storyboard, CSVs, and `preproduction-package`.
- `bun run growthctl -- --server http://127.0.0.1:18879 video package export vprj_mqlzucxe_b8d2b8b20cad467f --revision 1`: passed with exit code 0; export run `vrun_mqlzyimn_a540d2fe7e414b90`, package artifact `vart_mqm00sb2_ea473ca331ae4353`, artifact count `15`, relative directory `vprj_mqlzucxe_b8d2b8b20cad467f/revision-1-vrun_mqlzyimn_a540d2fe7e414b90-2026-06-20T06-50-57-115Z-ac7e8fa9`.
- Export file check: `/tmp/growth-hacker-hermes-video-smoke.unBt2M/growth/video-exports/...` contains 15 files: story analysis, story bible, scenes, shots, continuity report, canonical prompts, Hermes provider prompts, render manifest, project snapshot, production brief, source text, storyboard markdown, scenes CSV, shots CSV, and package manifest.
- Server shutdown via `SIGINT` exited 0. Follow-up `curl -sS --max-time 2 http://127.0.0.1:18879/api/health || true` failed to connect, confirming the local listener was closed.
- No preproduction approval was granted, no paid media render was started, no OAuth mutation was performed by Growth Hacker, no upload/public publish path was invoked, and the user's real `~/.growth` state was not touched.
- Post-smoke `repo-harness run check-task-workflow --strict` initially failed on handoff freshness; `repo-harness adopt --repo /Users/chris/Documents/growth-hacker --compact --sync-codegraph --json` refreshed handoff/CodeGraph state, and the final `repo-harness run check-task-workflow --strict` passed with `[workflow] OK`.
