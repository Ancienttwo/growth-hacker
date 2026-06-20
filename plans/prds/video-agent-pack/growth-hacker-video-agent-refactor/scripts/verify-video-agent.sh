#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "${1:-.}" && pwd)"
cd "$REPO_ROOT"

bun --filter @growth-hacker/video-agent typecheck
bun --filter @growth-hacker/growthctl typecheck
bun --filter @growth-hacker/server typecheck
bun test packages/video-agent/test apps/server/test/videoWorkflow.test.ts

echo "Video Agent verification passed."
