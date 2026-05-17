import { describe, expect, test } from "bun:test";

import { resolveChatMarkdownImageUrl } from "./chatMarkdown";

describe("chat Markdown image URLs", () => {
  test("rewrites Hermes generated local image paths to the dashboard image endpoint", () => {
    expect(resolveChatMarkdownImageUrl("/Users/chris/.hermes/cache/images/generated.png")).toBe("/api/chat/hermes/images/generated.png");
    expect(resolveChatMarkdownImageUrl("file:///Users/chris/.hermes/cache/images/generated%20image.webp")).toBe(
      "/api/chat/hermes/images/generated%20image.webp"
    );
  });

  test("leaves non-Hermes and traversal-shaped paths unchanged", () => {
    expect(resolveChatMarkdownImageUrl("https://example.com/generated.png")).toBe("https://example.com/generated.png");
    expect(resolveChatMarkdownImageUrl("/Users/chris/.hermes/cache/images/../secret.png")).toBe(
      "/Users/chris/.hermes/cache/images/../secret.png"
    );
  });
});
