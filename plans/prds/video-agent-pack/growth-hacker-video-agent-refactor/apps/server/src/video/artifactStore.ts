import { createHash } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import type { VideoArtifact } from "@growth-hacker/video-agent";
import { VideoAgentError } from "@growth-hacker/video-agent";
import type { AppConfig } from "../config";
import type { ArtifactInsert, VideoRepository } from "./repository";

export interface WriteArtifactInput {
  projectId: string;
  revision: number;
  runId?: string;
  stepId?: string;
  kind: string;
  mediaType: string;
  relativePath: string;
  content: string | Uint8Array;
  schemaVersion?: string;
  producer: string;
  sourceArtifactIds?: string[];
  metadata?: Record<string, unknown>;
}

export class VideoArtifactStore {
  private readonly root: string;
  private readonly exportsRoot: string;

  constructor(
    config: AppConfig,
    private readonly repository: VideoRepository,
  ) {
    this.root = resolve(config.growthRoot, "video-projects");
    this.exportsRoot = resolve(config.growthRoot, "video-exports");
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    mkdirSync(this.exportsRoot, { recursive: true, mode: 0o700 });
  }

  writeText(input: Omit<WriteArtifactInput, "content"> & { content: string }): VideoArtifact {
    return this.write(input);
  }

  writeJson(input: Omit<WriteArtifactInput, "content" | "mediaType"> & { content: unknown }): VideoArtifact {
    return this.write({
      ...input,
      mediaType: "application/json; charset=utf-8",
      content: `${JSON.stringify(input.content, null, 2)}\n`,
    });
  }

  writeJsonLines(input: Omit<WriteArtifactInput, "content" | "mediaType"> & { values: unknown[] }): VideoArtifact {
    return this.write({
      ...input,
      mediaType: "application/x-ndjson; charset=utf-8",
      content: input.values.map((value) => JSON.stringify(value)).join("\n") + (input.values.length ? "\n" : ""),
    });
  }

  readText(artifact: VideoArtifact): string {
    return readFileSync(this.resolveArtifact(artifact), "utf8");
  }

  readJson<T>(artifact: VideoArtifact): T {
    try {
      return JSON.parse(this.readText(artifact)) as T;
    } catch (error) {
      throw new VideoAgentError("invalid_input", `Artifact '${artifact.id}' is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  resolveArtifact(artifact: VideoArtifact): string {
    const projectRoot = this.projectRoot(artifact.projectId);
    const target = resolve(projectRoot, artifact.relativePath);
    assertInside(projectRoot, target);
    try {
      const stat = statSync(target);
      if (!stat.isFile()) throw new Error("not a regular file");
    } catch {
      throw new VideoAgentError("artifact_not_found", `Artifact file '${artifact.relativePath}' was not found.`);
    }
    return target;
  }

  exportArtifacts(projectId: string, revision: number, runId: string, artifactIds?: readonly string[]): {
    exportUri: string;
    relativeDirectory: string;
    files: string[];
    artifactCount: number;
  } {
    const projectExportRoot = resolve(this.exportsRoot, normalizeProjectId(projectId));
    assertInside(this.exportsRoot, projectExportRoot);
    const normalizedRunId = normalizeRunId(runId);
    const exportName = `revision-${revision}-${normalizedRunId}-${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`;
    const targetRoot = resolve(projectExportRoot, exportName);
    assertInside(projectExportRoot, targetRoot);
    mkdirSync(targetRoot, { recursive: true, mode: 0o700 });
    const runArtifacts = this.repository.listArtifacts(projectId, revision).filter((artifact) => artifact.runId === normalizedRunId);
    const byId = new Map(runArtifacts.map((artifact) => [artifact.id, artifact]));
    const selectedIds = artifactIds ? [...new Set(artifactIds)] : runArtifacts.map((artifact) => artifact.id);
    const artifacts = selectedIds.map((id) => byId.get(id)).filter((artifact): artifact is VideoArtifact => Boolean(artifact));
    if (!artifacts.length) {
      throw new VideoAgentError("artifact_not_found", `Run '${runId}' has no registered artifacts to export.`);
    }
    if (artifacts.length !== selectedIds.length) {
      const missing = selectedIds.filter((id) => !byId.has(id));
      throw new VideoAgentError("artifact_not_found", "The export manifest references missing or foreign artifacts.", {
        details: { runId: normalizedRunId, missingArtifactIds: missing },
      });
    }
    const files: string[] = [];
    for (const artifact of artifacts) {
      const target = resolve(targetRoot, artifact.relativePath);
      assertInside(targetRoot, target);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      const source = this.resolveArtifact(artifact);
      assertFileMatches(source, artifact.sha256, artifact.byteSize, artifact.relativePath);
      copyFileSync(source, target);
      assertFileMatches(target, artifact.sha256, artifact.byteSize, artifact.relativePath);
      files.push(relative(targetRoot, target).replace(/\\/g, "/"));
    }
    const relativeDirectory = relative(this.exportsRoot, targetRoot).replace(/\\/g, "/");
    return {
      exportUri: `growth://video/exports/${relativeDirectory}`,
      relativeDirectory,
      files,
      artifactCount: artifacts.length,
    };
  }

  private write(input: WriteArtifactInput): VideoArtifact {
    const projectRoot = this.projectRoot(input.projectId);
    const normalizedRelative = normalizeRelativePath(input.relativePath);
    const target = resolve(projectRoot, normalizedRelative);
    assertInside(projectRoot, target);
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });

    const bytes = typeof input.content === "string" ? Buffer.from(input.content, "utf8") : Buffer.from(input.content);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const registered = this.repository.findArtifactByRelativePath(input.projectId, input.revision, normalizedRelative);
    if (registered) return this.assertCompatibleArtifact(registered, input, sha256, bytes.byteLength);

    const temporary = `${target}.tmp-${crypto.randomUUID()}`;
    let descriptor: number | undefined;
    try {
      if (!existsSync(target)) {
        try {
          descriptor = openSync(temporary, "wx", 0o600);
          writeFileSync(descriptor, bytes);
          fsyncSync(descriptor);
          closeSync(descriptor);
          descriptor = undefined;
          // link() is an atomic no-replace publish on the same filesystem. Unlike rename(),
          // it cannot silently overwrite a previously registered immutable artifact.
          linkSync(temporary, target);
          unlinkSync(temporary);
          fsyncDirectory(dirname(target));
        } catch (error) {
          if (descriptor !== undefined) closeSync(descriptor);
          descriptor = undefined;
          try { unlinkSync(temporary); } catch { /* best-effort cleanup */ }
          // Another worker, or a prior crash after file publication but before DB insertion,
          // may have created the immutable file. Adopt it only when its bytes match exactly.
          if (!existsSync(target)) throw error;
        }
      }
      assertFileMatches(target, sha256, bytes.byteLength, normalizedRelative);
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
      try { unlinkSync(temporary); } catch { /* best-effort cleanup */ }
    }

    const now = Date.now();
    const insert: ArtifactInsert = {
      id: createId("vart"),
      projectId: input.projectId,
      revision: input.revision,
      runId: input.runId,
      stepId: input.stepId,
      kind: input.kind,
      mediaType: input.mediaType,
      relativePath: normalizedRelative,
      byteSize: bytes.byteLength,
      sha256,
      schemaVersion: input.schemaVersion,
      producer: input.producer,
      sourceArtifactIds: input.sourceArtifactIds,
      metadata: input.metadata,
      createdAt: now,
    };
    try {
      return this.repository.insertArtifact(insert);
    } catch (error) {
      // A concurrent writer may have registered the same immutable path after our first
      // lookup. Return that record only if all immutable identity fields still match.
      const raced = this.repository.findArtifactByRelativePath(input.projectId, input.revision, normalizedRelative);
      if (raced) return this.assertCompatibleArtifact(raced, input, sha256, bytes.byteLength);
      // The published file remains available for deterministic adoption on retry.
      throw error;
    }
  }

  private assertCompatibleArtifact(
    artifact: VideoArtifact,
    input: WriteArtifactInput,
    sha256: string,
    byteSize: number,
  ): VideoArtifact {
    const sameIdentity = artifact.sha256 === sha256
      && artifact.byteSize === byteSize
      && artifact.kind === input.kind
      && artifact.mediaType === input.mediaType
      && artifact.runId === input.runId
      && artifact.stepId === input.stepId
      && artifact.producer === input.producer
      && artifact.schemaVersion === input.schemaVersion
      && equalStringArrays(artifact.sourceArtifactIds, input.sourceArtifactIds ?? []);
    if (!sameIdentity) {
      throw new VideoAgentError("artifact_collision", `Artifact path '${artifact.relativePath}' is already registered with different immutable content or ownership.`, {
        status: 409,
        details: {
          artifactId: artifact.id,
          expectedSha256: sha256,
          actualSha256: artifact.sha256,
          expectedKind: input.kind,
          actualKind: artifact.kind,
        },
      });
    }
    assertFileMatches(this.resolveArtifact(artifact), sha256, byteSize, artifact.relativePath);
    return artifact;
  }

  private projectRoot(projectId: string): string {
    const id = normalizeProjectId(projectId);
    const target = resolve(this.root, id);
    assertInside(this.root, target);
    mkdirSync(target, { recursive: true, mode: 0o700 });
    return target;
  }
}

function equalStringArrays(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizeRelativePath(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0") || normalized.split("/").some((part) => part === ".." || part === "")) {
    throw new VideoAgentError("invalid_input", `Invalid artifact path '${value}'.`);
  }
  return normalized;
}

function normalizeProjectId(value: string): string {
  const id = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,179}$/.test(id)) throw new VideoAgentError("invalid_input", "Invalid project ID.");
  return id;
}

function normalizeRunId(value: string): string {
  const id = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,179}$/.test(id)) throw new VideoAgentError("invalid_input", "Invalid workflow run ID.");
  return id;
}

function assertInside(root: string, target: string): void {
  const base = resolve(root);
  const value = resolve(target);
  if (value !== base && !value.startsWith(`${base}${sep}`)) {
    throw new VideoAgentError("invalid_input", "Artifact path escapes the video project root.");
  }
}

function assertFileMatches(path: string, expectedSha256: string, expectedByteSize: number, relativePath: string): void {
  const stat = statSync(path);
  if (!stat.isFile() || stat.size !== expectedByteSize) {
    throw new VideoAgentError("artifact_collision", `Artifact file '${relativePath}' does not match the expected immutable size.`, {
      status: 409,
      details: { expectedByteSize, actualByteSize: stat.isFile() ? stat.size : null },
    });
  }
  const actualSha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (actualSha256 !== expectedSha256) {
    throw new VideoAgentError("artifact_collision", `Artifact file '${relativePath}' does not match the expected immutable checksum.`, {
      status: 409,
      details: { expectedSha256, actualSha256 },
    });
  }
}

function fsyncDirectory(path: string): void {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, "r");
    fsyncSync(descriptor);
  } catch {
    // Some platforms/filesystems do not permit directory fsync. The file itself is already durable.
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}
