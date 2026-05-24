import { parseArgs, type ParsedArgs } from "./args";
import { runAuthCommand } from "./commands/auth";
import { runChannelCommand } from "./commands/channel";
import { runCommentsCommand } from "./commands/comments";
import { runVideosCommand } from "./commands/videos";
import { failure, exitCodeFor, success, writeEnvelope } from "./output";
import { CliError } from "./types";

const HELP = `yt-cli

Usage:
  yt-cli auth status --profile astrozi --json
  yt-cli auth start --profile astrozi --scope read --json
  yt-cli auth revoke --profile astrozi --json
  yt-cli channel mine --profile astrozi --json
  yt-cli videos list --profile astrozi --max-results 25 --json
  yt-cli videos get --profile astrozi --video-id VIDEO_ID --json
  yt-cli comments list --profile astrozi --video-id VIDEO_ID --json

Global flags:
  --profile NAME       Growth profile, default: YOUTUBE_PROFILE or default
  --growth-root PATH   Growth runtime root, default: GROWTH_HACKER_HOME or ~/.growth
  --json               Emit stable JSON envelope
`;

export async function run(argv = process.argv.slice(2)): Promise<number> {
  let parsed: ParsedArgs | undefined;
  try {
    parsed = parseArgs(argv);
    if (parsed.options.help || parsed.command.length === 0) {
      writeEnvelope(success(HELP.trim()), { json: parsed.json });
      return 0;
    }
    const data = await dispatch(parsed);
    writeEnvelope(success(data, { profile: parsed.config.profile, account: "youtube" }), { json: parsed.json });
    return 0;
  } catch (error) {
    writeEnvelope(failure(error, parsed ? { profile: parsed.config.profile, account: "youtube" } : undefined), {
      json: parsed?.json ?? argv.includes("--json")
    });
    return exitCodeFor(error);
  }
}

async function dispatch(args: ParsedArgs): Promise<unknown> {
  const group = args.command[0];
  if (group === "auth") return runAuthCommand(args);
  if (group === "channel") return runChannelCommand(args);
  if (group === "videos") return runVideosCommand(args);
  if (group === "comments") return runCommentsCommand(args);
  throw new CliError("youtube_unknown_command", `Unknown command group: ${group}`);
}

if (import.meta.main) {
  const exitCode = await run();
  process.exit(exitCode);
}
