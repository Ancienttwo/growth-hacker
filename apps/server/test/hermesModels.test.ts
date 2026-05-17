import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type { AppConfig } from "../src/config";
import { listHermesModelOptions, resolveHermesLlmSelection, runHermesProviderPrompt } from "../src/hermesModels";

function config(root: string): AppConfig {
  return {
    growthRoot: join(root, ".growth"),
    hermesHome: join(root, ".hermes"),
    hermesApiBaseUrl: "http://127.0.0.1:8642",
    hermesApiKey: "",
    defaultHermesProfile: "growth-agent",
    socialAgents: [{ id: "growth-agent", runner: "hermes" }],
    socialCronAgents: ["growth-agent"],
    bundledXiaohongshuSkillRoot: join(root, "skill"),
    legacyXiaohongshuRoot: join(root, ".xiaohongshu", "client"),
    port: 0
  };
}

describe("Hermes model options", () => {
  test("normalizes Hermes authenticated provider inventory without exposing credentials", async () => {
    const root = mkdtempSync(join(tmpdir(), "growth-hacker-hermes-models-"));
    const appConfig = config(root);
    const python = join(appConfig.hermesHome, "hermes-agent", "venv", "bin", "python");
    mkdirSync(join(python, ".."), { recursive: true });
    writeFileSync(
      python,
      `#!/bin/sh
cat <<'JSON'
{"provider":"openai-codex","model":"gpt-5.5","providers":[{"slug":"openai-codex","name":"OpenAI Codex","is_current":true,"source":"hermes","models":["gpt-5.5","bad model"],"total_models":2},{"slug":"anthropic","name":"Anthropic","is_current":false,"source":"built-in","models":["claude-opus-4-7"],"total_models":1}]}
JSON
`,
      { mode: 0o755 }
    );

    const options = await listHermesModelOptions(appConfig);

    expect(options.current).toEqual({ provider: "openai-codex", model: "gpt-5.5" });
    expect(options.models.map((model) => model.value)).toEqual(["openai-codex::gpt-5.5", "anthropic::claude-opus-4-7"]);
    expect(JSON.stringify(options)).not.toContain("token");
  });

  test("runs a selected provider/model through Hermes oneshot for cron LLM work", async () => {
    const root = mkdtempSync(join(tmpdir(), "growth-hacker-hermes-run-"));
    const appConfig = config(root);
    const binDir = join(root, "bin");
    const logPath = join(root, "hermes-args.log");
    mkdirSync(binDir, { recursive: true });
    const hermes = join(binDir, "hermes");
    writeFileSync(
      hermes,
      `#!/bin/sh
printf '%s\\n' "$HERMES_HOME" "$@" > "${logPath}"
printf '%s\\n' '{"decisions":[]}'
`,
      { mode: 0o755 }
    );
    chmodSync(hermes, 0o755);
    const originalPath = process.env.PATH;
    process.env.PATH = `${binDir}:${originalPath ?? ""}`;

    try {
      const output = await runHermesProviderPrompt(appConfig, { provider: "anthropic", model: "claude-opus-4-7" }, "hello");

      expect(output).toBe('{"decisions":[]}');
      const args = readFileSync(logPath, "utf8");
      expect(args).toContain(appConfig.hermesHome);
      expect(args).toContain("--provider\nanthropic");
      expect(args).toContain("--model\nclaude-opus-4-7");
      expect(args).toContain("--oneshot\nhello");
    } finally {
      process.env.PATH = originalPath;
    }
  });

  test("rejects provider/model selections outside the authenticated Hermes inventory", async () => {
    const root = mkdtempSync(join(tmpdir(), "growth-hacker-hermes-select-"));
    const appConfig = config(root);
    const python = join(appConfig.hermesHome, "hermes-agent", "venv", "bin", "python");
    mkdirSync(join(python, ".."), { recursive: true });
    writeFileSync(
      python,
      `#!/bin/sh
cat <<'JSON'
{"provider":"openai-codex","model":"gpt-5.5","providers":[{"slug":"openai-codex","name":"OpenAI Codex","is_current":true,"models":["gpt-5.5"]}]}
JSON
`,
      { mode: 0o755 }
    );

    await expect(resolveHermesLlmSelection(appConfig, { provider: "openai-codex", model: "gpt-5.5" })).resolves.toEqual({
      provider: "openai-codex",
      model: "gpt-5.5"
    });
    await expect(resolveHermesLlmSelection(appConfig, { provider: "openai-codex", model: "gpt-5.4" })).rejects.toThrow(
      "llm_selection_not_available:openai-codex/gpt-5.4"
    );
  });
});
