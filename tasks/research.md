# Project — Research Notes

> **Last Updated**: TBD
> **Scope**: (what area of the codebase was researched)
> **Usage**: Store deep codebase findings and hidden contracts here, not in chat-only summaries.

## Codebase Map
| File | Purpose | Key Exports |
|------|---------|-------------|

## Architecture Observations
### Patterns & Conventions
### Implicit Contracts
### Edge Cases & Intricacies

## Technical Debt / Risks

## Research Conclusions
### What to Preserve
- 2026-05-31 runtime status trace: `/api/runtimes` is a dashboard status surface, not the source of truth for running agents. It should report degraded/missing quickly instead of blocking the whole app refresh. Hermes profile/config behavior still belongs in `apps/server/src/hermesProfiles.ts`; runtime checks should only inspect CLI availability and status.
### What to Change
- 2026-05-31 runtime status timeout: initial page refresh fires `/api/runtimes`, `/api/hermes/video-auth/status`, `/api/hermes/models`, `/api/platforms`, and XHS auth checks concurrently. The runtime endpoints each spawned multiple Hermes CLI commands, so repeated refreshes could push Bun requests into its 10s timeout window. Add short status budgets, force-kill timed-out commands, and use short TTL/in-flight caching for runtime/video auth status.
- 2026-05-31 XHS status timeout: `/api/platforms` and `/api/platforms/xiaohongshu/auth` both depend on `getXhsAuthStatus()`, so initial refresh can duplicate `xhs status --json`. Treat XHS auth as a status surface on normal refresh: short default budget, `status_timeout` degradation, and shared TTL/in-flight cache. Keep long `whoami` verification only for explicit login jobs.
### Open Questions
- After runtime and XHS status caching, the next observed first-refresh bottleneck is `/api/hermes/models`, roughly 1.4-1.6s locally because it invokes the Hermes Python inventory path. Consider the same status-surface treatment only if model picker freshness is not required on every initial dashboard load.
