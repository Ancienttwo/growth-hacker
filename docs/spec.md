# Product Spec: growth-hacker

> **Status**: Active
> **Last Updated**: 2026-06-10
> **Owner**: Planner
> **Supersedes**: 2026-05-27 empty draft

## Product Outcome

A local-first dashboard that lets a solo operator or small studio run social media
growth work (Xiaohongshu today, YouTube next) through Hermes/OpenClaw-compatible
agent runtimes — without handing account credentials or API keys to the browser,
a cloud service, or the agent itself.

The operator gets one place to: chat with a growth agent, schedule recurring
social tasks, track published content and engagement, queue and approve
auto-replies, and manage per-platform workspaces and skills. All state lives on
the operator's machine under `~/.growth` and `~/.hermes`.

## Target User

- Primary: a single operator (founder, indie creator, agency runner) managing
  1–N Xiaohongshu profiles and 0–N YouTube channels from one machine.
- Secondary: an agent runtime (Hermes) acting on the operator's behalf inside
  guardrails the dashboard and bundled skills define.

## Core Capabilities (current)

| Area | Capability | Surface |
|------|------------|---------|
| Chat | Proxied Hermes chat runs with approvals, attachments, model/skill selection, session persistence (SQLite, 24-session cap) | Chat view, `/api/chat/*` |
| Workspace | Per-profile, per-platform vault under `~/.growth`; artifact browsing/serving with byte-range streaming; non-destructive legacy `~/.xiaohongshu` migration | Workspace/Knowledge views, `/api/workspaces`, `/api/vault/*` |
| XHS | Auth status + QR/browser login, published-post tracking with metrics merge, auto-reply queue (draft → approve → send, send-mode default with explicit draft-only opt-in) | Published/Replies views, `/api/platforms/xiaohongshu/*` |
| YouTube | Repo-owned `yt-cli`: OAuth (PKCE, loopback), read ops, guarded uploads (`--confirm-public`), comment mutations defaulting to dry-run with `--confirm <id>` gates, channel binding | Setup view, `/api/platforms/youtube/*` |
| Scheduling | Growth-managed cron jobs + Hermes-managed cron merged into one calendar/board; per-task LLM `{provider, model}` selection | Calendar/Board views, `/api/social-cron/*`, `/api/social-board/*` |
| Skills | Bundled repo skills (`skills/social-media/xiaohongshu-skill`, `skills/creative/guizang-social-card-skill`) synced into Hermes profiles; per-agent enable/disable | Skills view, `/api/hermes/skills` |
| Observability | Read-only Hermes context (state.db sessions/messages, gateway log tail) with secret redaction; runtime/CLI status surfaces with short budgets + TTL caches | Hermes view, `/api/hermes/context`, `/api/runtimes` |

## Success Criteria

- Primary workflow: operator opens the dashboard, sees platform/runtime status
  within ~2s on first refresh (status surfaces degrade instead of blocking),
  chats with the growth agent, and schedules or approves social tasks without
  ever pasting an API key into the browser.
- Quality bar:
  - No destructive default anywhere: XHS writes outside v1; YouTube mutations
    are dry-run/confirm-gated; legacy migration never deletes or overwrites.
  - All status endpoints return degraded-but-fast rather than timing out the
    whole app refresh (see `tasks/research.md` 2026-05-31 conclusions).
  - Secrets (tokens, cookies, auth headers) are redacted before any response
    or log leaves the server process.
  - `bun test apps packages` and `bun run typecheck` pass on every sprint.
- Out of scope (v1):
  - Xiaohongshu publish/like/follow/delete write actions.
  - Multi-machine or hosted deployment; the dashboard binds to localhost.
  - Multi-tenant auth on the dashboard itself (single trusted operator).
  - Platforms beyond XHS/YouTube (X and Facebook exist only as type stubs).

## Constraints

- Technical: Bun runtime; Hono server on `127.0.0.1:8787`; React 19 + Vite UI
  on `5177`; Hermes gateway expected at `http://127.0.0.1:8642`; external CLIs
  (`hermes`, `xhs`, `yt-cli`, Python skill scripts) invoked as subprocesses
  with explicit timeouts and kill escalation.
- Compliance/safety: browser never holds Hermes or Google credentials; token
  files written 0600 inside 0700 dirs; channel binding verified before any
  YouTube mutation; auto-reply send-mode is explicit per profile.
- Delivery: contract-driven sprints (`plans/` → `tasks/todo.md` →
  `tasks/reviews/`); architecture drift recorded via
  `scripts/architecture-drift.sh`.

## Acceptance Scenarios

- Given a fresh machine with Hermes installed and `growth-agent` bootstrapped,
  when the operator runs `bun run dev` and opens the dashboard,
  then runtime/platform/XHS status render within the status budget, and any
  unavailable CLI shows a degraded status instead of blocking the page.
- Given an authenticated XHS profile with auto-reply settings saved as
  draft-only, when the auto-reply cron fires,
  then replies are drafted but not sent, and the queue shows them for review.
- Given a YouTube profile authorized with `read` scope only,
  when the operator triggers an upload or comment mutation,
  then the CLI refuses with `youtube_scope_missing` and no API write occurs.
- Given a legacy `~/.xiaohongshu/client/<profile>` directory,
  when the operator runs the migration,
  then files are copied into `~/.growth/<profile>/xiaohongshu/`, conflicts are
  reported, and the legacy directory is left untouched.

## Open Questions

- `/api/hermes/models` is the remaining first-refresh bottleneck (~1.4–1.6s,
  Hermes Python inventory path). Apply the same status-surface caching only if
  model-picker freshness on initial load is not required.
- When (if ever) do XHS write actions enter scope, and what confirmation gate
  pattern do they inherit — the `yt-cli` dry-run/confirm model is the candidate.
- X and Facebook are declared in `WORKSPACE_PLATFORMS` but have no adapter
  behavior; decide whether to implement or remove them from the type surface.

<!-- video-agent-v1:start -->
## Video Studio / Video Agent

- Video production is a platform-independent local capability; YouTube and Xiaohongshu are downstream distribution targets.
- A versioned Video Project stores the source story/screenplay and Production Brief.
- `video.preproduction.v1` durably produces story analysis, Story/Visual Bible, scene breakdown, shot plan, continuity report, Canonical PromptSpec, provider prompts, render manifest, Storyboard Markdown, CSV exports, and a package manifest.
- Runtime state and approvals are stored in SQLite; immutable large artifacts are stored beneath the local Growth root with SHA-256 metadata.
- Agent stages return versioned structured JSON. Workflow control, validation, retries, state transitions, prompt compilation, and artifact registration remain deterministic application responsibilities.
- Preproduction is `local_write`. Paid rendering is `external_cost`, and publishing is `external_publish`; both require separate approval-gated workflows.
- `growthctl` is a thin localhost HTTP adapter and never opens the database or reads credentials directly.
<!-- video-agent-v1:end -->
