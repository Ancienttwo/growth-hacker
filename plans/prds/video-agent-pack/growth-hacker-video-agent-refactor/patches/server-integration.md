# Server Integration Performed by `scripts/apply.sh`

The bundle is mostly additive. The installer makes these narrow, idempotent changes:

1. adds root scripts `growthctl`, `test:video-agent`, and `verify:video-agent`;
2. adds `@growth-hacker/video-agent: workspace:*` to the server package;
3. copies the domain package, Server feature module, CLI, Skill, examples, tests, and verification script;
4. imports `createVideoModule`, mounts it at `/api/video`, and returns its stop callback from `createApp()`;
5. updates `apps/server/src/index.ts` so SIGINT/SIGTERM stop both schedulers, close Video SQLite, and stop the Bun server; the server remains loopback-bound by default and can be overridden with `GROWTH_HACKER_HOST`;
6. appends the stable Video Studio product contract to `docs/spec.md`;
7. registers the capability and local Agent contracts in `.ai/context/capabilities.json`.

Equivalent `server.ts` integration:

```ts
import { createVideoModule } from "./video";

export function createApp() {
  const config = loadConfig();
  // existing bootstrap...
  const app = new Hono();
  const video = createVideoModule(config);
  app.route("/api/video", video.router);

  // existing routes and SPA fallback...
  return {
    app,
    config,
    jobs,
    stopSocialCronScheduler,
    stopVideoWorkflowScheduler: video.stop,
  };
}
```

The legacy `/api/platforms/youtube/profiles/:profile/video-runs` route is deliberately left in place for one migration cycle.
