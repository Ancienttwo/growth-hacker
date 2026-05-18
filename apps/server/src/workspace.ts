import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import {
  type ArtifactContent,
  type ArtifactInfo,
  type GrowthWorkspaceManifest,
  type WorkspaceProfile,
  VAULT_WORKSPACE_PLATFORM,
  VAULT_WORKSPACE_PROFILE,
  XIAOHONGSHU_PLATFORM,
  WORKSPACE_PLATFORMS,
  WORKSPACE_SCHEMA_VERSION,
  type XhsAuthStatus,
  mimeFromPath
} from "@growth-hacker/core";

import type { AppConfig } from "./config";

const TEXT_LIMIT_BYTES = 1024 * 1024;
const CHAT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const PREVIEW_MIME_TYPES = new Set<ArtifactInfo["mime"]>(["image", "video"]);
const CHAT_UPLOAD_IMAGE_EXTENSIONS = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/gif", "gif"],
  ["image/webp", "webp"]
]);
const INTERNAL_WORKSPACE_DIRS = new Set(["migrations", "published-posts", "social-board", "social-cron", "vault"]);
const XHS_TEMPLATE_MAP = new Map([
  ["client-brief.md", "01-client-brief.md"],
  ["competitor-analysis.md", "02-competitor-analysis.md"],
  ["account-strategy.md", "03-account-strategy.md"],
  ["content-calendar.md", "04-content-calendar.md"],
  ["daily-ops-checklist.md", "05-daily-ops.md"],
  ["health-report.md", "06-health-report.md"],
  ["metrics-template.csv", "metrics.csv"],
  ["client-playbook.md", "playbook.md"]
]);

export function ensureGrowthRoot(config: AppConfig): void {
  mkdirSync(config.growthRoot, { recursive: true });
  mkdirSync(join(config.growthRoot, "migrations"), { recursive: true });
  const manifestPath = join(config.growthRoot, "workspace.json");
  if (!safeExists(manifestPath)) {
    writeManifest(config, {
      schemaVersion: WORKSPACE_SCHEMA_VERSION,
      growthRoot: config.growthRoot,
      knownPlatforms: WORKSPACE_PLATFORMS,
      migrations: []
    });
  }
  migratePlatformFirstWorkspaceLayout(config);
}

export function readManifest(config: AppConfig): GrowthWorkspaceManifest {
  ensureGrowthRoot(config);
  const path = join(config.growthRoot, "workspace.json");
  const manifest = JSON.parse(readFileSync(path, "utf8")) as GrowthWorkspaceManifest;
  manifest.knownPlatforms = Array.from(new Set([...WORKSPACE_PLATFORMS, ...manifest.knownPlatforms]));
  return manifest;
}

export function writeManifest(config: AppConfig, manifest: GrowthWorkspaceManifest): void {
  mkdirSync(config.growthRoot, { recursive: true });
  writeFileSync(join(config.growthRoot, "workspace.json"), JSON.stringify(manifest, null, 2) + "\n");
}

export function profileRoot(config: AppConfig, platform: string, profile: string): string {
  assertSafeSegment(profile, "profile");
  assertSafeSegment(platform, "platform");
  return join(config.growthRoot, profile, platform);
}

export function vaultRoot(config: AppConfig): string {
  return join(config.growthRoot, "vault");
}

export function xhsDocumentRoot(config: AppConfig, profile: string): string {
  assertSafeSegment(profile, "profile");
  return join(vaultRoot(config), profile, XIAOHONGSHU_PLATFORM);
}

export function listWorkspaces(config: AppConfig): WorkspaceProfile[] {
  ensureGrowthRoot(config);
  const knownPlatforms = new Set(readManifest(config).knownPlatforms);
  const profileDirs = safeReaddir(config.growthRoot).filter((entry) => {
    const path = join(config.growthRoot, entry);
    return safeStat(path)?.isDirectory() && !INTERNAL_WORKSPACE_DIRS.has(entry) && !knownPlatforms.has(entry);
  });

  const profiles: WorkspaceProfile[] = [];
  for (const profile of profileDirs) {
    for (const platform of safeReaddir(join(config.growthRoot, profile))) {
      if (!knownPlatforms.has(platform)) continue;
      const path = profileRoot(config, platform, profile);
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

export function ensureXhsWorkspaceForAuth(config: AppConfig, auth: XhsAuthStatus): WorkspaceProfile | undefined {
  if (!auth.authenticated) return undefined;
  const existing = listWorkspaces(config).filter((profile) => profile.platform === XIAOHONGSHU_PLATFORM);
  if (existing.length) return undefined;

  const profile = xhsProfileFromAuth(auth);
  const root = profileRoot(config, XIAOHONGSHU_PLATFORM, profile);
  const documentRoot = xhsDocumentRoot(config, profile);
  mkdirSync(root, { recursive: true });
  mkdirSync(documentRoot, { recursive: true });
  mkdirSync(join(documentRoot, "lessons"), { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const clientName = auth.nickname || auth.redId || "Xiaohongshu Account";
  const replacements = new Map([
    ["CLIENT_NAME", clientName],
    ["CLIENT_SLUG", profile],
    ["PROFILE", profile],
    ["INDUSTRY", "小红书账号运营"],
    ["DATE", today]
  ]);
  seedXhsWorkspaceTemplates(config, documentRoot, replacements);

  const accountPath = join(root, "xhs-account.json");
  if (!safeExists(accountPath)) {
    writeFileSync(
      accountPath,
      JSON.stringify(
        {
          platform: XIAOHONGSHU_PLATFORM,
          profile,
          nickname: auth.nickname,
          redId: auth.redId,
          source: "xhs whoami",
          createdAt: new Date().toISOString()
        },
        null,
        2
      ) + "\n",
      { mode: 0o600 }
    );
  }

  return {
    platform: XIAOHONGSHU_PLATFORM,
    profile,
    path: root,
    updatedAt: safeStat(root)?.mtime.toISOString(),
    artifactCount: countFiles(root)
  };
}

export function listArtifacts(config: AppConfig, platform: string, profile: string): ArtifactInfo[] {
  const root = profileRoot(config, platform, profile);
  assertAllowedPath(config, root);
  if (!safeStat(root)?.isDirectory()) return [];
  return listArtifactsAtRoot(root, platform, profile);
}

export function listVaultArtifacts(config: AppConfig): ArtifactInfo[] {
  const root = vaultRoot(config);
  mkdirSync(root, { recursive: true });
  assertAllowedPath(config, root);
  return listArtifactsAtRoot(root, VAULT_WORKSPACE_PLATFORM, VAULT_WORKSPACE_PROFILE);
}

export function readArtifact(config: AppConfig, platform: string, profile: string, artifactPath: string): ArtifactContent {
  const { info, target } = resolveArtifact(config, platform, profile, artifactPath);
  if (info.kind === "directory" || PREVIEW_MIME_TYPES.has(info.mime) || info.size > TEXT_LIMIT_BYTES) {
    return { artifact: info, binary: true };
  }
  return { artifact: info, content: readFileSync(target, "utf8") };
}

export function readVaultArtifact(config: AppConfig, artifactPath: string): ArtifactContent {
  const { info, target } = resolveVaultArtifact(config, artifactPath);
  if (info.kind === "directory" || PREVIEW_MIME_TYPES.has(info.mime) || info.size > TEXT_LIMIT_BYTES) {
    return { artifact: info, binary: true };
  }
  return { artifact: info, content: readFileSync(target, "utf8") };
}

export async function persistChatUpload(
  config: AppConfig,
  file: File,
  options: { platform?: string; profile?: string } = {}
): Promise<{ artifact: ArtifactInfo; absolutePath: string }> {
  const contentType = normalizeChatUploadImageType(file);
  if (!contentType) throw new Error("unsupported_chat_upload_type");
  if (file.size > CHAT_UPLOAD_MAX_BYTES) throw new Error("chat_upload_too_large");

  const hasWorkspace = Boolean(options.platform && options.profile);
  const root = hasWorkspace ? profileRoot(config, options.platform!, options.profile!) : vaultRoot(config);
  assertAllowedPath(config, root);
  mkdirSync(root, { recursive: true });

  const date = new Date().toISOString().slice(0, 10);
  const extension = CHAT_UPLOAD_IMAGE_EXTENSIONS.get(contentType) ?? "png";
  const safeName = safeUploadName(file.name || `pasted-image.${extension}`, extension);
  const relativePath = join("artifacts", "chat-uploads", date, `${uploadTimestamp()}-${randomUUID().slice(0, 8)}-${safeName}`);
  const target = resolve(root, relativePath);
  assertInside(root, target);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, new Uint8Array(await file.arrayBuffer()));

  const stat = statSync(target);
  return {
    artifact: {
      platform: hasWorkspace ? options.platform! : VAULT_WORKSPACE_PLATFORM,
      profile: hasWorkspace ? options.profile! : VAULT_WORKSPACE_PROFILE,
      path: relative(root, target),
      name: basename(target),
      kind: "file",
      mime: "image",
      size: stat.size,
      updatedAt: stat.mtime.toISOString()
    },
    absolutePath: target
  };
}

export function resolveArtifact(config: AppConfig, platform: string, profile: string, artifactPath: string): { info: ArtifactInfo; target: string } {
  const root = profileRoot(config, platform, profile);
  assertAllowedPath(config, root);
  return resolveArtifactAtRoot(root, platform, profile, artifactPath);
}

export function resolveVaultArtifact(config: AppConfig, artifactPath: string): { info: ArtifactInfo; target: string } {
  const root = vaultRoot(config);
  mkdirSync(root, { recursive: true });
  assertAllowedPath(config, root);
  return resolveArtifactAtRoot(root, VAULT_WORKSPACE_PLATFORM, VAULT_WORKSPACE_PROFILE, artifactPath);
}

function listArtifactsAtRoot(root: string, platform: string, profile: string): ArtifactInfo[] {
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

function resolveArtifactAtRoot(root: string, platform: string, profile: string, artifactPath: string): { info: ArtifactInfo; target: string } {
  const target = resolve(root, artifactPath || ".");
  assertInside(root, target);
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

function normalizeChatUploadImageType(file: File): string | undefined {
  const type = file.type.toLowerCase();
  if (CHAT_UPLOAD_IMAGE_EXTENSIONS.has(type)) return type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return undefined;
}

function safeUploadName(name: string, extension: string): string {
  const stem = basename(name)
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${stem || "pasted-image"}.${extension}`;
}

function uploadTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
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

function migratePlatformFirstWorkspaceLayout(config: AppConfig): void {
  for (const platform of WORKSPACE_PLATFORMS) {
    const legacyPlatformRoot = join(config.growthRoot, platform);
    if (!safeStat(legacyPlatformRoot)?.isDirectory()) continue;
    for (const profile of safeReaddir(legacyPlatformRoot)) {
      if (!/^[a-zA-Z0-9._-]+$/.test(profile)) continue;
      const source = join(legacyPlatformRoot, profile);
      if (!safeStat(source)?.isDirectory()) continue;
      const target = profileRoot(config, platform, profile);
      copyMissingFiles(source, target);
    }
  }
}

function copyMissingFiles(sourceRoot: string, targetRoot: string): void {
  walk(sourceRoot, (source) => {
    const stat = safeStat(source);
    if (!stat) return;
    const target = join(targetRoot, relative(sourceRoot, source));
    if (stat.isDirectory()) {
      mkdirSync(target, { recursive: true });
      return;
    }
    if (!stat.isFile() || existsSync(target)) return;
    mkdirSync(resolve(target, ".."), { recursive: true });
    copyFileSync(source, target);
    utimesSync(target, stat.atime, stat.mtime);
  });
}

function seedXhsWorkspaceTemplates(config: AppConfig, root: string, replacements: Map<string, string>): void {
  const templateRoot = join(config.bundledXiaohongshuSkillRoot, "assets", "templates");
  if (!safeStat(templateRoot)?.isDirectory()) return;
  for (const [templateName, outputName] of XHS_TEMPLATE_MAP) {
    const source = join(templateRoot, templateName);
    const target = join(root, outputName);
    if (!safeStat(source)?.isFile() || safeExists(target)) continue;
    mkdirSync(resolve(target, ".."), { recursive: true });
    if (templateName.endsWith(".csv")) {
      copyFileSync(source, target);
    } else {
      writeFileSync(target, renderTemplate(readFileSync(source, "utf8"), replacements));
    }
  }
}

function renderTemplate(content: string, replacements: Map<string, string>): string {
  let output = content;
  for (const [key, value] of replacements) {
    output = output.replaceAll(`{{${key}}}`, value);
  }
  return output;
}

function xhsProfileFromAuth(auth: XhsAuthStatus): string {
  return safeWorkspaceSlug(auth.redId) ?? safeWorkspaceSlug(auth.nickname) ?? "xiaohongshu";
}

function safeWorkspaceSlug(value: string | undefined): string | undefined {
  const slug = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 64);
  return slug && /^[a-zA-Z0-9._-]+$/.test(slug) ? slug : undefined;
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
