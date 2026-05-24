import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { run } from "../src/cli";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("yt-cli command runner", () => {
  test("prints help as a JSON envelope", async () => {
    const result = await captureRun(["--help", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true });
    expect(result.stderr).toBe("");
  });

  test("returns auth status without requiring a token", async () => {
    const root = await tempRoot();
    const result = await captureRun(["auth", "status", "--profile", "astrozi", "--growth-root", root, "--json"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      data: { authenticated: false, state: "missing" },
      meta: { profile: "astrozi", account: "youtube" }
    });
  });

  test("returns stable JSON errors for unknown commands", async () => {
    const result = await captureRun(["nope", "--json"]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: { code: "youtube_unknown_command" }
    });
  });

  test("validates required command options", async () => {
    const root = await tempRoot();
    const result = await captureRun(["videos", "get", "--growth-root", root, "--json"]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: { code: "youtube_invalid_args" }
    });
  });
});

async function captureRun(argv: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const originalStdout = process.stdout.write;
  const originalStderr = process.stderr.write;
  let stdout = "";
  let stderr = "";
  process.stdout.write = ((chunk: unknown) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown) => {
    stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write;
  try {
    const exitCode = await run(argv);
    return { exitCode, stdout, stderr };
  } finally {
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
  }
}

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "yt-cli-run-"));
  tempRoots.push(root);
  return root;
}
