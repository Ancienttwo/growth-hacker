import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Database } from "bun:sqlite";

import type { AppConfig } from "../src/config";
import { readHermesContextSnapshot } from "../src/hermesContext";

function config(): AppConfig {
  const root = join(tmpdir(), `growth-hacker-hermes-context-${crypto.randomUUID()}`);
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

describe("Hermes context reader", () => {
  test("reads recent sessions, messages, tool calls, and gateway events from Hermes home", () => {
    const appConfig = config();
    mkdirSync(join(appConfig.hermesHome, "logs"), { recursive: true });
    seedStateDb(appConfig);
    writeFileSync(
      join(appConfig.hermesHome, "logs", "gateway.log"),
      [
        "2026-05-17 20:44:40,546 INFO gateway.run: inbound message: platform=discord user=AncientTwo chat=1505551616705564734 msg='继续读 Hermes'",
        "2026-05-17 20:46:59,814 INFO [session-old] gateway.run: Session split detected: session-old → session-new (compression)",
        "2026-05-17 20:46:59,833 INFO gateway.run: response ready: platform=discord chat=1505551616705564734 time=139.3s api_calls=26 response=1927 chars"
      ].join("\n") + "\n",
      "utf8"
    );

    const snapshot = readHermesContextSnapshot(appConfig, { limit: 4, messageLimit: 10, gatewayLimit: 10 });

    expect(snapshot.available).toEqual({ stateDb: true, gatewayLog: true });
    expect(snapshot.sessions.map((session) => session.id)).toEqual(["session-new", "session-old"]);
    expect(snapshot.selectedSessionId).toBe("session-new");
    expect(snapshot.sessions[0]).toMatchObject({
      source: "discord",
      model: "gpt-5.3-codex-spark",
      endReason: undefined,
      messageCount: 3,
      toolCallCount: 1,
      apiCallCount: 2,
      tokens: { input: 120, output: 40 }
    });
    expect(snapshot.messages.map((message) => message.role)).toEqual(["user", "assistant", "tool"]);
    expect(snapshot.messages[0].contentPreview).toBe("帮我查 token=[REDACTED]");
    expect(snapshot.messages[1].toolCalls[0]).toMatchObject({
      id: "call_1",
      name: "search_files"
    });
    expect(snapshot.messages[1].toolCalls[0].argumentsPreview).toContain("青云门");
    expect(snapshot.gatewayEvents.map((event) => event.kind)).toEqual(["inbound", "compression", "response"]);
    expect(snapshot.gatewayEvents[0]).toMatchObject({
      platform: "discord",
      chat: "1505551616705564734",
      message: "继续读 Hermes"
    });
    expect(snapshot.gatewayEvents[1]).toMatchObject({
      fromSessionId: "session-old",
      toSessionId: "session-new"
    });
  });

  test("filters sessions and messages by source, session, and query", () => {
    const appConfig = config();
    mkdirSync(join(appConfig.hermesHome, "logs"), { recursive: true });
    seedStateDb(appConfig);
    writeFileSync(join(appConfig.hermesHome, "logs", "gateway.log"), "", "utf8");

    const snapshot = readHermesContextSnapshot(appConfig, {
      query: "青云门",
      source: "discord",
      sessionId: "session-new",
      limit: 10,
      messageLimit: 10
    });

    expect(snapshot.sessions.map((session) => session.id)).toEqual(["session-new"]);
    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.messages[0].toolCalls[0].name).toBe("search_files");
  });
});

function seedStateDb(config: AppConfig): void {
  const db = new Database(join(config.hermesHome, "state.db"));
  db.run(`
    create table sessions (
      id text primary key,
      source text not null,
      user_id text,
      model text,
      model_config text,
      system_prompt text,
      parent_session_id text,
      started_at real not null,
      ended_at real,
      end_reason text,
      message_count integer default 0,
      tool_call_count integer default 0,
      input_tokens integer default 0,
      output_tokens integer default 0,
      cache_read_tokens integer default 0,
      cache_write_tokens integer default 0,
      reasoning_tokens integer default 0,
      billing_provider text,
      billing_base_url text,
      billing_mode text,
      estimated_cost_usd real,
      actual_cost_usd real,
      cost_status text,
      cost_source text,
      pricing_version text,
      title text,
      api_call_count integer default 0,
      handoff_state text,
      handoff_platform text,
      handoff_error text
    )
  `);
  db.run(`
    create table messages (
      id integer primary key autoincrement,
      session_id text not null,
      role text not null,
      content text,
      tool_call_id text,
      tool_calls text,
      tool_name text,
      timestamp real not null,
      token_count integer,
      finish_reason text,
      reasoning text,
      reasoning_details text,
      codex_reasoning_items text,
      reasoning_content text,
      codex_message_items text
    )
  `);
  db.query(
    `insert into sessions (
       id, source, user_id, model, parent_session_id, started_at, ended_at, end_reason,
       message_count, tool_call_count, input_tokens, output_tokens, cache_read_tokens,
       cache_write_tokens, reasoning_tokens, title, api_call_count
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run("session-old", "api_server", null, "gpt-5.4", null, 1779023100, 1779023200, "compression", 1, 0, 10, 5, 0, 0, 0, "old", 1);
  db.query(
    `insert into sessions (
       id, source, user_id, model, parent_session_id, started_at, ended_at, end_reason,
       message_count, tool_call_count, input_tokens, output_tokens, cache_read_tokens,
       cache_write_tokens, reasoning_tokens, title, api_call_count
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "session-new",
    "discord",
    null,
    "gpt-5.3-codex-spark",
    "session-old",
    1779023300,
    null,
    null,
    3,
    1,
    120,
    40,
    2,
    3,
    4,
    "new",
    2
  );
  db.query(
    `insert into messages (session_id, role, content, tool_call_id, tool_calls, tool_name, timestamp, token_count, finish_reason)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run("session-new", "user", "帮我查 token=secret-value", null, null, null, 1779023301, 8, null);
  db.query(
    `insert into messages (session_id, role, content, tool_call_id, tool_calls, tool_name, timestamp, token_count, finish_reason)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "session-new",
    "assistant",
    "",
    null,
    JSON.stringify([{ id: "call_1", function: { name: "search_files", arguments: JSON.stringify({ query: "青云门" }) } }]),
    null,
    1779023302,
    null,
    "tool_calls"
  );
  db.query(
    `insert into messages (session_id, role, content, tool_call_id, tool_calls, tool_name, timestamp, token_count, finish_reason)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run("session-new", "tool", "found 3 files", "call_1", null, "search_files", 1779023303, null, null);
  db.close();
}
