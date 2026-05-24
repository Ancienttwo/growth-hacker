import { getTokenStatus } from "../store";
import { revokeAuth, startAuth } from "../oauth";
import { booleanOption, stringOption, type ParsedArgs } from "../args";
import { CliError } from "../types";

export async function runAuthCommand(args: ParsedArgs): Promise<unknown> {
  const action = args.command[1];
  if (action === "status") return getTokenStatus(args.config);
  if (action === "start") {
    return startAuth({
      config: args.config,
      scope: stringOption(args.options, "scope"),
      clientFile: stringOption(args.options, "client-file"),
      noOpen: booleanOption(args.options, "no-open"),
      forceConsent: booleanOption(args.options, "force-consent"),
      timeoutMs: parseTimeout(stringOption(args.options, "timeout-ms")),
      loginHint: stringOption(args.options, "login-hint")
    });
  }
  if (action === "revoke") return revokeAuth(args.config);
  throw new CliError("youtube_unknown_command", "Expected auth status, auth start, or auth revoke.");
}

function parseTimeout(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1000 || parsed > 600_000) {
    throw new CliError("youtube_invalid_args", "--timeout-ms must be an integer from 1000 to 600000.");
  }
  return parsed;
}
