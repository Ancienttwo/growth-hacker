import { parseMaxResults } from "../config";
import { requiredOption, stringOption, type ParsedArgs } from "../args";
import { YoutubeApiClient } from "../youtubeApi";
import { CliError } from "../types";

export async function runVideosCommand(args: ParsedArgs): Promise<unknown> {
  const action = args.command[1];
  const client = new YoutubeApiClient({ config: args.config });
  if (action === "list") {
    return client.videosList({
      maxResults: parseMaxResults(stringOption(args.options, "max-results"), 25, 50),
      pageToken: stringOption(args.options, "page-token")
    });
  }
  if (action === "get") {
    return { video: await client.videoGet(requiredOption(args.options, "video-id")) };
  }
  throw new CliError("youtube_unknown_command", "Expected videos list or videos get.");
}
