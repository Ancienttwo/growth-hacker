#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
  cd "$REPO_ROOT"
elif [[ "$SCRIPT_DIR" == */.ai/harness/scripts ]]; then
  cd "$SCRIPT_DIR/../../.."
else
  if [[ "$SCRIPT_DIR" == */.ai/harness/scripts ]]; then
  cd "$SCRIPT_DIR/../../.."
else
  cd "$SCRIPT_DIR/.."
fi
fi

usage() {
  cat <<'USAGE_EOF'
Usage: .ai/harness/scripts/new-sprint.sh --slug <slug> [--title <title>]

Creates a program-level sprint backlog under plans/sprints/.
Use .ai/harness/scripts/new-plan.sh or .ai/harness/scripts/capture-plan.sh for execution plans under plans/.
USAGE_EOF
}

slug=""
title=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug)
      slug="${2:-}"
      shift 2
      ;;
    --title)
      title="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

[[ -n "$slug" ]] || { echo "--slug is required" >&2; usage; exit 1; }
[[ -n "$title" ]] || title="$slug"

exec bash .ai/harness/scripts/sprint-backlog.sh init --slug "$slug" --title "$title"
