import { buildRuntimeConfig } from "./config";
import { CliError, type RuntimeConfig } from "./types";

export interface ParsedArgs {
  command: string[];
  options: Record<string, string | boolean>;
  config: RuntimeConfig;
  json: boolean;
}

const BOOLEAN_FLAGS = new Set(["json", "help", "no-open", "force-consent", "confirm-public", "dry-run", "ban-author"]);

export function parseArgs(argv: string[]): ParsedArgs {
  const command: string[] = [];
  const options: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value.startsWith("--")) {
      const [rawKey, inline] = value.slice(2).split("=", 2);
      const key = rawKey.trim();
      if (!key) throw new CliError("youtube_invalid_args", "Empty flag is not allowed.");
      if (BOOLEAN_FLAGS.has(key)) {
        options[key] = inline === undefined ? true : parseBoolean(key, inline);
        continue;
      }
      const next = inline ?? argv[index + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new CliError("youtube_invalid_args", `Missing value for --${key}.`);
      }
      options[key] = next;
      if (inline === undefined) index += 1;
      continue;
    }
    command.push(value);
  }
  const config = buildRuntimeConfig({
    profile: stringOption(options, "profile"),
    growthRoot: stringOption(options, "growth-root"),
    expectedChannelId: stringOption(options, "expected-channel-id"),
    expectedChannelTitle: stringOption(options, "expected-channel-title")
  });
  return {
    command,
    options,
    config,
    json: Boolean(options.json)
  };
}

export function stringOption(options: Record<string, string | boolean>, key: string): string | undefined {
  const value = options[key];
  if (value === undefined) return undefined;
  if (typeof value === "boolean") throw new CliError("youtube_invalid_args", `--${key} requires a value.`);
  return value;
}

export function booleanOption(options: Record<string, string | boolean>, key: string): boolean {
  return Boolean(options[key]);
}

export function requiredOption(options: Record<string, string | boolean>, key: string): string {
  const value = stringOption(options, key);
  if (!value) throw new CliError("youtube_invalid_args", `Missing required --${key}.`);
  return value;
}

function parseBoolean(key: string, value: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new CliError("youtube_invalid_args", `--${key} must be true or false.`);
}
