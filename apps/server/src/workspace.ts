import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";

import {
  type ArtifactContent,
  type ArtifactInfo,
  type GrowthWorkspaceManifest,
  type WorkspaceProfile,
  WORKSPACE_SCHEMA_VERSION,
  XIAOHONGSHU_PLATFORM,
  mimeFromPath
} from "@growth-hacker/core";

import type { AppConfig } from "./config";

const TEXT_LIMIT_BYTES = 1024 * 1024;
const PREVIEW_MIME_TYPES = new Set<ArtifactInfo["mime"]>(["image", "video"]);

export function ensureGrowthRoot(config: AppConfig): void {
  mkdirSync(config.growthRoot, { recursive: true });
  mkdirSync(join(config.growthRoot, "migrations"), { recursive: true });
  const manifestPath = join(config.growthRoot, "workspace.json");
  if (!safeExists(manifestPath)) {
    writeManifest(config, {
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      growthRoot: config.growthRoot,
      knownPlatforms: [XIAOHONGSHU_PLATFORM],
      migrations: []
    });
  }
}

export function readManifest(config: AppConfig): GrowthWorkspaceManifest {
  ensureGrowthRoot(config);
  const path = join(config.growthRoot, "workspace.json");
  return JSON.parse(readFileSync(path, "utf8")) as GrowthWorkspaceManifest;
}

export function writeManifest(config: AppConfig, manifest: GrowthWorkspaceManifest): void {
  mkdirSync(config.growthRoot, { recursive: true });
  writeFileSync(join(config.growthRoot, "workspace.json"), JSON.stringify(manifest, null, 2) + "\n");
}

export function platformRoot(config: AppConfig, platform: string): string {
  assertSafeSegment(platform, "platform");
  return join(config.growthRoot, platform);
}

export function profileRoot(config: AppConfig, platform: string, profile: string): string {
  assertSafeSegment(profile, "profile");
  return join(platformRoot(config, platform), profile);
}

export function listWorkspaces(config: AppConfig): WorkspaceProfile[] {
  ensureGrowthRoot(config);
  const platforms = safeReaddir(config.growthRoot).filter((entry) => {
    const path = join(config.growthRoot, entry);
    return safeStat(path)?.isDirectory() && entry !== "migrations";
  });

  const profiles: WorkspaceProfile[] = [];
  for (const platform of platforms) {
    for (const profile of safeReaddir(join(config.growthRoot, platform))) {
      const path = join(config.growthRoot, platform, profile);
      const stat = safeStat(path);
      if (!stat?.isDirectory()) continue;
      profiles.push({
        platform,
        profile,
        path,
        updatedAt: stat.mtime.toISOString(),
        artifactCount: countFiles(path)
      });
    }
  }
  return profiles.sort((a, b) => `${a.platform}/${a.profile}`.localeCompare(`${b.platform}/${b.profile}`));
}

export function listArtifacts(config: AppConfig, platform: string, profile: string): ArtifactInfo[] {
  const root = profileRoot(config, platform, profile);
  assertAllowedPath(config, root);
  if (!safeStat(root)?.isDirectory()) return [];
  const artifacts: ArtifactInfo[] = [];
  walk(root, (path) => {
    const stat = statSync(path);
    const rel = relative(root, path);
    artifacts.push({
      platform,
      profile,
      path: rel,
      name: basename(path),
      kind: stat.isDirectory() ? "directory" : "file",
      mime: stat.isDirectory() ? "directory" : mimeFromPath(path),
      size: stat.size,
      updatedAt: stat.mtime.toISOString()
    });
  });
  return artifacts.sort((a, b) => a.path.localeCompare(b.path));
}

export function readArtifact(config: AppConfig, platform: string, profile: string, artifactPath: string): ArtifactContent {
  const { info, target } = resolveArtifact(config, platform, profile, artifactPath);
  if (info.kind === "directory" || PREVIEW_MIME_TYPES.has(info.mime) || info.size > TEXT_LIMIT_BYTES) {
    return { artifact: info, binary: true };
  }
  return { artifact: info, content: readFileSync(target, "utf8") };
}

export function resolveArtifact(config: AppConfig, platform: string, profile: string, artifactPath: string): { info: ArtifactInfo; target: string } {
  const root = profileRoot(config, platform, profile);
  const target = resolve(root, artifactPath || ".");
  assertInside(root, target);
  assertAllowedPath(config, target);
  const stat = statSync(target);
  const info: ArtifactInfo = {
    platform,
    profile,
    path: relative(root, target),
    name: basename(target),
    kind: stat.isDirectory() ? "directory" : "file",
    mime: stat.isDirectory() ? "directory" : mimeFromPath(target),
    size: stat.size,
    updatedAt: stat.mtime.toISOString()
  };
  return { info, target };
}

export function isPreviewableArtifact(info: ArtifactInfo): boolean {
  return info.kind === "file" && PREVIEW_MIME_TYPES.has(info.mime);
}

export function artifactContentType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mp4") || lower.endsWith(".m4v")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  if (lower.endsWith(".webm")) return "video/webm";
  return "application/octet-stream";
}

export function assertAllowedPath(config: AppConfig, path: string): void {
  const allowed = [config.growthRoot, config.legacyXiaohongshuRoot, config.hermesHome, config.bundledXiaohongshuSkillRoot].map((item) =>
    resolve(item)
  );
  if (!allowed.some((root) => path === root || path.startsWith(root + sep))) {
    throw new Error(`Path outside allowed roots: ${path}`);
  }
}

export function assertInside(root: string, target: string): void {
  const base = resolve(root);
  const value = resolve(target);
  if (value !== base && !value.startsWith(base + sep)) {
    throw new Error(`Path traversal blocked: ${target}`);
  }
}

export function assertSafeSegment(value: string, label: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function walk(root: string, visit: (path: string) => void, depth = 0): void {
  if (depth > 6) return;
  for (const entry of safeReaddir(root)) {
    const path = join(root, entry);
    visit(path);
    if (safeStat(path)?.isDirectory()) walk(path, visit, depth + 1);
  }
}

function countFiles(root: string): number {
  let count = 0;
  walk(root, (path) => {
    if (safeStat(path)?.isFile()) count += 1;
  });
  return count;
}

export function safeExists(path: string): boolean {
  return Boolean(safeStat(path));
}

export function safeStat(path: string) {
  try {
    return statSync(path);
  } catch {
    return undefined;
  }
}

function safeReaddir(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}
