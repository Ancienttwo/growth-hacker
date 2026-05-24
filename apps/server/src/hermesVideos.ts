import { copyFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";

import type { AppConfig } from "./config";
import { artifactContentType, profileRoot } from "./workspace";

const HERMES_VIDEO_EXTENSIONS = new Set([".mp4", ".m4v", ".mov", ".webm"]);
const VIDEO_URL_PATTERN = /https?:\/\/[^\s"'`<>)]+/gi;
const VIDEO_JSON_PATTERN = /"video"\s*:\s*"([^"]+)"/gi;
const HERMES_VIDEO_PATH_PATTERN = /(?:^|[\s"'`(])((?:\/[^\s"'`<>)]+)?\.hermes\/cache\/videos\/([^/?#\s"'`<>)]+\.(?:mp4|m4v|mov|webm)))(?:[?#][^\s"'`<>)]+)?/gi;
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

export interface HermesGeneratedVideo {
  path: string;
  size: number;
  contentType: string;
}

export interface PersistedHermesVideoArtifact {
  source: string;
  path: string;
  size: number;
  contentType: string;
}

export function resolveHermesGeneratedVideo(config: AppConfig, videoName: string): HermesGeneratedVideo {
  const name = basename(videoName.trim());
  if (!name || name !== videoName || !HERMES_VIDEO_EXTENSIONS.has(extname(name).toLowerCase())) {
    throw new Error("invalid_hermes_video");
  }

  const root = resolve(config.hermesHome, "cache", "videos");
  const target = resolve(root, name);
  assertInside(root, target);

  const stat = statSync(target);
  if (!stat.isFile()) throw new Error("hermes_video_not_found");

  return {
    path: target,
    size: stat.size,
    contentType: artifactContentType(target)
  };
}

export async function persistHermesGeneratedVideoArtifacts(
  config: AppConfig,
  platform: string,
  profile: string,
  output: string
): Promise<PersistedHermesVideoArtifact[]> {
  const references = extractHermesGeneratedVideoReferences(output);
  if (!references.length) return [];

  const root = profileRoot(config, platform, profile);
  const artifactRoot = join(root, "artifacts", "videos");
  mkdirSync(artifactRoot, { recursive: true });

  const artifacts: PersistedHermesVideoArtifact[] = [];
  for (const reference of references) {
    artifacts.push(await persistVideoReference(config, root, artifactRoot, reference));
  }
  return artifacts;
}

export function extractHermesGeneratedVideoReferences(output: string): string[] {
  const references = new Set<string>();
  for (const match of output.matchAll(VIDEO_JSON_PATTERN)) {
    addVideoReference(references, match[1]);
  }
  for (const match of output.matchAll(HERMES_VIDEO_PATH_PATTERN)) {
    addVideoReference(references, match[1]);
  }
  for (const match of output.matchAll(VIDEO_URL_PATTERN)) {
    if (looksLikeVideoUrl(match[0])) addVideoReference(references, match[0]);
  }
  return [...references];
}

async function persistVideoReference(
  config: AppConfig,
  root: string,
  artifactRoot: string,
  reference: string
): Promise<PersistedHermesVideoArtifact> {
  if (isHttpUrl(reference)) return await persistRemoteVideo(root, artifactRoot, reference);

  const source = resolveLocalVideoReference(config, reference);
  const target = join(artifactRoot, basename(source.path));
  copyFileSync(source.path, target);
  return {
    source: source.path,
    path: relative(root, target),
    size: source.size,
    contentType: source.contentType
  };
}

function resolveLocalVideoReference(config: AppConfig, reference: string): HermesGeneratedVideo {
  const cacheRoot = resolve(config.hermesHome, "cache", "videos");
  const target = resolve(reference);
  if (target === reference) {
    assertInside(cacheRoot, target);
    const stat = statSync(target);
    if (!stat.isFile()) throw new Error("hermes_video_not_found");
    if (!HERMES_VIDEO_EXTENSIONS.has(extname(target).toLowerCase())) throw new Error("invalid_hermes_video");
    return {
      path: target,
      size: stat.size,
      contentType: artifactContentType(target)
    };
  }
  return resolveHermesGeneratedVideo(config, basename(reference));
}

async function persistRemoteVideo(root: string, artifactRoot: string, url: string): Promise<PersistedHermesVideoArtifact> {
  const remoteUrl = parseSafeRemoteVideoUrl(url);
  const response = await fetch(remoteUrl);
  if (!response.ok) throw new Error(`video_download_failed:${response.status}`);
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > MAX_VIDEO_BYTES) throw new Error("video_download_too_large");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_VIDEO_BYTES) throw new Error("video_download_too_large");

  const contentType = normalizeVideoContentType(response.headers.get("content-type"), remoteUrl);
  const target = join(artifactRoot, `${downloadTimestamp()}-${remoteVideoName(remoteUrl, contentType)}`);
  assertInside(root, target);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);

  return {
    source: remoteUrl.toString(),
    path: relative(root, target),
    size: bytes.byteLength,
    contentType
  };
}

function addVideoReference(references: Set<string>, value: string | undefined): void {
  const reference = value?.trim().replace(/[),.;]+$/, "");
  if (!reference) return;
  if (isHttpUrl(reference)) {
    references.add(reference);
    return;
  }
  if (HERMES_VIDEO_EXTENSIONS.has(extname(stripQuery(reference)).toLowerCase())) {
    references.add(stripQuery(reference));
  }
}

function remoteVideoName(url: URL, contentType: string): string {
  const name = basename(url.pathname).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (name && HERMES_VIDEO_EXTENSIONS.has(extname(name).toLowerCase())) return name.slice(0, 120);
  return `generated.${extensionForVideoContentType(contentType)}`;
}

function normalizeVideoContentType(value: string | null, url: URL): string {
  const type = value?.split(";")[0]?.trim().toLowerCase();
  if (type?.startsWith("video/")) return type;
  if (HERMES_VIDEO_EXTENSIONS.has(extname(url.pathname).toLowerCase())) {
    return artifactContentType(remoteVideoName(url, "video/mp4"));
  }
  throw new Error("video_download_invalid_type");
}

function extensionForVideoContentType(contentType: string): string {
  if (contentType === "video/quicktime") return "mov";
  if (contentType === "video/webm") return "webm";
  return "mp4";
}

function stripQuery(value: string): string {
  return value.replace(/[?#].*$/, "");
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function parseSafeRemoteVideoUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("video_download_invalid_url");
  }
  if (url.protocol !== "https:" || url.username || url.password || isBlockedRemoteHost(url.hostname)) {
    throw new Error("video_download_url_blocked");
  }
  return url;
}

function isBlockedRemoteHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (!host.includes(".") && !host.includes(":")) return true;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    if (parts.some((part) => part > 255)) return true;
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }

  return host === "::" || host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
}

function looksLikeVideoUrl(value: string): boolean {
  try {
    return HERMES_VIDEO_EXTENSIONS.has(extname(new URL(value).pathname).toLowerCase());
  } catch {
    return false;
  }
}

function downloadTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function assertInside(root: string, target: string): void {
  const base = resolve(root);
  const value = resolve(target);
  if (value !== base && !value.startsWith(base + sep)) {
    throw new Error("invalid_hermes_video");
  }
}
