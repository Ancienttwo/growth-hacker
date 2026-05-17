import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type { AppConfig } from "../src/config";
import { listHermesProfileSkills, updateHermesProfileSkill } from "../src/hermesSkills";

function config(): AppConfig {
  const root = mkdtempSync(join(tmpdir(), "growth-hacker-hermes-skills-"));
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

function writeSkill(appConfig: AppConfig, category: string, name: string, description: string): void {
  const dir = join(appConfig.hermesHome, "profiles", "growth-agent", "skills", category, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
    "utf8"
  );
}

describe("Hermes profile skills", () => {
  test("lists profile skills with disabled state from the profile config", () => {
    const appConfig = config();
    mkdirSync(join(appConfig.hermesHome, "profiles", "growth-agent"), { recursive: true });
    writeFileSync(join(appConfig.hermesHome, "profiles", "growth-agent", "config.yaml"), "skills:\n  disabled:\n    - think\n", "utf8");
    writeSkill(appConfig, "openclaw-imports", "think", "Plan before implementation");
    writeSkill(appConfig, "social-media", "xiaohongshu-skill", "XHS operations");

    const skills = listHermesProfileSkills(appConfig, "growth-agent");

    expect(skills.map((skill) => skill.name)).toEqual(["xiaohongshu-skill", "think"]);
    expect(skills.find((skill) => skill.name === "think")).toMatchObject({
      category: "openclaw-imports",
      description: "Plan before implementation",
      enabled: false,
      status: "disabled"
    });
    expect(skills.find((skill) => skill.name === "xiaohongshu-skill")).toMatchObject({ enabled: true });
  });

  test("updates the disabled list for an allowed agent only", () => {
    const appConfig = config();
    writeSkill(appConfig, "openclaw-imports", "think", "Plan before implementation");

    const disabled = updateHermesProfileSkill(appConfig, "growth-agent", "think", false);
    expect(disabled.enabled).toBe(false);
    expect(readFileSync(join(appConfig.hermesHome, "profiles", "growth-agent", "config.yaml"), "utf8")).toContain("- think");

    const enabled = updateHermesProfileSkill(appConfig, "growth-agent", "think", true);
    expect(enabled.enabled).toBe(true);
    expect(listHermesProfileSkills(appConfig, "growth-agent")[0]).toMatchObject({ name: "think", enabled: true });
  });

  test("rejects agents outside the dashboard allowlist", () => {
    const appConfig = config();

    expect(() => listHermesProfileSkills(appConfig, "researcher")).toThrow("agent_not_allowed:researcher");
  });
});
