#!/bin/bash
# Pre-Code Change Hook — PreToolUse on Edit|Write
# Warns when modifying asset layer files and slice contracts.

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
. "$SCRIPT_DIR/hook-input.sh"

FILE_PATH="$(hook_get_file_path "${1:-}")"
[[ -z "$FILE_PATH" ]] && exit 0

case "$FILE_PATH" in
  _ref/*)
    echo "[ExternalReference] _ref path detected: $FILE_PATH"
    echo "  _ref/ is external comparison material; refresh from upstream if needed, but keep it out of commits."
    ;;
  _ops/*)
    echo "[OpsPrivate] Private _ops path detected: $FILE_PATH"
    echo "  Keep secrets, real env files, provider state, artifacts, logs, and scratch files ignored under _ops/."
    ;;
  deploy/*)
    echo "[DeployAsset] Deployment operations asset detected: $FILE_PATH"
    echo "  deploy/ is trackable for runbooks, submission materials, release checklists, scripts, ordered SQL, and env examples."
    echo "  Keep deployment SQL directly under deploy/sql/ with 4-digit ascending prefixes."
    ;;
esac

if echo "$FILE_PATH" | grep -qE "(^|/)(interfaces|tests)(/|$)|(^|/)docs/spec\.md$|(^|/)specs/|(^|/)tasks/contracts/|(\.contract\.|\.spec\.)"; then
  echo "[AssetLayer] Immutable file detected: $FILE_PATH"
  echo "  资产层文件被修改，需同步重写下游实现。"
fi
