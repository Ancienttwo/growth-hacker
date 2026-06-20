# Growth Hacker Video Agent Refactor Bundle

This bundle is an additive, backward-compatible implementation for the current `Ancienttwo/growth-hacker` main branch.

It introduces:

- a platform-independent video-production domain;
- durable SQLite project/workflow/artifact state;
- a resumable preproduction workflow driven by Hermes runs;
- deterministic prompt compilation and storyboard export;
- a thin `growthctl` HTTP CLI for operators and agents;
- a bundled Hermes video-production skill;
- unit and restart/approval/export/concurrency integration tests;
- example project/revision payloads;
- a detailed Chinese PRD and architecture/rollout plan.

## Apply to a checkout

From the repository root:

```bash
bash /path/to/this-bundle/scripts/apply.sh .
bun install
bash scripts/verify-video-agent.sh
bun run typecheck
bun test apps packages
```

The apply script copies additive files and makes narrow idempotent edits to:

- root `package.json`;
- `apps/server/package.json`;
- `apps/server/src/server.ts`;
- `apps/server/src/index.ts`（关闭 Scheduler 与 SQLite 的生命周期钩子）；
- `docs/spec.md`;
- `.ai/context/capabilities.json`.

It creates `.video-agent-refactor-backup/` before changing tracked files.

## Verification performed

The added domain, Server module, CLI, and tests pass strict TypeScript checking against the repository-declared Hono/Bun/TypeScript versions. The formal test files were also executed with an isolated Bun runtime: **12 passed, 0 failed（51 assertions）**. Full repository regression and live Hermes execution still need to run in the target checkout; see `IMPLEMENTATION.md`.

## Implemented boundary

The code implements the complete **preproduction workflow** and a render manifest/provider boundary. It intentionally does not auto-spend credits or publish video. Paid rendering and publishing remain approval-gated follow-on workflows.


## 交付入口

- 详细 PRD：`docs/product/video-agent-prd.md`
- 架构设计：`docs/architecture/video-agent-refactor-v1.md`
- 实现与验证报告：`IMPLEMENTATION.md`
- 示例：`docs/examples/video-agent/`
- 应用脚本：`scripts/apply.sh`

## Quick smoke flow

```bash
bun run growthctl -- video project create --input @examples/video-agent/project.json
bun run growthctl -- video workflow start <projectId> --idempotency-key demo-v1
bun run growthctl -- workflow events <runId> --follow
bun run growthctl -- workflow approve <runId> --decision approve --expected-revision 1
bun run growthctl -- video package export <projectId> --revision 1
```

The package export is manifest-scoped: it includes validated production artifacts and excludes raw/invalid Agent responses. The integration patch binds the unauthenticated local server to `127.0.0.1` by default; `GROWTH_HACKER_HOST` is an explicit operator override.
