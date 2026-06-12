#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(repoRoot, ".ai", "harness", "scripts", "check-skill-version.ts");

if (!existsSync(target)) {
  console.error(`Missing repo-harness helper runtime: ${target}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, [...process.execArgv, target, ...process.argv.slice(2)], {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
