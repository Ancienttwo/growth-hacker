# Handoff Protocol

Handoffs make long-running work resumable without trusting chat history.

## When Handoff Is Required

- Context pressure reaches the configured red zone
- Context pressure reaches the configured orange zone and broad exploration would continue
- Verification fails and the work is not resolved in-session
- The active sprint changes
- The session is ending

## Required Sections

- Goal
- Decisions
- Files touched
- Commands run
- Checks
- Blockers
- Exact next step
- Resume prompt
- Source artifacts

## Restore Flow

1. Start a fresh Codex session instead of relying on auto-compact or `codex resume` when the old session is near the limit.
2. Read `.ai/harness/handoff/resume.md`.
3. Read `.ai/harness/handoff/current.md`.
4. Read `tasks/current.md` as an orientation snapshot only; in a non-target worktree, compare it with `git show <target>:tasks/current.md`.
5. Read the active plan and sprint contract.
6. Read the latest review file if one exists.
7. Read `.ai/harness/checks/latest.json` and `.ai/harness/context-budget/latest.json`.
8. Resume from the exact next step.

## Context Budget Policy

- Green `<55%`: normal execution; sidecar broad research by default.
- Yellow `55-70%`: persist research, todo, and handoff state before continuing.
- Orange `70-80%`: stop broad exploration and generate the resume packet.
- Red `>=80%`: stop after the current response and resume in a fresh session.
- SQLite and Codex thread state are read models only. Markdown, JSON, and JSONL files remain the canonical handoff surface.
- `tasks/current.md` is a tracked derived snapshot. It helps branch/worktree orientation, but stale or surprising state must be checked against plans, workstreams, handoff, and checks.
