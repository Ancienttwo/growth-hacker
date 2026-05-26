import { readFile } from "node:fs/promises";

import { booleanOption, requiredOption, stringOption, type ParsedArgs } from "../args";
import { expandHome } from "../config";
import { listUploadStates, type YoutubeUploadStateFile } from "../store";
import { CliError } from "../types";
import { YoutubeApiClient, type YoutubePrivacyStatus } from "../youtubeApi";

export async function runUploadCommand(args: ParsedArgs): Promise<unknown> {
  const action = args.command[1];
  if (action === "status") {
    const uploadId = stringOption(args.options, "upload-id");
    if (!uploadId) return { uploads: (await listUploadStates(args.config)).map(uploadStateSummary) };
    const client = new YoutubeApiClient({ config: args.config });
    return { upload: await client.uploadStatus(uploadId) };
  }
  if (action === "resume") {
    const client = new YoutubeApiClient({ config: args.config });
    return { upload: await client.resumeUpload(requiredOption(args.options, "upload-id")) };
  }
  if (action !== "create") throw new CliError("youtube_unknown_command", "Expected upload create, upload status, or upload resume.");
  const client = new YoutubeApiClient({ config: args.config });
  return client.uploadVideo({
    filePath: expandHome(requiredOption(args.options, "file")),
    title: requiredOption(args.options, "title"),
    description: await descriptionFromOptions(args.options),
    categoryId: stringOption(args.options, "category-id") ?? "22",
    tags: parseTags(stringOption(args.options, "tags")),
    privacyStatus: parsePrivacy(stringOption(args.options, "privacy") ?? "private"),
    madeForKids: requiredBooleanValue(args.options, "made-for-kids"),
    containsSyntheticMedia: requiredBooleanValue(args.options, "contains-synthetic-media"),
    notifySubscribers: optionalBooleanValue(args.options, "notify-subscribers", false),
    mimeType: stringOption(args.options, "mime-type"),
    confirmPublic: booleanOption(args.options, "confirm-public")
  });
}

function uploadStateSummary(state: YoutubeUploadStateFile): Record<string, unknown> {
  return {
    uploadId: state.uploadId,
    filePath: state.filePath,
    size: state.size,
    mimeType: state.mimeType,
    privacyStatus: privacyFromMetadata(state.metadata),
    createdAt: state.createdAt,
    updatedAt: state.updatedAt
  };
}

function privacyFromMetadata(metadata: Record<string, unknown>): string | undefined {
  const status = metadata.status;
  if (!status || typeof status !== "object" || Array.isArray(status)) return undefined;
  const privacyStatus = (status as Record<string, unknown>).privacyStatus;
  return typeof privacyStatus === "string" ? privacyStatus : undefined;
}

async function descriptionFromOptions(options: Record<string, string | boolean>): Promise<string> {
  const direct = stringOption(options, "description");
  const file = stringOption(options, "description-file");
  if (direct !== undefined && file !== undefined) {
    throw new CliError("youtube_invalid_args", "Use either --description or --description-file, not both.");
  }
  if (file) return readFile(expandHome(file), "utf8");
  return direct ?? "";
}

function parseTags(value: string | undefined): string[] {
  return value
    ? value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];
}

function parsePrivacy(value: string): YoutubePrivacyStatus {
  if (value === "private" || value === "unlisted" || value === "public") return value;
  throw new CliError("youtube_invalid_args", "--privacy must be private, unlisted, or public.");
}

function requiredBooleanValue(options: Record<string, string | boolean>, key: string): boolean {
  const value = stringOption(options, key);
  if (value === undefined) throw new CliError("youtube_invalid_args", `Missing required --${key} true|false.`);
  return parseBooleanValue(key, value);
}

function optionalBooleanValue(options: Record<string, string | boolean>, key: string, fallback: boolean): boolean {
  const value = stringOption(options, key);
  return value === undefined ? fallback : parseBooleanValue(key, value);
}

function parseBooleanValue(key: string, value: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new CliError("youtube_invalid_args", `--${key} must be true or false.`);
}
