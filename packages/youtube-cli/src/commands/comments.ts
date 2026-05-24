import { requiredOption, stringOption, type ParsedArgs } from "../args";
import { parseMaxResults } from "../config";
import { YoutubeApiClient } from "../youtubeApi";
import { CliError } from "../types";

export async function runCommentsCommand(args: ParsedArgs): Promise<unknown> {
  const action = args.command[1];
  if (action !== "list") throw new CliError("youtube_unknown_command", "Expected comments list.");
  const client = new YoutubeApiClient({ config: args.config });
  return client.commentsList({
    videoId: requiredOption(args.options, "video-id"),
    maxResults: parseMaxResults(stringOption(args.options, "max-results"), 50, 100),
    pageToken: stringOption(args.options, "page-token")
  });
}
