import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createApp } from "../src/server";

const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
});

describe("YouTube video workflow route", () => {
  test("starts Hermes runs without per-run LLM overrides", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "growth-hacker-youtube-route-"));
    const root = join(cwd, "state");
    writeFileSync(
      join(cwd, "growth-hacker.config.json"),
      JSON.stringify({
        growthRoot: join(root, ".growth"),
        hermesHome: join(root, ".hermes"),
        hermesApiBaseUrl: "http://127.0.0.1:8642",
        hermesApiKey: "test-key",
        defaultHermesProfile: "growth-agent",
        socialAgents: [{ id: "growth-agent", runner: "hermes" }]
      }),
      "utf8"
    );
    process.chdir(cwd);

    const originalFetch = globalThis.fetch;
    let hermesBody: Record<string, unknown> = {};
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      hermesBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return Response.json({ run_id: "run_abcdef", status: "queued" });
    }) as typeof fetch;

    const { app, stopSocialCronScheduler } = createApp();
    try {
      const response = await app.request("/api/platforms/youtube/profiles/astrozi/video-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "short intro",
          llm: { provider: "openrouter", model: "gpt-5.4" }
        })
      });

      expect(response.status).toBe(202);
      expect(await response.json()).toMatchObject({ runId: "run_abcdef", status: "queued" });
      expect(hermesBody).not.toHaveProperty("model");
      expect(hermesBody).not.toHaveProperty("provider");
      expect(hermesBody.metadata).toMatchObject({ agent_id: "growth-agent", reasoning_effort: "high", permission_mode: "ask" });
      expect(String(hermesBody.input)).toContain("video_generate");
    } finally {
      stopSocialCronScheduler();
      globalThis.fetch = originalFetch;
    }
  });
});
