# growthctl Contract

`growthctl` is a thin localhost HTTP adapter for operators, scripts, and Agents.

- Do not open SQLite or import server implementation modules.
- Keep stdout machine-readable JSON/JSONL; send help and diagnostics to stderr.
- Preserve server error codes and nonzero exit statuses.
- Never print credentials.
- Long-running work returns a durable run ID; the CLI is not the workflow worker.
