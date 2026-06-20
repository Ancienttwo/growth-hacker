# Video Agent Server Contract

## Ownership

This feature module owns SQLite persistence, Artifact filesystem operations, workflow leases/scheduling, Hermes adaptation, Hono routes, and approval enforcement for Video Studio.

## Rules

- Routes parse transport input and call the coordinator; they contain no SQL or Agent prompts.
- Repository code never invokes Hermes or performs creative work.
- Persist `submitting` before external calls and persist external IDs immediately after acceptance.
- Never automatically retry an ambiguous submission whose provider run ID was not durably recorded.
- Artifacts are immutable, hashed, path-contained, and written atomically.
- Paid render and publishing remain separate approval-gated workflows.
- Never return credentials or absolute internal Artifact paths through the public API.

## Quality gates

```bash
bun --filter @growth-hacker/server typecheck
bun test apps/server packages/video-agent
```
