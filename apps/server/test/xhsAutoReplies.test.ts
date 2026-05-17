import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type { AppConfig } from "../src/config";
import { listXhsAutoReplies, runXhsAutoReplyBatch, updateXhsAutoReplySettings } from "../src/xhsAutoReplies";

function config(): AppConfig {
  const root = mkdtempSync(join(tmpdir(), "growth-hacker-auto-replies-"));
  return {
    growthRoot: join(root, ".growth"),
    hermesHome: join(root, ".hermes"),
    hermesApiBaseUrl: "http://127.0.0.1:8642",
    hermesApiKey: "",
    defaultHermesProfile: "growth-agent",
    socialAgents: [{ id: "growth-agent", runner: "local" }],
    socialCronAgents: ["growth-agent"],
    bundledXiaohongshuSkillRoot: join(root, "skill"),
    legacyXiaohongshuRoot: join(root, ".xiaohongshu", "client"),
    port: 0
  };
}

function createProfile(appConfig: AppConfig, profile = "astrozi"): string {
  const path = join(appConfig.growthRoot, profile, "xiaohongshu");
  mkdirSync(path, { recursive: true });
  return path;
}

function installFakeXhs(logPath: string): string {
  const binDir = mkdtempSync(join(tmpdir(), "growth-hacker-fake-xhs-"));
  const path = join(binDir, "xhs");
  writeFileSync(
    path,
    `#!/usr/bin/env bun
const command = process.argv[2];
const has = (value) => process.argv.includes(value);
const ok = (data) => console.log(JSON.stringify({ ok: true, schema_version: "1", data }));
if (command === "--version") {
  console.log("xhs, version 0.6.4");
} else if (command === "whoami") {
  ok({ user_id: "brand-1", nickname: "AstroZi" });
} else if (command === "my-notes") {
  const page = Number(process.argv[process.argv.indexOf("--page") + 1] ?? "0");
  ok(page === 0 ? { items: [{ id: "note-1", xsec_token: "xsec-1", url: "https://www.xiaohongshu.com/explore/note-1", note_card: { display_title: "八字十神", interact_info: { comment_count: "1" } } }] } : { items: [] });
} else if (command === "comments") {
  if (!process.argv.includes("--xsec-token") || process.argv[process.argv.indexOf("--xsec-token") + 1] !== "xsec-1") {
    console.log(JSON.stringify({ ok: false, schema_version: "1", error: { code: "missing_xsec_token" } }));
    process.exit(1);
  }
  ok({ comments: [{ id: "comment-1", content: "这个适合新手吗？", user_info: { user_id: "user-1", nickname: "Alice" }, sub_comment_count: 0 }] });
} else if (command === "sub-comments") {
  ok({ comments: [] });
} else if (command === "reply") {
  await Bun.write("${logPath}", process.argv.join(" "));
  ok({ replied: true });
} else {
  ok({});
}
`,
    { mode: 0o755 }
  );
  return binDir;
}

describe("XHS auto replies", () => {
  test("defaults to China Simplified and draft-only mode", () => {
    const appConfig = config();
    createProfile(appConfig);

    expect(listXhsAutoReplies(appConfig, "astrozi").settings).toMatchObject({
      locale: "zh-CN",
      dryRun: true,
      maxRepliesPerRun: 10,
      delaySeconds: 12
    });
  });

  test("runs an agent-generated dry-run batch against pending comments", async () => {
    const appConfig = config();
    createProfile(appConfig);
    const logPath = join(tmpdir(), `growth-hacker-xhs-reply-${crypto.randomUUID()}.log`);
    const fakeBin = installFakeXhs(logPath);
    const originalPath = process.env.PATH;
    const originalFetch = globalThis.fetch;
    let hermesRequestBody = "";
    process.env.PATH = `${fakeBin}:${originalPath ?? ""}`;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/v1/runs")) {
        hermesRequestBody = String(init?.body ?? "");
        return Response.json({ run_id: "run_abcdef", status: "queued" });
      }
      return Response.json({
        run_id: "run_abcdef",
        status: "completed",
        output: JSON.stringify({
          decisions: [{ commentId: "comment-1", action: "reply", content: "适合新手，先从这篇的例子看就行。", reason: "genuine_question" }]
        })
      });
    }) as typeof fetch;

    try {
      updateXhsAutoReplySettings(appConfig, "astrozi", {
        stylePrompt: "短句，真诚，不引导私信。",
        locale: "zh-HK",
        dryRun: true,
        maxRepliesPerRun: 3,
        delaySeconds: 0
      });

      const result = await runXhsAutoReplyBatch(appConfig, "astrozi", "growth-agent", { runId: "test-run" });
      const queue = listXhsAutoReplies(appConfig, "astrozi");

      expect(result).toMatchObject({ scanned: 1, drafted: 1, replied: 0, failed: 0 });
      expect(queue.items[0]).toMatchObject({
        commentId: "comment-1",
        status: "drafted",
        replyContent: "适合新手，先从这篇的例子看就行。"
      });
      expect(hermesRequestBody).toContain("香港繁中");
    } finally {
      process.env.PATH = originalPath;
      globalThis.fetch = originalFetch;
    }
  });
});
