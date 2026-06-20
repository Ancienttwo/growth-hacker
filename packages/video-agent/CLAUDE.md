# Video Agent Domain Contract

## Ownership

This package owns provider-independent video project contracts, validators, preproduction stages, state-transition guards, prompt compilation, storyboard rendering, and public command descriptors.

## Dependency boundary

- Do not import Hono, React, `bun:sqlite`, filesystem APIs, Hermes adapters, platform SDKs, or credentials.
- Keep generated media execution and publishing outside this package.
- Preserve schema versioning and stable entity IDs.
- Add a migration or compatibility parser before changing persisted contracts.

## Quality gates

```bash
bun --filter @growth-hacker/video-agent typecheck
bun --filter @growth-hacker/video-agent test
```

Tests must cover validation failures, cross-reference checks, deterministic compilation, rendering, and invalid state transitions.
