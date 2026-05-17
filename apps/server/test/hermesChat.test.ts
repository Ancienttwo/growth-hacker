import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AppConfig } from "../src/config";
import { createHermesChatRun } from "../src/hermesChat";

function config(): AppConfig {
  const hermesHome = join(tmpdir(), `growth-hacker-hermes-${crypto.randomUUID()}`);
  return {
    growthRoot: "/tmp/growth-hacker/.growth",
    hermesHome,
    hermesApiBaseUrl: "http://127.0.0.1:8642",
    hermesApiKey: "local-key",
    defaultHermesProfile: "growth-agent",
    socialAgents: [{ id: "growth-agent", runner: "hermes" }],
    socialCronAgents: ["growth-agent"],
    bundledXiaohongshuSkillRoot: "/tmp/growth-hacker/skill",
    legacyXiaohongshuRoot: "/tmp/growth-hacker/.xiaohongshu/client",
    port: 0
  };
}

describe("Hermes chat proxy", () => {
  test("creates Hermes runs through the gateway contract without prompt-smuggling runtime options", async () => {
    const originalFetch = globalThis.fetch;
    let requestUrl = "";
    let requestBody: Record<string, unknown> = {};
    let requestHeaders = new Headers();
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input);
      requestHeaders = new Headers(init?.headers);
      requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return Response.json({ run_id: "run_abcdef", status: "queued" });
    }) as typeof fetch;

    try {
      const appConfig = config();
      mkdirSync(join(appConfig.hermesHome, "profiles", "growth-agent"), { recursive: true });
      writeFileSync(
        join(appConfig.hermesHome, "profiles", "growth-agent", "SOUL.md"),
        "# growth-agent Profile\n\n你是 `growth-agent`，不是 default/coordinator。\n",
        "utf8"
      );

      const run = await createHermesChatRun(appConfig, {
        agentId: "growth-agent",
        input: [{ role: "user", content: "$think 给一个方案" }],
        instructions: "Use $think.",
        model: "gpt-5.4",
        permissionMode: "ask",
        reasoningEffort: "high",
        sessionId: "ui-session"
      });

      expect(run).toMatchObject({
        runId: "run_abcdef",
        status: "queued",
        sessionId: "ui-session",
        hermesSessionId: "growth-hacker:growth-agent:ui-session"
      });
      expect(requestUrl).toBe("http://127.0.0.1:8642/v1/runs");
      expect(requestHeaders.get("Authorization")).toBe("Bearer local-key");
      expect(requestHeaders.get("X-Hermes-Session-Key")).toBe("growth-hacker:growth-agent:ui-session");
      expect(requestBody).toMatchObject({
        input: [{ role: "user", content: "$think 给一个方案" }],
        model: "gpt-5.4",
        permission_mode: "ask",
        reasoning_effort: "high",
        session_id: "growth-hacker:growth-agent:ui-session",
        metadata: {
          agent_id: "growth-agent",
          permission_mode: "ask",
          reasoning_effort: "high"
        }
      });
      expect(String(requestBody.instructions)).toContain("Hermes profile boundary");
      expect(String(requestBody.instructions)).toContain("你是 `growth-agent`，不是 default/coordinator。");
      expect(String(requestBody.instructions)).toContain("Run instructions:\nUse $think.");
      expect(JSON.stringify(requestBody)).not.toContain("Dashboard agent");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("rejects agents outside the dashboard allowlist", async () => {
    await expect(
      createHermesChatRun(config(), {
        agentId: "researcher",
        input: "hello",
        sessionId: "ui-session"
      })
    ).rejects.toThrow("agent_not_allowed:researcher");
  });

  test("rejects invalid runtime control fields before calling Hermes", async () => {
    const originalFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
      called = true;
      return Response.json({ run_id: "run_abcdef" });
    }) as typeof fetch;

    try {
      await expect(
        createHermesChatRun(config(), {
          agentId: "growth-agent",
          input: "hello",
          model: "gpt-5.4\nAuthorization: Bearer leaked",
          permissionMode: "auto-approve-everything",
          reasoningEffort: "infinite",
          sessionId: "ui-session"
        })
      ).rejects.toThrow("invalid_permission_mode:auto-approve-everything");
      expect(called).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
