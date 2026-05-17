const HERMES_GENERATED_IMAGE_PATTERN = /(?:^|\/)\.hermes\/cache\/images\/([^/?#]+\.(?:png|jpe?g|gif|webp))(?:[?#].*)?$/i;

export function resolveChatMarkdownImageUrl(source?: string): string {
  if (!source) return "";
  const normalized = normalizeFileUrl(source);
  const match = normalized.match(HERMES_GENERATED_IMAGE_PATTERN);
  if (!match) return source;
  return `/api/chat/hermes/images/${encodeURIComponent(match[1])}`;
}

function normalizeFileUrl(source: string): string {
  if (!source.startsWith("file://")) return source;
  try {
    return decodeURIComponent(new URL(source).pathname);
  } catch {
    return source;
  }
}
