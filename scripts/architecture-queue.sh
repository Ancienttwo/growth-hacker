#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TARGET="$REPO_ROOT/.ai/harness/scripts/architecture-queue.sh"

if [[ ! -f "$TARGET" ]]; then
  echo "Missing repo-harness helper runtime: $TARGET" >&2
  exit 1
fi

exec bash "$TARGET" "$@"
