# Growth Hacker Dashboard

Local-first dashboard for running social media growth skills through Hermes/OpenClaw-compatible agent runtimes.

## v1

- Canonical workspace root: `~/.growth/<platform>/<profile>/`
- Xiaohongshu platform root: `~/.growth/xiaohongshu/<profile>/`
- Legacy import source: `~/.xiaohongshu/client/<profile>/`
- Default agent profile: `growth-agent`
- Chat runtime: Hermes gateway `api_server` at `http://127.0.0.1:8642`

## Develop

```bash
bun install
bun run dev
```

The API server defaults to `http://localhost:8787`; the React UI is served by the same server in production builds and by Vite during frontend development.

## Hermes Chat

The Chat view talks to Hermes through the official gateway API server, not through a dashboard-owned agent loop. Enable the Hermes API server on the gateway process:

```bash
API_SERVER_ENABLED=1 API_SERVER_PORT=8642 hermes gateway restart
```

If you configure `API_SERVER_KEY`, start this dashboard with the same key as `HERMES_API_KEY` or add `hermesApiKey` to `growth-hacker.config.json`.

## Safety Boundaries

- The dashboard never deletes legacy `~/.xiaohongshu` data.
- Legacy migration is non-destructive and reports conflicts instead of overwriting files.
- Xiaohongshu write actions such as publish, like, comment, follow, or delete are intentionally outside v1.
- Runtime and XHS auth responses are redacted before they reach the UI.

## License

MIT
