import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { basename, extname, join, relative, resolve, sep } from "node:path";

import type { AppConfig } from "./config";
import { artifactContentType, profileRoot } from "./workspace";

const HERMES_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const HERMES_IMAGE_OUTPUT_PATTERN = /(?:^|\/)\.hermes\/cache\/images\/([^/?#\s]+\.(?:png|jpe?g|gif|webp))(?:[?#][^\s)]*)?/gi;

export interface HermesGeneratedImage {
  path: string;
  size: number;
  contentType: string;
}

export interface PersistedHermesImageArtifact {
  source: string;
  path: string;
  size: number;
  contentType: string;
}

export function resolveHermesGeneratedImage(config: AppConfig, imageName: string): HermesGeneratedImage {
  const name = basename(imageName.trim());
  if (!name || name !== imageName || !HERMES_IMAGE_EXTENSIONS.has(extname(name).toLowerCase())) {
    throw new Error("invalid_hermes_image");
  }

  const root = resolve(config.hermesHome, "cache", "images");
  const target = resolve(root, name);
  assertInside(root, target);

  const stat = statSync(target);
  if (!stat.isFile()) throw new Error("hermes_image_not_found");

  return {
    path: target,
    size: stat.size,
    contentType: artifactContentType(target)
  };
}

export function persistHermesGeneratedImageArtifacts(
  config: AppConfig,
  platform: string,
  profile: string,
  output: string
): PersistedHermesImageArtifact[] {
  const names = extractHermesGeneratedImageNames(output);
  if (!names.length) return [];

  const root = profileRoot(config, platform, profile);
  const artifactRoot = join(root, "artifacts", "images");
  mkdirSync(artifactRoot, { recursive: true });

  return names.map((name) => {
    const source = resolveHermesGeneratedImage(config, name);
    const target = join(artifactRoot, name);
    copyFileSync(source.path, target);
    return {
      source: source.path,
      path: relative(root, target),
      size: source.size,
      contentType: source.contentType
    };
  });
}

export function extractHermesGeneratedImageNames(output: string): string[] {
  const names = new Set<string>();
  for (const match of output.matchAll(HERMES_IMAGE_OUTPUT_PATTERN)) {
    if (match[1]) names.add(match[1]);
  }
  return [...names];
}

function assertInside(root: string, target: string): void {
  const base = resolve(root);
  const value = resolve(target);
  if (value !== base && !value.startsWith(base + sep)) {
    throw new Error("invalid_hermes_image");
  }
}
