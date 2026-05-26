import { readFile } from "node:fs/promises";

import { booleanOption, requiredOption, stringOption, type ParsedArgs } from "../args";
import { expandHome, parseMaxResults } from "../config";
import { YoutubeApiClient, type CommentModerationStatus } from "../youtubeApi";
import { CliError } from "../types";

export async function runCommentsCommand(args: ParsedArgs): Promise<unknown> {
  const action = args.command[1];
  const client = new YoutubeApiClient({ config: args.config });
  if (action === "list") {
    return client.commentsList({
      videoId: requiredOption(args.options, "video-id"),
      maxResults: parseMaxResults(stringOption(args.options, "max-results"), 50, 100),
      pageToken: stringOption(args.options, "page-token")
    });
  }
  if (action === "reply") {
    return { comment: await client.replyToComment({
      parentId: requiredOption(args.options, "parent-id"),
      textOriginal: await textFromOptions(args.options),
      confirm: stringOption(args.options, "confirm"),
      dryRun: booleanOption(args.options, "dry-run")
    }) };
  }
  if (action === "moderate") {
    const commentId = requiredOption(args.options, "comment-id");
    return { comment: await client.moderateComment({
      commentId,
      moderationStatus: parseModerationStatus(requiredOption(args.options, "status")),
      banAuthor: booleanOption(args.options, "ban-author"),
      confirm: stringOption(args.options, "confirm"),
      dryRun: booleanOption(args.options, "dry-run")
    }) };
  }
  if (action === "delete") {
    const commentId = requiredOption(args.options, "comment-id");
    return { comment: await client.deleteComment({
      commentId,
      confirm: stringOption(args.options, "confirm"),
      dryRun: booleanOption(args.options, "dry-run")
    }) };
  }
  throw new CliError("youtube_unknown_command", "Expected comments list, comments reply, comments moderate, or comments delete.");
}

async function textFromOptions(options: Record<string, string | boolean>): Promise<string> {
  const text = stringOption(options, "text");
  const textFile = stringOption(options, "text-file");
  if (text !== undefined && textFile !== undefined) {
    throw new CliError("youtube_invalid_args", "Use either --text or --text-file, not both.");
  }
  const value = textFile ? await readFile(expandHome(textFile), "utf8") : text;
  if (!value?.trim()) throw new CliError("youtube_invalid_args", "Missing required --text or --text-file.");
  return value;
}

function parseModerationStatus(value: string): CommentModerationStatus {
  if (value === "heldForReview" || value === "published" || value === "rejected") return value;
  throw new CliError("youtube_invalid_args", "--status must be heldForReview, published, or rejected.");
}
