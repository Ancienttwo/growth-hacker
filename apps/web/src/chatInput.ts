export interface AgentChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentTranscriptItem {
  kind: string;
  text: string;
  agentText?: string;
}

export interface ChatComposerKeyDown {
  key: string;
  isComposing?: boolean;
  shiftKey?: boolean;
}

export interface ChatAttachmentFileLike {
  name: string;
  type: string;
}

const supportedTextAttachmentPattern = /\.(txt|md|markdown|json|csv|log|yaml|yml)$/i;
const supportedImageAttachmentPattern = /\.(png|jpg|jpeg|gif|webp)$/i;
const supportedImageAttachmentMimeTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export function buildHermesChatInputFromTranscript(items: AgentTranscriptItem[], nextUserMessage: string): AgentChatMessage[] {
  const prior = items
    .filter((item) => item.kind === "user" || item.kind === "assistant")
    .map((item) => ({
      role: item.kind as "user" | "assistant",
      content: agentTranscriptContent(item)
    }))
    .filter((item) => item.content)
    .slice(-16);
  return [...prior, { role: "user", content: nextUserMessage }];
}

export function shouldSendChatOnKeyDown(event: ChatComposerKeyDown): boolean {
  return event.key === "Enter" && !event.isComposing && !event.shiftKey;
}

export function isImageChatAttachmentFile(file: ChatAttachmentFileLike): boolean {
  const type = file.type.toLowerCase();
  return supportedImageAttachmentMimeTypes.has(type) || supportedImageAttachmentPattern.test(file.name);
}

export function isSupportedChatAttachmentFile(file: ChatAttachmentFileLike): boolean {
  if (file.type.startsWith("text/")) return true;
  if (file.type === "application/json") return true;
  if (isImageChatAttachmentFile(file)) return true;
  return supportedTextAttachmentPattern.test(file.name);
}

function agentTranscriptContent(item: AgentTranscriptItem): string {
  if (item.kind === "user") {
    const agentText = item.agentText?.trim();
    if (agentText) return agentText;
  }
  return item.text.trim();
}
