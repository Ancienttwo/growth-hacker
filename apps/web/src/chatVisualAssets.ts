import type { ArtifactInfo, WorkspaceProfile } from "@growth-hacker/core";

interface VisualAssetEvent {
  output?: string;
  delta?: string;
  message?: string;
  agentMessage?: string;
}

export interface ReusableVisualAsset {
  source: string;
  label: string;
  origin: "chat" | "workspace";
}

const imageExtension = String.raw`(?:png|jpe?g|gif|webp)`;
const markdownImagePattern = /!\[[^\]]*]\(([^)\s]+)(?:\s+["'][^)]*["'])?\)/gi;
const mediaImagePattern = new RegExp(String.raw`^MEDIA:(\S+\.${imageExtension}(?:[?#]\S*)?)$`, "gim");
const rawImagePathPattern = new RegExp(
  String.raw`(?:file://)?(?:/[^\s)\]]+|\.{1,2}/[^\s)\]]+|artifacts/images/[^\s)\]]+)\.${imageExtension}(?:[?#][^\s)\]]*)?`,
  "gi"
);

export function resolveReusableVisualAssets(
  message: string,
  events: VisualAssetEvent[],
  artifacts: ArtifactInfo[] = [],
  profile: WorkspaceProfile | null = null,
  limit = 3
): ReusableVisualAsset[] {
  if (!shouldAttachVisualAssetContext(message)) return [];

  const assets: ReusableVisualAsset[] = [];
  const seen = new Set<string>();
  const add = (source: string, origin: ReusableVisualAsset["origin"]) => {
    const normalized = normalizeImageSource(source);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    assets.push({ source: normalized, label: assets.length === 0 ? "latest" : `candidate-${assets.length + 1}`, origin });
  };

  for (const event of [...events].reverse()) {
    for (const text of [event.output, event.agentMessage, event.message, event.delta]) {
      for (const source of extractImageSources(String(text ?? ""))) add(source, "chat");
      if (assets.length >= limit) return assets.slice(0, limit);
    }
  }

  const imageArtifacts = artifacts
    .filter((artifact) => artifact.kind === "file" && artifact.mime === "image")
    .sort((a, b) => artifactTime(b) - artifactTime(a));
  for (const artifact of imageArtifacts) {
    add(profile ? `${profile.path}/${artifact.path}` : artifact.path, "workspace");
    if (assets.length >= limit) break;
  }

  return assets.slice(0, limit);
}

export function appendVisualAssetContext(message: string, assets: ReusableVisualAsset[]): string {
  if (!assets.length) return message;
  return [
    message,
    "Existing visual assets from this chat/workspace:",
    ...assets.map((asset) => `- ${asset.label} (${asset.origin}): ${asset.source}`)
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildVisualAssetInstructions(assets: ReusableVisualAsset[]): string | undefined {
  if (!assets.length) return undefined;
  return [
    "Existing visual asset reuse contract:",
    "- Treat the listed visual assets as available inputs for this run.",
    "- If the user asks to use, continue, revise, publish, or pair copy with a previous/current image, reuse the latest listed asset instead of creating a new image.",
    "- Create a new image only when the user explicitly asks for a new replacement or a different visual.",
    "- For new or revised Xiaohongshu/social infographic work, call `skill_view(\"baoyu-infographic\")` when available and execute that skill workflow; do not invent an untracked image path.",
    ...assets.map((asset) => `- ${asset.label} (${asset.origin}): ${asset.source}`)
  ].join("\n");
}

function shouldAttachVisualAssetContext(message: string): boolean {
  return /配图|配圖|图片|圖片|图像|圖像|封面|海报|海報|信息图|資訊圖|可视化|可視化|infographic|visual|image|poster|cover|上[一]?张|上[一]?張|这张|這張|这个图|這個圖|刚才|剛才|之前|前面|生成的|沿用|复用|複用|继续用|繼續用|reuse|use it|same image/i.test(
    message
  );
}

function extractImageSources(text: string): string[] {
  const sources: string[] = [];
  for (const match of text.matchAll(markdownImagePattern)) sources.push(match[1] ?? "");
  for (const match of text.matchAll(mediaImagePattern)) sources.push(match[1] ?? "");
  for (const match of text.matchAll(rawImagePathPattern)) sources.push(match[0] ?? "");
  return sources;
}

function normalizeImageSource(source: string): string {
  const trimmed = source.trim().replace(/^<|>$/g, "");
  if (!trimmed) return "";
  try {
    if (trimmed.startsWith("file://")) return decodeURIComponent(new URL(trimmed).pathname);
  } catch {
    return trimmed;
  }
  return trimmed;
}

function artifactTime(artifact: ArtifactInfo): number {
  const value = Date.parse(artifact.updatedAt ?? "");
  return Number.isFinite(value) ? value : 0;
}
