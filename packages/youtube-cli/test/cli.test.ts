import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { run } from "../src/cli";
import { buildRuntimeConfig } from "../src/config";
import { writeUploadState } from "../src/store";

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

  test("validates upload safety flags before auth", async () => {
    const result = await captureRun([
      "upload",
      "create",
      "--file",
      "video.mp4",
      "--title",
      "Launch",
      "--contains-synthetic-media",
      "true",
      "--json"
    ]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: {
        code: "youtube_invalid_args",
        message: "Missing required --made-for-kids true|false."
      }
    });
  });

  test("blocks public upload without confirmation before file checks", async () => {
    const result = await captureRun([
      "upload",
      "create",
      "--file",
      "missing.mp4",
      "--title",
      "Launch",
      "--privacy",
      "public",
      "--made-for-kids",
      "false",
      "--contains-synthetic-media",
      "true",
      "--json"
    ]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: { code: "youtube_public_upload_requires_confirmation" }
    });
  });

  test("lists local upload states without auth", async () => {
    const root = await tempRoot();
    await writeUploadState(buildRuntimeConfig({ profile: "astrozi", growthRoot: root }), uploadStateFixture("astrozi"));

    const result = await captureRun(["upload", "status", "--profile", "astrozi", "--growth-root", root, "--json"]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      data: {
        uploads: [
          {
            uploadId: "abcdef1234567890",
            privacyStatus: "private"
          }
        ]
      }
    });
  });

  test("validates resume upload id", async () => {
    const result = await captureRun(["upload", "resume", "--json"]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: { code: "youtube_invalid_args" }
    });
  });

  test("dry-runs comment reply without auth", async () => {
    const result = await captureRun([
      "comments",
      "reply",
      "--parent-id",
      "comment-1",
      "--text",
      "thanks",
      "--json"
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      data: {
        comment: {
          action: "reply",
          dryRun: true,
          parentId: "comment-1",
          textOriginal: "thanks"
        }
      }
    });
  });

  test("dry-runs comment moderation with ban-author", async () => {
    const result = await captureRun([
      "comments",
      "moderate",
      "--comment-id",
      "comment-1",
      "--status",
      "rejected",
      "--ban-author",
      "--json"
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      data: {
        comment: {
          action: "moderate",
          dryRun: true,
          commentId: "comment-1",
          moderationStatus: "rejected",
          banAuthor: true
        }
      }
    });
  });

  test("rejects comment delete confirm mismatch before auth", async () => {
    const result = await captureRun([
      "comments",
      "delete",
      "--comment-id",
      "comment-1",
      "--confirm",
      "wrong",
      "--json"
    ]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      error: { code: "youtube_confirm_mismatch" }
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

function uploadStateFixture(profile: string) {
  const now = new Date("2026-05-25T00:00:00.000Z").toISOString();
  return {
    schemaVersion: 1 as const,
    profile,
    account: "youtube" as const,
    uploadId: "abcdef1234567890",
    filePath: "/tmp/video.mp4",
    size: 16,
    mimeType: "video/mp4",
    metadata: {
      snippet: { title: "Launch" },
      status: { privacyStatus: "private" }
    },
    sessionUrl: "https://upload.youtube.test/session/1",
    createdAt: now,
    updatedAt: now
  };
}
