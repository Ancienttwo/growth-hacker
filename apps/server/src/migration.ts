import { copyFileSync, mkdirSync, readdirSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import {
  type MigrationFilePlan,
  type MigrationPlan,
  type MigrationProfilePlan,
  XIAOHONGSHU_PLATFORM
} from "@growth-hacker/core";

import type { AppConfig } from "./config";
import { ensureGrowthRoot, profileRoot, readManifest, safeStat, writeManifest } from "./workspace";

export function planXiaohongshuLegacyMigration(config: AppConfig): MigrationPlan {
  ensureGrowthRoot(config);
  const sourceRoot = config.legacyXiaohongshuRoot;
  const targetRoot = config.growthRoot;
  const profiles: MigrationProfilePlan[] = [];
  const sourceStat = safeStat(sourceRoot);
  if (!sourceStat?.isDirectory()) {
    return { id: "xiaohongshu-legacy", sourceRoot, targetRoot, profiles, conflictCount: 0, copyCount: 0 };
  }

  for (const profile of readdirSync(sourceRoot).sort()) {
    const source = join(sourceRoot, profile);
    if (!safeStat(source)?.isDirectory()) continue;
    const target = profileRoot(config, XIAOHONGSHU_PLATFORM, profile);
    const files = planProfileFiles(source, target);
    const conflictCount = files.filter((file) => file.action === "conflict").length;
    const copyCount = files.filter((file) => file.action === "copy").length;
    profiles.push({
      platform: XIAOHONGSHU_PLATFORM,
      profile,
      source,
      target,
      status: conflictCount ? "conflict" : copyCount ? "ready" : "empty",
      files
    });
  }

  return {
    id: "xiaohongshu-legacy",
    sourceRoot,
    targetRoot,
    profiles,
    conflictCount: profiles.flatMap((profile) => profile.files).filter((file) => file.action === "conflict").length,
    copyCount: profiles.flatMap((profile) => profile.files).filter((file) => file.action === "copy").length
  };
}

export function runXiaohongshuLegacyMigration(config: AppConfig): MigrationPlan {
  const plan = planXiaohongshuLegacyMigration(config);
  for (const profile of plan.profiles) {
    for (const file of profile.files) {
      if (file.action !== "copy") continue;
      mkdirSync(dirname(file.target), { recursive: true });
      copyFileSync(file.source, file.target);
      const sourceStat = statSync(file.source);
      utimesSync(file.target, sourceStat.atime, sourceStat.mtime);
    }
  }

  const migrationPath = join(config.growthRoot, "migrations", "xiaohongshu-legacy.json");
  mkdirSync(dirname(migrationPath), { recursive: true });
  writeFileSync(migrationPath, JSON.stringify({ ...plan, ranAt: new Date().toISOString() }, null, 2) + "\n");

  const manifest = readManifest(config);
  manifest.knownPlatforms = Array.from(new Set([...manifest.knownPlatforms, XIAOHONGSHU_PLATFORM]));
  manifest.migrations.push({
    id: "xiaohongshu-legacy",
    status: plan.conflictCount ? "partial" : "completed",
    createdAt: new Date().toISOString(),
    source: plan.sourceRoot,
    target: plan.targetRoot
  });
  writeManifest(config, manifest);

  return plan;
}

function planProfileFiles(sourceRoot: string, targetRoot: string): MigrationFilePlan[] {
  const files: MigrationFilePlan[] = [];
  walkFiles(sourceRoot, (source) => {
    const relativePath = relative(sourceRoot, source);
    const target = join(targetRoot, relativePath);
    const sourceStat = statSync(source);
    const targetStat = safeStat(target);
    if (!targetStat) {
      files.push({
        relativePath,
        source,
        target,
        action: "copy",
        reason: "target-missing",
        sourceSize: sourceStat.size,
        sourceMtimeMs: sourceStat.mtimeMs
      });
      return;
    }
    if (targetStat.size === sourceStat.size && Math.abs(targetStat.mtimeMs - sourceStat.mtimeMs) < 1000) {
      files.push({
        relativePath,
        source,
        target,
        action: "skip",
        reason: "same-size-and-mtime",
        sourceSize: sourceStat.size,
        targetSize: targetStat.size,
        sourceMtimeMs: sourceStat.mtimeMs,
        targetMtimeMs: targetStat.mtimeMs
      });
      return;
    }
    files.push({
      relativePath,
      source,
      target,
      action: "conflict",
      reason: "target-exists-with-different-size-or-mtime",
      sourceSize: sourceStat.size,
      targetSize: targetStat.size,
      sourceMtimeMs: sourceStat.mtimeMs,
      targetMtimeMs: targetStat.mtimeMs
    });
  });
  return files;
}

function walkFiles(root: string, visit: (path: string) => void): void {
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walkFiles(path, visit);
    else if (stat.isFile()) visit(path);
  }
}
