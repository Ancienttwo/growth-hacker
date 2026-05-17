## Observations

- User-visible symptom: dashboard chat answered as Hermes `default/coordinator` even when the dashboard selected/configured `growth-agent`.
- `hermes profile list` shows `default` gateway running and `growth-agent` profile present but stopped. This is not by itself a bug: single-gateway routing can still select named profiles.
- `/Users/chris/Documents/growth-hacker/apps/server/src/hermesChat.ts` sends `metadata.agent_id = growth-agent` and `X-Hermes-Session-Key = growth-hacker:growth-agent:<session>`.
- Hermes `/v1/runs` implementation in `/Users/chris/.hermes/hermes-agent/gateway/platforms/api_server.py` ignored `metadata.agent_id` and created the agent from the gateway process runtime config.
- `/Users/chris/.hermes/config.yaml` maps the Discord growth channel to `growth-agent`, but that channel routing does not apply to the `api_server` platform.
- `/Users/chris/.hermes/hermes-agent/tests/gateway/test_channel_profile_routing.py` existed but failed because the implementation helpers had been lost from `gateway/run.py`.
- Direct `hermes --profile growth-agent -z 'who are you'` currently fails because the Codex refresh token was consumed by another client.

## Hypotheses

### H1: growth-hacker sends the wrong agent id

- Supports: chat answered as default/coordinator.
- Conflicts: request construction uses `input.agentId ?? config.defaultHermesProfile`, and `DEFAULT_GROWTH_AGENT` is `growth-agent`.
- Test: inspect `apps/server/src/hermesChat.ts` and `apps/server/test/hermesChat.test.ts`.
- Result: rejected.

### H2: Hermes API server does not support per-run profile routing

- Supports: `_handle_runs` accepts `metadata` only as body data, while `_create_agent()` calls `_resolve_runtime_agent_kwargs()` and `_resolve_gateway_model()` from the running process config.
- Conflicts: none found.
- Test: inspect `/Users/chris/.hermes/hermes-agent/gateway/platforms/api_server.py`.
- Result: confirmed.

### H3: growth-agent profile is missing or misconfigured

- Supports: profile gateway is stopped.
- Conflicts: profile directory, config, and SOUL file exist.
- Test: inspect `hermes profile list` and `/Users/chris/.hermes/profiles/growth-agent/SOUL.md`.
- Result: rejected as the primary cause. The profile exists; gateway stopped is expected for single-gateway routing. Direct invocation currently fails on Codex auth refresh, which is a separate credential issue.

## Root Cause

The growth-hacker dashboard was passing `growth-agent` as metadata, but Hermes API server did not apply the same profile-routing idea used by platform gateways: `/v1/runs` ignored `metadata.agent_id`.

## Fix

Two-layer fix:

1. growth-hacker injects the selected Hermes profile `SOUL.md` into run instructions, so the dashboard chat follows the selected profile boundary immediately.
2. Hermes source now restores profile config routing helpers and lets `/v1/runs` resolve `metadata.agent_id` to the named profile config.

The live gateway still needs restart to load the Hermes source change. I did not restart it during investigation because direct `growth-agent` auth currently reports a consumed Codex refresh token.

## 2026-05-17 Dashboard API Offline

### Observations

- User-visible symptom: Chat view showed `Hermes API offline` and `api_server unavailable`.
- Hermes gateway itself was healthy: `curl http://127.0.0.1:8642/health/detailed` returned `gateway_state=running` and `api_server=connected`.
- Dashboard API was not listening: `curl http://127.0.0.1:8787/api/chat/hermes/status` failed to connect.
- Vite dev server was not listening either: `curl http://127.0.0.1:5177/api/chat/hermes/status` failed to connect.

### Hypotheses

- H1: Hermes gateway is down. Rejected: port `8642` health returned healthy gateway and connected `api_server`.
- H2: Dashboard proxy layer is down. Confirmed: ports `8787` and `5177` were not listening.
- H3: Frontend cached a stale offline state. Lower likelihood: both live API endpoints were actually unavailable before restart.

### Root Cause

The browser UI was still loaded, but the growth-hacker dashboard server/proxy layer was stopped; Hermes gateway was not the failing component.

### Fix

Started detached `screen` sessions for both dashboard processes:

- `growth-hacker-server`: `bun --filter @growth-hacker/server dev`
- `growth-hacker-web`: `bun --filter @growth-hacker/web dev`

Verified both `http://127.0.0.1:8787/api/chat/hermes/status` and `http://127.0.0.1:5177/api/chat/hermes/status` now return `available=true`.
