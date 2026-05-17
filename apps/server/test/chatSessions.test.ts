import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type { AppConfig } from "../src/config";
import {
  createChatSession,
  deleteChatSession,
  handoffChatSession,
  importChatSessions,
  listChatSessions,
  updateChatSession
} from "../src/chatSessions";

function config(): AppConfig {
  const root = join(tmpdir(), `growth-hacker-chat-sessions-${crypto.randomUUID()}`);
  return {
    growthRoot: join(root, ".growth"),
    hermesHome: join(root, ".hermes"),
    hermesApiBaseUrl: "http://127.0.0.1:8642",
    hermesApiKey: "",
    defaultHermesProfile: "growth-agent",
    socialAgents: [{ id: "growth-agent", runner: "hermes" }],
    socialCronAgents: ["growth-agent"],
    bundledXiaohongshuSkillRoot: join(root, "skill"),
    legacyXiaohongshuRoot: join(root, ".xiaohongshu/client"),
    port: 0
  };
}

describe("dashboard chat sessions", () => {
  test("stores dashboard sessions under .growth without touching Hermes state", () => {
    const appConfig = config();

    const created = createChatSession(appConfig, {
      id: "chat-ui",
      title: "策略会话",
      agentId: "growth-agent",
      events: [{ event: "message.user", message: "先做账号定位", timestamp: 1 }]
    });

    expect(created.activeId).toBe("chat-ui");
    expect(created.sessions[0]).toMatchObject({
      id: "chat-ui",
      title: "策略会话",
      agentId: "growth-agent"
    });
    expect(existsSync(join(appConfig.growthRoot, "dashboard", "chat-sessions.sqlite"))).toBe(true);
    expect(existsSync(join(appConfig.hermesHome, "state.db"))).toBe(false);

    const updated = updateChatSession(appConfig, "chat-ui", {
      title: "更新后的策略",
      events: [
        { event: "message.user", message: "先做账号定位", timestamp: 1 },
        { event: "run.completed", run_id: "run_abcdef", output: "定位完成", timestamp: 2 }
      ]
    });

    expect(updated.title).toBe("更新后的策略");
    expect(listChatSessions(appConfig).sessions[0].events).toHaveLength(2);
  });

  test("creates a reviewable handoff session with parent linkage and hidden agent payload", () => {
    const appConfig = config();
    createChatSession(appConfig, {
      id: "chat-source",
      title: "小红书增长计划",
      agentId: "growth-agent",
      events: [
        { event: "message.user", message: "给 /Users/chris/.growth/vault/a.md 做计划", timestamp: 1 },
        { event: "message.delta", delta: "计划第一版", timestamp: 2 },
        { event: "run.completed", run_id: "run_abcdef", output: "最终计划", timestamp: 3 }
      ]
    });

    const state = handoffChatSession(appConfig, "chat-source");
    const handoff = state.sessions[0];

    expect(state.activeId).toBe(handoff.id);
    expect(handoff.parentSessionId).toBe("chat-source");
    expect(handoff.handoffSummary).toContain("# Chat Handoff");
    expect(handoff.handoffSummary).toContain("小红书增长计划");
    expect(handoff.handoffSummary).toContain("/Users/chris/.growth/vault/a.md");
    expect(handoff.events[0]).toMatchObject({
      event: "message.user",
      message: "Continue from handoff: 小红书增长计划"
    });
    expect(String(handoff.events[0].agentMessage)).toContain("# Chat Handoff");
  });

  test("imports legacy browser sessions only into an empty store and deletes safely", () => {
    const appConfig = config();
    mkdirSync(appConfig.growthRoot, { recursive: true });

    const imported = importChatSessions(appConfig, {
      activeId: "legacy-1",
      sessions: [
        {
          id: "legacy-1",
          title: "Legacy",
          agentId: "growth-agent",
          events: [{ event: "message.user", message: "旧会话", timestamp: 1 }],
          createdAt: 10,
          updatedAt: 20
        }
      ]
    });

    expect(imported.activeId).toBe("legacy-1");
    expect(imported.sessions[0]).toMatchObject({ id: "legacy-1", title: "Legacy" });
    expect(importChatSessions(appConfig, { sessions: [] }).sessions).toHaveLength(1);

    const deleted = deleteChatSession(appConfig, "legacy-1");
    expect(deleted.sessions).toHaveLength(1);
    expect(deleted.sessions[0].id).not.toBe("legacy-1");
    expect(deleted.activeId).toBe(deleted.sessions[0].id);
  });
});
