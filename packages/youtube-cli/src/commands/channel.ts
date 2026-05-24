import { YoutubeApiClient } from "../youtubeApi";
import type { ParsedArgs } from "../args";
import { CliError } from "../types";

export async function runChannelCommand(args: ParsedArgs): Promise<unknown> {
  const action = args.command[1];
  if (action !== "mine") throw new CliError("youtube_unknown_command", "Expected channel mine.");
  const client = new YoutubeApiClient({ config: args.config });
  return { channel: await client.channelMine() };
}
