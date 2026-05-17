import { createApp } from "./server";

const { app, config } = createApp();

Bun.serve({
  port: config.port,
  fetch: app.fetch
});

console.log(`Growth Hacker dashboard API listening on http://127.0.0.1:${config.port}`);
