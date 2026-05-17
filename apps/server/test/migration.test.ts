import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type { AppConfig } from "../src/config";
import { planXiaohongshuLegacyMigration, runXiaohongshuLegacyMigration } from "../src/migration";
import { listWorkspaces, readManifest } from "../src/workspace";

function fixtureConfig(): AppConfig {
  const root = mkdtempSync(join(tmpdir(), "growth-hacker-"));
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

describe("legacy Xiaohongshu migration", () => {
  test("copies legacy profiles into the canonical growth workspace without deleting source", () => {
    const config = fixtureConfig();
    const legacyProfile = join(config.legacyXiaohongshuRoot, "astrozi");
    mkdirSync(join(legacyProfile, "drafts"), { recursive: true });
    writeFileSync(join(legacyProfile, "01-client-brief.md"), "# Brief\n");
    writeFileSync(join(legacyProfile, "drafts", "D3.md"), "# Draft\n");

    const plan = planXiaohongshuLegacyMigration(config);
    expect(plan.copyCount).toBe(2);
    expect(plan.conflictCount).toBe(0);
    expect(plan.profiles[0].target).toEndWith(".growth/xiaohongshu/astrozi");

    runXiaohongshuLegacyMigration(config);

    expect(readFileSync(join(config.growthRoot, "xiaohongshu", "astrozi", "01-client-brief.md"), "utf8")).toBe("# Brief\n");
    expect(readFileSync(join(legacyProfile, "01-client-brief.md"), "utf8")).toBe("# Brief\n");
    expect(listWorkspaces(config)[0]).toMatchObject({ platform: "xiaohongshu", profile: "astrozi", artifactCount: 2 });
    expect(readManifest(config).migrations.at(-1)?.status).toBe("completed");
    expect(planXiaohongshuLegacyMigration(config)).toMatchObject({ copyCount: 0, conflictCount: 0 });
  });

  test("reports target conflicts instead of overwriting", () => {
    const config = fixtureConfig();
    const source = join(config.legacyXiaohongshuRoot, "astrozi");
    const target = join(config.growthRoot, "xiaohongshu", "astrozi");
    mkdirSync(source, { recursive: true });
    mkdirSync(target, { recursive: true });
    writeFileSync(join(source, "metrics.csv"), "legacy\n");
    writeFileSync(join(target, "metrics.csv"), "canonical-with-edit\n");
    const before = statSync(join(target, "metrics.csv")).size;

    const plan = runXiaohongshuLegacyMigration(config);

    expect(plan.conflictCount).toBe(1);
    expect(plan.profiles[0].files[0]).toMatchObject({ action: "conflict" });
    expect(statSync(join(target, "metrics.csv")).size).toBe(before);
    expect(readManifest(config).migrations.at(-1)?.status).toBe("partial");
  });
});
