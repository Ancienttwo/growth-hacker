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

function agentTranscriptContent(item: AgentTranscriptItem): string {
  if (item.kind === "user") {
    const agentText = item.agentText?.trim();
    if (agentText) return agentText;
  }
  return item.text.trim();
}
