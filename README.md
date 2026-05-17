# Growth Hacker Dashboard

Local-first dashboard for running social media growth skills through Hermes/OpenClaw-compatible agent runtimes.

## v1

- Social account state root: `~/.growth/<profile>/<platform>/`
- Distilled platform workspace path: `~/.growth/vault/<profile>/<platform>/`
- Reusable platform library path: `~/.growth/vault/_library/<platform>/`
- Shared cross-platform library path: `~/.growth/vault/_library/_shared/`
- Global workspace content: `~/.growth/*` and `~/.growth/vault/*`
- Legacy import source: `~/.xiaohongshu/client/<profile>/`
- Default agent profile: `growth-agent`
- Chat runtime: dashboard `/api/chat/*` proxy to Hermes gateway `api_server` at `http://127.0.0.1:8642`

## Develop

```bash
bun install
bun run dev
```

The API server defaults to `http://localhost:8787`; the React UI is served by the same server in production builds and by Vite during frontend development.

## Hermes Chat

The Chat view talks to the dashboard API first. The dashboard server then proxies runs, approvals, stop requests, and event streams to the official Hermes gateway API server. The browser never needs a Hermes API key.

```bash
API_SERVER_ENABLED=1 \
API_SERVER_PORT=8642 \
hermes gateway restart
```

Override the gateway target with `HERMES_API_BASE_URL` or `hermesApiBaseUrl` in `growth-hacker.config.json` if Hermes is not on `http://127.0.0.1:8642`. If the gateway uses `API_SERVER_KEY`, set `HERMES_API_KEY` or `hermesApiKey` on the dashboard server side.

## Hermes Context

The dashboard exposes a read-only Hermes context surface at `/api/hermes/context`. It reads local Hermes state from `~/.hermes/state.db` and recent gateway activity from `~/.hermes/logs/gateway.log`, redacts obvious secrets, and powers the Hermes Context view in the UI. Use this for Hermes conversation/tool/runtime history; it does not depend on Codex UI or Codex thread state.

## Cron LLM Models

Social cron jobs read Hermes' authenticated provider/model inventory through `hermes_cli.inventory`. The UI stores the selected `{ provider, model }` on each cron/board task, and auto-reply jobs pass that selection to Hermes one-shot execution for JSON-only reply decisions.

## Safety Boundaries

- The dashboard never deletes legacy `~/.xiaohongshu` data.
- Legacy migration is non-destructive and reports conflicts instead of overwriting files.
- Xiaohongshu write actions such as publish, like, follow, or delete are intentionally outside v1.
- Xiaohongshu auto-reply defaults to draft-only mode; it sends comment replies only after the operator explicitly switches the profile settings to send mode.
- Runtime and XHS auth responses are redacted before they reach the UI.

## License

MIT
