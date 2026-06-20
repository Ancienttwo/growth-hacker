#!/usr/bin/env bash
set -euo pipefail

BUNDLE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "${1:-.}" && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)-$$-${RANDOM}"
BACKUP_ROOT="$REPO_ROOT/.video-agent-refactor-backup/$STAMP"

for required in package.json apps/server/package.json apps/server/src/server.ts apps/server/src/index.ts docs/spec.md .ai/context/capabilities.json; do
  if [[ ! -f "$REPO_ROOT/$required" ]]; then
    echo "Not a compatible growth-hacker checkout: missing $required" >&2
    exit 2
  fi
done

mkdir -p "$BACKUP_ROOT"

python3 - "$BUNDLE_ROOT" "$REPO_ROOT" "$BACKUP_ROOT" <<'PY'
from __future__ import annotations
import json
import re
import shutil
import sys
from pathlib import Path

bundle = Path(sys.argv[1])
repo = Path(sys.argv[2])
backup = Path(sys.argv[3])

copy_roots = [
    "packages/video-agent",
    "apps/server/src/video",
    "apps/server/test",
    "apps/growthctl",
    "examples/video-agent",
    "skills/creative/video-production-agent-skill",
    "docs/examples/video-agent",
]
copy_files = [
    "docs/product/video-agent-prd.md",
    "docs/architecture/video-agent-refactor-v1.md",
    "docs/plans/video-agent-v1.md",
    "scripts/verify-video-agent.sh",
]
modified_files = [
    "package.json",
    "apps/server/package.json",
    "apps/server/src/server.ts",
    "apps/server/src/index.ts",
    "docs/spec.md",
    ".ai/context/capabilities.json",
]

backed_up: set[str] = set()

def backup_file(relative: str) -> None:
    if relative in backed_up:
        return
    source = repo / relative
    if source.exists() and source.is_file():
        target = backup / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    backed_up.add(relative)

for relative in modified_files:
    backup_file(relative)

for root_name in copy_roots:
    source_root = bundle / root_name
    if not source_root.is_dir():
        raise SystemExit(f"Bundle is incomplete: missing {root_name}")
    for source in sorted(source_root.rglob("*")):
        if not source.is_file():
            continue
        relative = source.relative_to(bundle).as_posix()
        target = repo / relative
        backup_file(relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)

for relative in copy_files:
    source = bundle / relative
    if not source.is_file():
        raise SystemExit(f"Bundle is incomplete: missing {relative}")
    target = repo / relative
    backup_file(relative)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)

# Root package scripts. Workspaces already include apps/* and packages/*.
root_package_path = repo / "package.json"
root_package = json.loads(root_package_path.read_text())
scripts = root_package.setdefault("scripts", {})
scripts["growthctl"] = "bun --silent apps/growthctl/src/cli.ts"
scripts["test:video-agent"] = "bun test packages/video-agent/test apps/server/test/videoWorkflow.test.ts"
scripts["verify:video-agent"] = "bash scripts/verify-video-agent.sh"
root_package_path.write_text(json.dumps(root_package, indent=2, ensure_ascii=False) + "\n")

server_package_path = repo / "apps/server/package.json"
server_package = json.loads(server_package_path.read_text())
dependencies = server_package.setdefault("dependencies", {})
dependencies["@growth-hacker/video-agent"] = "workspace:*"
server_package["dependencies"] = dict(sorted(dependencies.items()))
server_package_path.write_text(json.dumps(server_package, indent=2, ensure_ascii=False) + "\n")

# Narrow, idempotent server bootstrap patch.
server_path = repo / "apps/server/src/server.ts"
server = server_path.read_text()
import_line = 'import { createVideoModule } from "./video";'
anchor = 'import { Hono } from "hono";'
legacy_joined_import = f"{anchor} {import_line}"
if legacy_joined_import in server:
    server = server.replace(legacy_joined_import, f"{anchor}\n{import_line}", 1)
elif import_line not in server:
    if anchor not in server:
        raise SystemExit("Could not patch server.ts: Hono import anchor was not found")
    server = server.replace(anchor, f"{anchor}\n{import_line}", 1)

mount_line = 'const video = createVideoModule(config);'
route_line = 'app.route("/api/video", video.router);'
legacy_mount = f"{mount_line} {route_line}"
if legacy_mount in server:
    server = server.replace(legacy_mount, f"{mount_line}\n  {route_line}", 1)
elif route_line not in server:
    anchor = "const app = new Hono();"
    if anchor not in server:
        raise SystemExit("Could not patch server.ts: app construction anchor was not found")
    server = server.replace(anchor, f"{anchor}\n  {mount_line}\n  {route_line}", 1)

old_return = "return { app, config, jobs, stopSocialCronScheduler };"
new_return = "return { app, config, jobs, stopSocialCronScheduler, stopVideoWorkflowScheduler: video.stop };"
if new_return not in server:
    if old_return not in server:
        raise SystemExit("Could not patch server.ts: createApp return anchor was not found")
    server = server.replace(old_return, new_return, 1)
server_path.write_text(server)

# Ensure both schedulers and the SQLite connection are closed on process shutdown.
index_path = repo / "apps/server/src/index.ts"
index = index_path.read_text()
old_bootstrap = "const { app, config } = createApp();"
new_bootstrap = "const { app, config, stopSocialCronScheduler, stopVideoWorkflowScheduler } = createApp();"
if old_bootstrap in index:
    index = index.replace(old_bootstrap, new_bootstrap, 1)
elif new_bootstrap not in index:
    raise SystemExit("Could not patch index.ts: createApp bootstrap anchor was not found")

old_serve = "Bun.serve({ port: config.port, fetch: app.fetch });"
desired_serve = 'const server = Bun.serve({ hostname: process.env.GROWTH_HACKER_HOST?.trim() || "127.0.0.1", port: config.port, fetch: app.fetch });'
if old_serve in index:
    index = index.replace(old_serve, desired_serve, 1)
elif desired_serve not in index:
    raise SystemExit("Could not patch index.ts: Bun.serve anchor was not found")

if "video-agent-v1:lifecycle" not in index:
    lifecycle = '''

// video-agent-v1:lifecycle
let stopping = false;
function stopApplication(): void {
  if (stopping) return;
  stopping = true;
  stopVideoWorkflowScheduler();
  stopSocialCronScheduler();
  server.stop(true);
}
process.once("SIGINT", stopApplication);
process.once("SIGTERM", stopApplication);
'''
    index = index.rstrip() + lifecycle
index_path.write_text(index)

spec_path = repo / "docs/spec.md"
spec = spec_path.read_text()
block = '''<!-- video-agent-v1:start -->
## Video Studio / Video Agent

- Video production is a platform-independent local capability; YouTube and Xiaohongshu are downstream distribution targets.
- A versioned Video Project stores the source story/screenplay and Production Brief.
- `video.preproduction.v1` durably produces story analysis, Story/Visual Bible, scene breakdown, shot plan, continuity report, Canonical PromptSpec, provider prompts, render manifest, Storyboard Markdown, CSV exports, and a package manifest.
- Runtime state and approvals are stored in SQLite; immutable large artifacts are stored beneath the local Growth root with SHA-256 metadata.
- Agent stages return versioned structured JSON. Workflow control, validation, retries, state transitions, prompt compilation, and artifact registration remain deterministic application responsibilities.
- Preproduction is `local_write`. Paid rendering is `external_cost`, and publishing is `external_publish`; both require separate approval-gated workflows.
- `growthctl` is a thin localhost HTTP adapter and never opens the database or reads credentials directly.
<!-- video-agent-v1:end -->'''
pattern = re.compile(r"<!-- video-agent-v1:start -->.*?<!-- video-agent-v1:end -->", re.S)
if pattern.search(spec):
    spec = pattern.sub(block, spec)
else:
    spec = spec.rstrip() + "\n\n" + block + "\n"
spec_path.write_text(spec)

capability_path = repo / ".ai/context/capabilities.json"
capability_doc = json.loads(capability_path.read_text())
capabilities = capability_doc.setdefault("capabilities", [])
entry = {
    "id": "video-agent-v1",
    "name": "Video Studio and durable preproduction workflow",
    "status": "active",
    "ownership": [
        "packages/video-agent",
        "apps/server/src/video",
        "apps/growthctl",
        "skills/creative/video-production-agent-skill"
    ],
    "contracts": [
        "packages/video-agent/AGENTS.md",
        "apps/server/src/video/AGENTS.md",
        "apps/growthctl/AGENTS.md"
    ],
    "entrypoints": [
        "apps/server/src/video/index.ts",
        "apps/growthctl/src/cli.ts",
        "packages/video-agent/src/index.ts"
    ],
    "docs": [
        "docs/product/video-agent-prd.md",
        "docs/architecture/video-agent-refactor-v1.md",
        "docs/plans/video-agent-v1.md"
    ],
    "verification": [
        "bun --filter @growth-hacker/video-agent typecheck",
        "bun --filter @growth-hacker/video-agent test",
        "bun --filter @growth-hacker/server typecheck",
        "bun --filter @growth-hacker/growthctl typecheck",
        "bun test packages/video-agent/test apps/server/test/videoWorkflow.test.ts"
    ]
}
capabilities = [item for item in capabilities if not (isinstance(item, dict) and item.get("id") == entry["id"])]
capabilities.append(entry)
capability_doc["capabilities"] = capabilities
capability_path.write_text(json.dumps(capability_doc, indent=2, ensure_ascii=False) + "\n")

for executable in [repo / "apps/growthctl/src/cli.ts", repo / "scripts/verify-video-agent.sh"]:
    executable.chmod(executable.stat().st_mode | 0o111)

print(f"Applied Video Agent V1 to {repo}")
print(f"Backup: {backup}")
PY

echo
echo "Next checks:"
echo "  cd $REPO_ROOT"
echo "  bun install"
echo "  bun --filter @growth-hacker/video-agent typecheck"
echo "  bun --filter @growth-hacker/video-agent test"
echo "  bun --filter @growth-hacker/server typecheck"
echo "  bun --filter @growth-hacker/growthctl typecheck"
echo "  bash scripts/verify-video-agent.sh"
echo "  bun run typecheck"
