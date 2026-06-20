import { describe, expect, test } from "bun:test";

import { runCommand } from "../src/shell";

describe("shell command runner", () => {
  test("marks timed out commands and force-kills after the grace window", async () => {
    const startedAt = performance.now();
    const result = await runCommand(
      process.execPath,
      ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"],
      { timeoutMs: 50, timeoutKillGraceMs: 50 }
    );

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(performance.now() - startedAt).toBeLessThan(1000);
  });
});
