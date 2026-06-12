# Architecture Snapshot: System Overview

> **Date**: 2026-06-10
> **Scope**: Whole repo (apps/server, apps/web, packages, skills, scripts)
> **Status**: Current
> **Companion**: `docs/spec.md` (product outcome), `tasks/research.md` (status-surface findings)

## 1. Topology

```
browser (React 19 + Vite, 127.0.0.1:5177 dev / served by API in prod)
   │  /api/* (Vite proxy in dev)
   ▼
dashboard API (Bun + Hono, 127.0.0.1:8787)  ── apps/server
   ├── HTTP proxy ──► Hermes gateway api_server (127.0.0.1:8642)
   ├── subprocess ──► hermes CLI / Python inventory
   ├── subprocess ──► xhs CLI
   ├── subprocess ──► yt-cli (packages/youtube-cli, repo-owned)
   └── subprocess ──► Python skill scripts (skills/social-media/xiaohongshu-skill)
state on disk:
   ~/.growth/…        vault, chat.db, social-board/cron JSON, published/auto-reply JSON, yt tokens
   ~/.hermes/…        state.db (read-only), cron/jobs.json, profiles/<agent>/skills, gateway.log
```

Monorepo layout (bun workspaces):

| Unit | Role |
|------|------|
| `apps/server` | All API routes + domain modules (~25 modules, one file per domain) |
| `apps/web` | Dashboard UI; `App.tsx` (7,179 lines) owns all views and state |
| `packages/core` | Shared type contracts (workspace, XHS, Hermes, social tasks) consumed by server + web |
| `packages/youtube-cli` | Standalone guarded YouTube CLI (OAuth/PKCE, scoped tokens, confirm-gated mutations) |
| `skills/` | Bundled Hermes skills synced into `~/.hermes/profiles/<agent>/skills/` |
| `scripts/` | Contract-driven sprint harness (plan→todo→verify→review), architecture drift log |

## 2. Server design (apps/server)

- **Routing**: single Hono app; all ~70 routes registered inline in
  `server.ts` (826 lines). No middleware pipeline; per-route try/catch.
- **Domain modules**: one file per domain (`xhs.ts`, `socialCron.ts`,
  `hermesChat.ts`, …) exporting plain functions that take `AppConfig`.
  No DI container; config object threaded explicitly. Tests per module.
- **Persistence**: hybrid — SQLite (`chat.db` for sessions; Hermes `state.db`
  read-only) + JSON file stores (`social-board-tasks.json`,
  `social-cron/jobs.json`, published/auto-reply per-profile JSON) with a
  read→modify→write pattern and no locking.
- **External processes**: `shell.runCommand()` with timeouts, SIGTERM→SIGKILL
  escalation, and output redaction. Status checks use `statusCache.ts`
  (5s TTL + in-flight dedup) per the 2026-05-31 research conclusions.
- **Jobs**: in-memory `JobStore` (not persisted) with SSE streaming to the UI.
- **Two cron systems**: growth-managed (`socialCron.ts`) and Hermes-managed
  (`hermesCron.ts` reading `~/.hermes/cron/jobs.json`), merged at the API for
  the calendar/board.

## 3. Frontend design (apps/web)

- `App.tsx` is a single 7,179-line component: ~60 state hooks, ~70 effects,
  one `refresh()` fanning out to 13 endpoints, view switching by
  `activeView` conditionals, 15–40 props drilled into each inline view
  (Chat, Board, Calendar, Published, Replies, Skills, Config, Setup,
  Workspace, Knowledge, Hermes context).
- What IS extracted: pure logic modules with tests (`platformNavigation.ts`,
  `chatRunStatus.ts`, `chatSkillInstructions.ts`, `calendarWeekItems.ts`,
  `socialBoardFilters.ts`, i18n via `i18n.tsx` context). The extraction
  pattern is consistent: pure functions + colocated `.test.ts`.
- No router, no query/cache layer, single string-typed `busy` flag for all
  async ops, manual localStorage sync for chat sessions.

## 4. Assessment — is the architecture reasonable?

### What is sound (keep)

1. **Local-first trust boundary.** Browser never holds Hermes/Google
   credentials; server proxies the gateway and redacts before responding.
   This matches the product's core promise and should not be relaxed.
2. **Shared contracts in `packages/core`.** Server and web agree on shapes via
   one typed surface; cheap and effective.
3. **Guarded-CLI pattern (`yt-cli`).** Scope assertion, channel binding,
   dry-run defaults, confirm gates, 0600 tokens — the best-designed unit in
   the repo and the template for future write surfaces (XHS writes, X/FB).
4. **Status-surface discipline.** `statusCache` TTL + in-flight dedup + kill
   budgets solved the first-refresh timeout class of bugs; the pattern is
   documented in `tasks/research.md` and should be applied to
   `/api/hermes/models` if it ever blocks.
5. **One-file-per-domain server modules with per-module tests.** The module
   boundaries themselves are mostly right; the problems are inside and around
   them, not in the decomposition.

### What is not (change)

| # | Problem | Evidence | Risk |
|---|---------|----------|------|
| S1 | JSON store writes are non-atomic, no locking | `socialBoard.ts` / `socialCron.ts` read→modify→write; cron runner + UI mutations can interleave | **High** — silent state corruption of tasks/cron |
| S2 | `App.tsx` monolith (7,179 lines, ~60 states, ~70 effects) | single `function App()`; views inline; 15–40 props each | High — change amplification, race-prone manual refetch, untestable views |
| S3 | `server.ts` god-file (826 lines, ~70 inline routes) | all domains registered in one file, per-route error shapes diverge (`{error}` vs `{ok:false}`) | Medium — navigation cost, inconsistent API contract |
| S4 | CLI-wrapper pattern duplicated | `xhs.ts`, `youtubeCli.ts`, `hermesModels.ts` each hand-roll spawn→parse-JSON-envelope→normalize-error | Medium — every new platform re-implements the same failure handling |
| S5 | Validation/assertion logic scattered | `assertAllowedAgent` re-defined in `hermesProfiles`, `hermesSkills`, `socialCron`; path/segment checks only in `workspace.ts` | Medium — audit surface fragmented; one missed check = traversal/permission bug |
| S6 | `Promise.all` status fan-outs fail whole | `runtime.ts:40` rolls one timeout into a full-response failure | Medium — contradicts the degraded-status policy |
| S7 | Cache invalidation is ad hoc | `invalidateStatusCache()` called only after XHS login; skill/profile changes don't invalidate | Low-Med — stale UI status |
| S8 | Frontend has no fetch/cache layer or error boundary | manual `refresh()` + per-handler `fetch`; errors collapse into notice strings | Medium — duplicate requests, leaked EventSources, opaque errors |
| S9 | Dead platform stubs | `x`, `facebook` in `WORKSPACE_PLATFORMS` with no adapter behavior | Low — type surface lies about capability |

**Verdict**: the macro-architecture (local-first proxy + domain modules +
shared contracts + guarded CLIs) is reasonable and worth keeping. The debt is
concentrated in two god-files (S2, S3), one real data-integrity hazard (S1),
and a set of missing shared abstractions (S4, S5). This is refactor-in-place
territory; no rewrite or framework change is warranted.

## 5. Proposals

Ordered by risk-reduction per unit of effort. Each is an independent sprint
candidate sized for one contract (`plans/plan-*.md` → `tasks/todo.md`).

### P0-1 Atomic JSON stores (fixes S1)

Add a single `apps/server/src/fileStore.ts`: write-temp + `rename()` atomic
replace, plus a per-path in-process mutex (async queue) for
read-modify-write. Migrate `socialBoard`, `socialCron`, `xhsAutoReplies`,
`xhsPublished`, `workspace` manifest writes onto it.
*Verify*: concurrent-mutation test (two interleaved updates, no lost write).
*Rollback*: modules keep their current read/write signatures; revert is
per-module.

### P0-2 Decompose `App.tsx` mechanically (starts S2)

Phase 1 is moves, not rewrites: extract each inline view component to
`src/views/<View>.tsx` and the bottom-of-file formatters/status helpers to
`src/utils/`, keeping all state in `App` and passing the same props. Target:
`App.tsx` < 2,000 lines, zero behavior change.
*Verify*: `bun run typecheck`, existing `.test.ts` suites, manual smoke of all
views.
*Rollback*: pure file moves; revertible per view.

### P1-1 State/query layer for the web app (finishes S2, fixes S8)

After P0-2: introduce TanStack Query (or a thin SWR-style hook) for the 13
refresh endpoints + mutations; replace the string `busy` flag with per-mutation
state; add one error boundary + a typed `ApiError`. Group remaining App state
into `useChatState` / `useSocialState` / `useHermesState` hooks.

### P1-2 Split `server.ts` into route modules (fixes S3)

`routes/chat.ts`, `routes/social.ts`, `routes/platforms.ts`,
`routes/hermes.ts`, `routes/workspace.ts`, each exporting a Hono sub-app
mounted under `/api`. While moving, normalize the error shape to
`{ error: code, message?, status }` and add one `app.onError` fallback.

### P1-3 Shared CLI envelope runner (fixes S4)

Extract `runJsonCli<T>(config, bin, args, {timeout, scope})` wrapping
spawn → JSON envelope parse → normalized error codes; rebase `xhs.ts`,
`youtubeCli.ts`, `hermesModels.ts` on it. New platforms implement an adapter,
not a wrapper.

### P2 Consolidations (fix S5–S7, S9)

- Move `assertAllowedAgent` / safe-segment checks into one
  `apps/server/src/guards.ts`; import everywhere (S5).
- Replace status `Promise.all` with `Promise.allSettled` + per-entry degraded
  status (S6).
- Add invalidation hooks: profile/skill mutations call
  `invalidateStatusCache()` for their keys (S7).
- Either implement or remove `x`/`facebook` from `WORKSPACE_PLATFORMS` (S9 —
  decision recorded in `docs/spec.md` open questions).

### Explicitly rejected

- Rewrite to Next.js/Redux/microservices: the app is a single-operator
  localhost tool; the current topology is appropriate.
- Replacing JSON stores with a database: SQLite is already used where churn is
  high (chat); the JSON stores only need atomicity, not a schema migration.

## 6. Invariants to preserve through any refactor

1. Browser never receives credentials or unredacted CLI output.
2. No destructive defaults (XHS writes out of v1; yt-cli confirm gates).
3. Status endpoints degrade fast rather than block (`tasks/research.md`).
4. Legacy `~/.xiaohongshu` data is never deleted or overwritten.
5. `bun test apps packages` + `bun run typecheck` green at every merge-back.
