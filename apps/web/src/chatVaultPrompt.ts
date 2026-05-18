import type { ArtifactContent } from "@growth-hacker/core";

export interface VaultWorkspaceChatMessageOptions {
  artifact: ArtifactContent | null;
  today?: Date;
  vaultRoot: string;
}

export function buildVaultWorkspaceChatMessage(message: string, options: VaultWorkspaceChatMessageOptions): string {
  const selectedPath = options.artifact?.artifact.path;
  return [
    "Vault workspace mode.",
    `Today: ${formatVaultPromptDate(options.today ?? new Date())}.`,
    `Vault root: ${options.vaultRoot}`,
    selectedPath ? `Visible preview path: ${selectedPath}` : "Visible preview path: none",
    "The visible preview is navigation context only. Do not edit it unless the user explicitly asks to modify the current preview note or explicitly references/attaches that note.",
    "You may modify files only under ~/.growth/vault.",
    "For a new topic, create a new dated artifact/folder using today's date. Do not reuse or append to an older dated evidence folder unless the user explicitly asks to continue that exact topic.",
    "If the topic differs from the visible preview or referenced note, create a separate Markdown file. Do not merge unrelated topics into the same .md file.",
    "After edits, report changed paths and the reason for each change.",
    "",
    "User request:",
    message
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildVaultAttachmentContent(artifact: ArtifactContent, vaultRoot: string): string {
  return [
    `Vault root: ${vaultRoot}`,
    `Vault path: ${artifact.artifact.path}`,
    "This file is an explicitly referenced vault attachment. Prefer this file only when the user asks to modify or use the referenced document.",
    "",
    fencedContent(artifact.content ?? "", artifact.artifact.mime === "markdown" ? "markdown" : "text")
  ].join("\n");
}

export function formatVaultPromptDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fencedContent(content: string, language: string): string {
  return `\`\`\`${language}\n${content.replaceAll("```", "\\`\\`\\`")}\n\`\`\``;
}
