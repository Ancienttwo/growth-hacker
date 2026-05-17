# Growth Hacker Dashboard

Local-first dashboard for running social media growth skills through Hermes/OpenClaw-compatible agent runtimes.

## v1

- Canonical workspace root: `~/.growth/<platform>/<profile>/`
- Xiaohongshu platform root: `~/.growth/xiaohongshu/<profile>/`
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

## Safety Boundaries

- The dashboard never deletes legacy `~/.xiaohongshu` data.
- Legacy migration is non-destructive and reports conflicts instead of overwriting files.
- Xiaohongshu write actions such as publish, like, comment, follow, or delete are intentionally outside v1.
- Runtime and XHS auth responses are redacted before they reach the UI.

## License

MIT
