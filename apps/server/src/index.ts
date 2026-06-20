import { createApp } from "./server";

const { app, config, stopSocialCronScheduler, stopVideoWorkflowScheduler } = createApp();

const server = Bun.serve({ hostname: process.env.GROWTH_HACKER_HOST?.trim() || "127.0.0.1", port: config.port, fetch: app.fetch });

console.log(`Growth Hacker dashboard API listening on http://127.0.0.1:${config.port}`);

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
