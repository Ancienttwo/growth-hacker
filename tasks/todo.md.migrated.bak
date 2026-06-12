# Deferred Goal Ledger

> **Status**: Backlog
> **Updated**: 2026-06-10 (docs sprint: rewrote docs/spec.md PRD, added docs/architecture/snapshots/snapshot-20260610-system-overview.md)
> **Scope**: Medium/long-term goals deferred from active plan execution

Current plan tasks live in the active plan's `## Task Breakdown`.
Do not duplicate that execution checklist here. Record only work intentionally deferred beyond this slice, with the tradeoff and revisit trigger.

## Deferred Goals

| Goal | Why Deferred | Tradeoff | Revisit Trigger |
|------|--------------|----------|-----------------|
| Review archived legacy checklist | Legacy tasks/todo.md contained execution checklist content before migration. | Preserve user-authored task text in tasks/archive instead of guessing which items still matter. | Open the archive and promote real follow-up work into a new plan or a deferred-goal row. |
| P0-1 Atomic JSON file stores (`fileStore.ts` with temp-write + rename + per-path mutex) for socialBoard/socialCron/xhsAutoReplies/xhsPublished/workspace | 2026-06-10 docs sprint was documentation-only; data-integrity fix needs its own contract with concurrency tests. | Until fixed, interleaved cron + UI mutations can silently lose writes (snapshot S1, High risk). | Next plan slot, or immediately if any task/cron state corruption is observed. |
| P0-2 Mechanical decomposition of `apps/web/src/App.tsx` (7,179 lines) into `src/views/*` + `src/utils/*`, zero behavior change | Move-only refactor deserves an isolated contract so review can confirm no logic drift. | Every frontend change until then pays the god-file navigation/conflict cost (snapshot S2). | Before the next non-trivial frontend feature lands. |
| P1 Split `server.ts` routes into domain route modules + unify error shape; shared `runJsonCli` CLI envelope runner; TanStack-Query-style fetch layer | Lower risk than P0 items; sequenced after them in snapshot §5. | API error shapes stay inconsistent and each new platform re-implements CLI wrapping (snapshot S3/S4/S8). | When P0-1 and P0-2 are verified, or when a new platform adapter is started. |
| Decide fate of `x` / `facebook` stubs in `WORKSPACE_PLATFORMS` | Product decision, not engineering; tracked in docs/spec.md open questions. | Type surface advertises platforms with no adapter behavior (snapshot S9). | When a second/third platform is prioritized on the roadmap. |
