import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { basename, extname } from "node:path";

import { hasReadScope, requireOperateScope, requireReadScope, requireUploadScope } from "./config";
import { getValidAccessToken } from "./oauth";
import {
  readUploadState,
  removeUploadState,
  writeAccount,
  writeUploadState,
  type YoutubeAccountFile,
  type YoutubeUploadStateFile
} from "./store";
import { CliError, type RuntimeConfig } from "./types";

const API_BASE = "https://www.googleapis.com/youtube/v3";
const UPLOAD_BASE = "https://www.googleapis.com/upload/youtube/v3";
const MAX_UPLOAD_SIZE_BYTES = 256 * 1024 * 1024 * 1024;

export interface YoutubeApiClientInput {
  config: RuntimeConfig;
  fetchImpl?: typeof fetch;
  accessToken?: string;
  scopes?: string[];
}

export interface ChannelSummary {
  id: string;
  title: string;
  customUrl?: string;
  uploadsPlaylistId?: string;
  statistics?: Record<string, unknown>;
}

export interface VideoSummary {
  id: string;
  title: string;
  description?: string;
  publishedAt?: string;
  channelId?: string;
  channelTitle?: string;
  thumbnails?: unknown;
  duration?: string;
  privacyStatus?: string;
  statistics?: Record<string, unknown>;
}

export interface CommentSummary {
  id: string;
  videoId?: string;
  authorDisplayName?: string;
  authorChannelUrl?: string;
  textDisplay?: string;
  textOriginal?: string;
  likeCount?: number;
  publishedAt?: string;
  updatedAt?: string;
  totalReplyCount?: number;
  replies?: CommentReplySummary[];
}

export interface CommentReplySummary {
  id: string;
  authorDisplayName?: string;
  textDisplay?: string;
  textOriginal?: string;
  likeCount?: number;
  publishedAt?: string;
  updatedAt?: string;
}

export type YoutubePrivacyStatus = "private" | "unlisted" | "public";

export interface UploadVideoInput {
  filePath: string;
  title: string;
  description: string;
  categoryId: string;
  tags: string[];
  privacyStatus: YoutubePrivacyStatus;
  madeForKids: boolean;
  containsSyntheticMedia: boolean;
  notifySubscribers: boolean;
  mimeType?: string;
  confirmPublic?: boolean;
}

export interface UploadVideoResult {
  video: VideoSummary;
  upload: {
    filePath: string;
    fileName: string;
    size: number;
    mimeType: string;
    privacyStatus: YoutubePrivacyStatus;
    uploadStatePath: string;
  };
}

export interface UploadStatusResult {
  uploadId: string;
  filePath: string;
  size: number;
  mimeType: string;
  uploadedBytes: number;
  remainingBytes: number;
  state: "in-progress" | "complete";
  retryAfter?: string;
  video?: VideoSummary;
}

export type CommentModerationStatus = "heldForReview" | "published" | "rejected";
export type CommentMutationAction = "reply" | "moderate" | "delete";

export interface CommentMutationResult {
  action: CommentMutationAction;
  dryRun: boolean;
  commentId?: string;
  parentId?: string;
  textOriginal?: string;
  moderationStatus?: CommentModerationStatus;
  banAuthor?: boolean;
  comment?: CommentSummary;
}

export class YoutubeApiClient {
  private readonly config: RuntimeConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly staticAccessToken?: string;
  private readonly staticScopes?: string[];
  private expectedChannelPromise?: Promise<ChannelSummary>;

  constructor(input: YoutubeApiClientInput) {
    this.config = input.config;
    this.fetchImpl = input.fetchImpl ?? fetch;
    this.staticAccessToken = input.accessToken;
    this.staticScopes = input.scopes;
  }

  async channelMine(): Promise<ChannelSummary> {
    const response = await this.request("channels", {
      part: "snippet,contentDetails,statistics",
      mine: "true"
    });
    const item = firstItem(response, "youtube_channel_not_found", "No YouTube channel was found for this account.");
    const channel = normalizeChannel(item);
    const account: YoutubeAccountFile = {
      schemaVersion: 1,
      profile: this.config.profile,
      channelId: channel.id,
      title: channel.title,
      ...(channel.customUrl ? { customUrl: channel.customUrl } : {}),
      syncedAt: new Date().toISOString()
    };
    await writeAccount(this.config, account);
    return channel;
  }

  async videosList(input: { maxResults: number; pageToken?: string }): Promise<{ videos: VideoSummary[]; nextPageToken?: string }> {
    const channel = await this.channelMine();
    if (!channel.uploadsPlaylistId) {
      throw new CliError("youtube_uploads_playlist_missing", "Channel does not expose an uploads playlist.");
    }
    const response = await this.request("playlistItems", {
      part: "snippet,contentDetails,status",
      playlistId: channel.uploadsPlaylistId,
      maxResults: String(input.maxResults),
      ...(input.pageToken ? { pageToken: input.pageToken } : {})
    });
    return {
      videos: arrayItems(response).map(normalizePlaylistItemVideo),
      ...(typeof response.nextPageToken === "string" ? { nextPageToken: response.nextPageToken } : {})
    };
  }

  async videoGet(videoId: string): Promise<VideoSummary> {
    const response = await this.request("videos", {
      part: "snippet,contentDetails,statistics,status",
      id: videoId
    });
    return normalizeVideo(firstItem(response, "youtube_video_not_found", `Video not found: ${videoId}`));
  }

  async commentsList(input: { videoId: string; maxResults: number; pageToken?: string }): Promise<{ comments: CommentSummary[]; nextPageToken?: string }> {
    const response = await this.request("commentThreads", {
      part: "snippet,replies",
      videoId: input.videoId,
      textFormat: "plainText",
      maxResults: String(input.maxResults),
      ...(input.pageToken ? { pageToken: input.pageToken } : {})
    });
    return {
      comments: arrayItems(response).map(normalizeCommentThread),
      ...(typeof response.nextPageToken === "string" ? { nextPageToken: response.nextPageToken } : {})
    };
  }

  async replyToComment(input: { parentId: string; textOriginal: string; confirm?: string; dryRun?: boolean }): Promise<CommentMutationResult> {
    assertNonEmpty(input.parentId, "parent-id");
    assertNonEmpty(input.textOriginal, "text");
    const dryRun = shouldDryRun(input.confirm, input.parentId, input.dryRun);
    if (dryRun) {
      return {
        action: "reply",
        dryRun: true,
        parentId: input.parentId,
        textOriginal: input.textOriginal
      };
    }
    const token = await this.tokenForOperate();
    await this.assertExpectedChannelForMutation(token);
    const response = await this.requestWithToken(token.accessToken, "comments", {
      method: "POST",
      params: { part: "snippet" },
      body: {
        snippet: {
          parentId: input.parentId,
          textOriginal: input.textOriginal
        }
      }
    });
    return {
      action: "reply",
      dryRun: false,
      parentId: input.parentId,
      textOriginal: input.textOriginal,
      comment: normalizeComment(response)
    };
  }

  async moderateComment(input: {
    commentId: string;
    moderationStatus: CommentModerationStatus;
    banAuthor?: boolean;
    confirm?: string;
    dryRun?: boolean;
  }): Promise<CommentMutationResult> {
    assertNonEmpty(input.commentId, "comment-id");
    if (input.banAuthor && input.moderationStatus !== "rejected") {
      throw new CliError("youtube_invalid_args", "--ban-author is only valid with --status rejected.");
    }
    const dryRun = shouldDryRun(input.confirm, input.commentId, input.dryRun);
    if (dryRun) {
      return {
        action: "moderate",
        dryRun: true,
        commentId: input.commentId,
        moderationStatus: input.moderationStatus,
        ...(input.banAuthor ? { banAuthor: true } : {})
      };
    }
    const token = await this.tokenForOperate();
    await this.assertExpectedChannelForMutation(token);
    await this.requestWithToken(token.accessToken, "comments/setModerationStatus", {
      method: "POST",
      params: {
        id: input.commentId,
        moderationStatus: input.moderationStatus,
        ...(input.banAuthor ? { banAuthor: "true" } : {})
      },
      noJson: true
    });
    return {
      action: "moderate",
      dryRun: false,
      commentId: input.commentId,
      moderationStatus: input.moderationStatus,
      ...(input.banAuthor ? { banAuthor: true } : {})
    };
  }

  async deleteComment(input: { commentId: string; confirm?: string; dryRun?: boolean }): Promise<CommentMutationResult> {
    assertNonEmpty(input.commentId, "comment-id");
    const dryRun = shouldDryRun(input.confirm, input.commentId, input.dryRun);
    if (dryRun) {
      return {
        action: "delete",
        dryRun: true,
        commentId: input.commentId
      };
    }
    const token = await this.tokenForOperate();
    await this.assertExpectedChannelForMutation(token);
    await this.requestWithToken(token.accessToken, "comments", {
      method: "DELETE",
      params: { id: input.commentId },
      noJson: true
    });
    return {
      action: "delete",
      dryRun: false,
      commentId: input.commentId
    };
  }

  async uploadVideo(input: UploadVideoInput): Promise<UploadVideoResult> {
    const preflight = await preflightUpload(input);
    const token = await this.tokenForUpload();
    await this.assertExpectedChannelForMutation(token);
    const metadata = {
      snippet: {
        title: input.title,
        description: input.description,
        categoryId: input.categoryId,
        ...(input.tags.length ? { tags: input.tags } : {})
      },
      status: {
        privacyStatus: input.privacyStatus,
        selfDeclaredMadeForKids: input.madeForKids,
        containsSyntheticMedia: input.containsSyntheticMedia
      }
    };
    const uploadId = createUploadId(preflight.filePath, preflight.size, metadata);
    const sessionUrl = await this.startUploadSession(token.accessToken, metadata, preflight, input.notifySubscribers);
    const uploadStatePath = await writeUploadState(this.config, {
      schemaVersion: 1,
      profile: this.config.profile,
      account: "youtube",
      uploadId,
      filePath: preflight.filePath,
      size: preflight.size,
      mimeType: preflight.mimeType,
      metadata,
      sessionUrl,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    const response = await this.fetchImpl(sessionUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Length": String(preflight.size),
        "Content-Type": preflight.mimeType,
        "Content-Range": `bytes 0-${preflight.size - 1}/${preflight.size}`
      },
      body: Bun.file(preflight.filePath)
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (response.status === 308) {
      throw new CliError("youtube_upload_incomplete", "Upload session is incomplete. Resume support is not exposed yet.", {
        details: response.headers.get("range") ?? uploadStatePath
      });
    }
    if (!response.ok) throw normalizeYoutubeError(response.status, payload);
    await removeUploadState(this.config, uploadId);
    return {
      video: normalizeVideo(payload),
      upload: {
        filePath: preflight.filePath,
        fileName: basename(preflight.filePath),
        size: preflight.size,
        mimeType: preflight.mimeType,
        privacyStatus: input.privacyStatus,
        uploadStatePath
      }
    };
  }

  async uploadStatus(uploadId: string): Promise<UploadStatusResult> {
    const state = await readUploadState(this.config, uploadId);
    const token = await this.tokenForUpload();
    return this.checkUploadStatus(token.accessToken, state);
  }

  async resumeUpload(uploadId: string): Promise<UploadStatusResult> {
    const state = await readUploadState(this.config, uploadId);
    const token = await this.tokenForUpload();
    const preflight = await preflightResumeState(state);
    await this.assertExpectedChannelForMutation(token);
    const current = await this.checkUploadStatus(token.accessToken, state);
    if (current.state === "complete" || current.uploadedBytes >= state.size) return current;
    const response = await this.fetchImpl(state.sessionUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Length": String(state.size - current.uploadedBytes),
        "Content-Type": state.mimeType,
        "Content-Range": `bytes ${current.uploadedBytes}-${state.size - 1}/${state.size}`
      },
      body: Bun.file(preflight.filePath).slice(current.uploadedBytes)
    });
    return this.uploadResultFromResponse(response, state);
  }

  private async request(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    const token = await this.token();
    requireReadScope(token.scopes);

    return this.requestWithToken(token.accessToken, path, { params });
  }

  private async requestWithToken(
    accessToken: string,
    path: string,
    input: { method?: string; params?: Record<string, string>; body?: Record<string, unknown>; noJson?: boolean }
  ): Promise<Record<string, unknown>> {
    const url = new URL(`${API_BASE}/${path}`);
    for (const [key, value] of Object.entries(input.params ?? {})) url.searchParams.set(key, value);

    const response = await this.fetchImpl(url, {
      method: input.method ?? "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(input.body ? { "Content-Type": "application/json; charset=UTF-8" } : {})
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {})
    });
    if (input.noJson && response.ok) return {};
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw normalizeYoutubeError(response.status, payload);
    return payload;
  }

  private async startUploadSession(accessToken: string, metadata: Record<string, unknown>, preflight: UploadPreflight, notifySubscribers: boolean): Promise<string> {
    const url = new URL(`${UPLOAD_BASE}/videos`);
    url.searchParams.set("uploadType", "resumable");
    url.searchParams.set("part", "snippet,status");
    url.searchParams.set("notifySubscribers", String(notifySubscribers));
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(preflight.size),
        "X-Upload-Content-Type": preflight.mimeType
      },
      body: JSON.stringify(metadata)
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw normalizeYoutubeError(response.status, payload);
    const location = response.headers.get("location");
    if (!location) throw new CliError("youtube_upload_session_missing", "YouTube upload session response was missing Location header.");
    return location;
  }

  private async checkUploadStatus(accessToken: string, state: YoutubeUploadStateFile): Promise<UploadStatusResult> {
    const response = await this.fetchImpl(state.sessionUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Length": "0",
        "Content-Range": `bytes */${state.size}`
      }
    });
    return this.uploadResultFromResponse(response, state);
  }

  private async uploadResultFromResponse(response: Response, state: YoutubeUploadStateFile): Promise<UploadStatusResult> {
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (response.status === 308) {
      const uploadedBytes = uploadedBytesFromRange(response.headers.get("range"), state.size);
      return {
        uploadId: state.uploadId,
        filePath: state.filePath,
        size: state.size,
        mimeType: state.mimeType,
        uploadedBytes,
        remainingBytes: state.size - uploadedBytes,
        state: "in-progress",
        ...(response.headers.get("retry-after") ? { retryAfter: response.headers.get("retry-after") ?? undefined } : {})
      };
    }
    if (response.status === 404) {
      throw new CliError("youtube_upload_session_expired", "YouTube upload session expired. Start a new upload.", {
        details: state.uploadId
      });
    }
    if (!response.ok) throw normalizeYoutubeError(response.status, payload);
    await removeUploadState(this.config, state.uploadId);
    return {
      uploadId: state.uploadId,
      filePath: state.filePath,
      size: state.size,
      mimeType: state.mimeType,
      uploadedBytes: state.size,
      remainingBytes: 0,
      state: "complete",
      video: normalizeVideo(payload)
    };
  }

  private async token(): Promise<{ accessToken: string; scopes: string[] }> {
    return this.staticAccessToken ? { accessToken: this.staticAccessToken, scopes: this.staticScopes ?? [] } : getValidAccessToken(this.config);
  }

  private async tokenForUpload(): Promise<{ accessToken: string; scopes: string[] }> {
    const token = await this.token();
    requireUploadScope(token.scopes);
    return token;
  }

  private async tokenForOperate(): Promise<{ accessToken: string; scopes: string[] }> {
    const token = await this.token();
    requireOperateScope(token.scopes);
    return token;
  }

  private async assertExpectedChannelForMutation(token: { accessToken: string; scopes: string[] }): Promise<ChannelSummary> {
    if (!this.config.expectedChannelId && !this.config.expectedChannelTitle) {
      throw new CliError(
        "youtube_expected_channel_missing",
        "Write operations require an expected YouTube channel. Set youtube.expectedChannelId, YT_CLI_EXPECTED_CHANNEL_ID, or --expected-channel-id."
      );
    }
    if (!hasReadScope(token.scopes)) {
      throw new CliError(
        "youtube_scope_missing",
        "Token must include read-capable scope to verify the expected channel before write operations. Re-run auth with `--scope operate` or `--scope full`."
      );
    }
    this.expectedChannelPromise ??= this.fetchExpectedChannel(token.accessToken);
    const channel = await this.expectedChannelPromise;
    const mismatches: Record<string, { expected: string; actual?: string }> = {};
    if (this.config.expectedChannelId && channel.id !== this.config.expectedChannelId) {
      mismatches.id = { expected: this.config.expectedChannelId, actual: channel.id };
    }
    if (this.config.expectedChannelTitle && channel.title !== this.config.expectedChannelTitle) {
      mismatches.title = { expected: this.config.expectedChannelTitle, actual: channel.title };
    }
    if (Object.keys(mismatches).length > 0) {
      throw new CliError("youtube_expected_channel_mismatch", "Authenticated YouTube channel does not match the expected channel.", {
        details: mismatches
      });
    }
    return channel;
  }

  private async fetchExpectedChannel(accessToken: string): Promise<ChannelSummary> {
    const response = await this.requestWithToken(accessToken, "channels", {
      params: {
        part: "snippet,contentDetails,statistics",
        mine: "true"
      }
    });
    const item = firstItem(response, "youtube_channel_not_found", "No YouTube channel was found for this account.");
    const channel = normalizeChannel(item);
    await writeAccount(this.config, {
      schemaVersion: 1,
      profile: this.config.profile,
      channelId: channel.id,
      title: channel.title,
      ...(channel.customUrl ? { customUrl: channel.customUrl } : {}),
      syncedAt: new Date().toISOString()
    });
    return channel;
  }
}

interface UploadPreflight {
  filePath: string;
  size: number;
  mimeType: string;
}

async function preflightUpload(input: UploadVideoInput): Promise<UploadPreflight> {
  if (input.privacyStatus === "public" && !input.confirmPublic) {
    throw new CliError("youtube_public_upload_requires_confirmation", "Public uploads require --confirm-public.");
  }
  let fileStat;
  try {
    fileStat = await stat(input.filePath);
  } catch {
    throw new CliError("youtube_upload_file_missing", `Upload file does not exist: ${input.filePath}`);
  }
  if (!fileStat.isFile()) throw new CliError("youtube_upload_file_invalid", `Upload path is not a file: ${input.filePath}`);
  if (fileStat.size <= 0) throw new CliError("youtube_upload_file_empty", "Upload file is empty.");
  if (fileStat.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new CliError("youtube_upload_file_too_large", "YouTube uploads must be 256GB or smaller.", {
      details: { size: fileStat.size, max: MAX_UPLOAD_SIZE_BYTES }
    });
  }
  if (!input.title.trim()) throw new CliError("youtube_invalid_args", "--title is required.");
  return {
    filePath: input.filePath,
    size: fileStat.size,
    mimeType: input.mimeType ?? inferVideoMimeType(input.filePath)
  };
}

async function preflightResumeState(state: YoutubeUploadStateFile): Promise<UploadPreflight> {
  let fileStat;
  try {
    fileStat = await stat(state.filePath);
  } catch {
    throw new CliError("youtube_upload_file_missing", `Upload file does not exist: ${state.filePath}`);
  }
  if (!fileStat.isFile()) throw new CliError("youtube_upload_file_invalid", `Upload path is not a file: ${state.filePath}`);
  if (fileStat.size !== state.size) {
    throw new CliError("youtube_upload_file_changed", "Upload file size changed since the resumable session was created.", {
      details: { expected: state.size, actual: fileStat.size }
    });
  }
  return {
    filePath: state.filePath,
    size: state.size,
    mimeType: state.mimeType
  };
}

function createUploadId(filePath: string, size: number, metadata: Record<string, unknown>): string {
  return createHash("sha256").update(filePath).update(String(size)).update(JSON.stringify(metadata)).digest("hex").slice(0, 16);
}

function uploadedBytesFromRange(range: string | null, size: number): number {
  if (!range) return 0;
  const match = /^bytes=0-(\d+)$/.exec(range.trim());
  if (!match) throw new CliError("youtube_upload_range_invalid", `Unexpected upload Range header: ${range}`);
  const lastByte = Number(match[1]);
  if (!Number.isSafeInteger(lastByte) || lastByte < 0) {
    throw new CliError("youtube_upload_range_invalid", `Unexpected upload Range header: ${range}`);
  }
  return Math.min(size, lastByte + 1);
}

function shouldDryRun(confirm: string | undefined, expected: string, dryRun = false): boolean {
  if (confirm !== undefined && confirm !== expected) {
    throw new CliError("youtube_confirm_mismatch", `--confirm must match ${expected}.`);
  }
  return dryRun || confirm === undefined;
}

function assertNonEmpty(value: string, flag: string): void {
  if (!value.trim()) throw new CliError("youtube_invalid_args", `--${flag} must not be empty.`);
}

function normalizeYoutubeError(status: number, payload: Record<string, unknown>): CliError {
  const error = asRecord(payload.error);
  const errors = Array.isArray(error?.errors) ? error.errors.map(asRecord).filter(Boolean) : [];
  const reason = errors.map((item) => item?.reason).find((item): item is string => typeof item === "string");
  const message = typeof error?.message === "string" ? error.message : `YouTube API failed with HTTP ${status}.`;
  if (status === 401) return new CliError("youtube_auth_expired", "YouTube auth expired. Re-run auth or refresh the token.", { exitCode: 2, details: reason });
  if (status === 403 && reason && ["quotaExceeded", "dailyLimitExceeded", "userRateLimitExceeded"].includes(reason)) {
    return new CliError("youtube_quota_exceeded", message, { details: reason });
  }
  if (status === 403 && reason && ["insufficientPermissions", "forbidden"].includes(reason)) {
    return new CliError("youtube_scope_missing", "YouTube token does not have permission for this operation.", { exitCode: 2, details: reason });
  }
  if (status === 403 && reason && ["commentsDisabled", "commentNotFound"].includes(reason)) {
    return new CliError("youtube_comments_unavailable", message, { details: reason });
  }
  if (status === 429) return new CliError("youtube_rate_limited", message, { details: reason });
  if (status >= 500) return new CliError("youtube_api_unavailable", message, { details: status });
  return new CliError("youtube_api_error", message, { details: reason ?? status });
}

function normalizeChannel(item: Record<string, unknown>): ChannelSummary {
  const snippet = asRecord(item.snippet);
  const contentDetails = asRecord(item.contentDetails);
  const relatedPlaylists = asRecord(contentDetails?.relatedPlaylists);
  return {
    id: requireString(item.id, "channel.id"),
    title: requireString(snippet?.title, "channel.snippet.title"),
    ...(typeof snippet?.customUrl === "string" ? { customUrl: snippet.customUrl } : {}),
    ...(typeof relatedPlaylists?.uploads === "string" ? { uploadsPlaylistId: relatedPlaylists.uploads } : {}),
    ...(asRecord(item.statistics) ? { statistics: asRecord(item.statistics) as Record<string, unknown> } : {})
  };
}

function normalizePlaylistItemVideo(item: Record<string, unknown>): VideoSummary {
  const snippet = asRecord(item.snippet);
  const contentDetails = asRecord(item.contentDetails);
  const status = asRecord(item.status);
  const resourceId = asRecord(snippet?.resourceId);
  return {
    id: requireString(contentDetails?.videoId ?? resourceId?.videoId, "playlistItem.videoId"),
    title: typeof snippet?.title === "string" ? snippet.title : "",
    description: typeof snippet?.description === "string" ? snippet.description : undefined,
    publishedAt: typeof contentDetails?.videoPublishedAt === "string" ? contentDetails.videoPublishedAt : typeof snippet?.publishedAt === "string" ? snippet.publishedAt : undefined,
    channelId: typeof snippet?.channelId === "string" ? snippet.channelId : undefined,
    channelTitle: typeof snippet?.channelTitle === "string" ? snippet.channelTitle : undefined,
    thumbnails: snippet?.thumbnails,
    privacyStatus: typeof status?.privacyStatus === "string" ? status.privacyStatus : undefined
  };
}

function normalizeVideo(item: Record<string, unknown>): VideoSummary {
  const snippet = asRecord(item.snippet);
  const contentDetails = asRecord(item.contentDetails);
  const status = asRecord(item.status);
  return {
    id: requireString(item.id, "video.id"),
    title: typeof snippet?.title === "string" ? snippet.title : "",
    description: typeof snippet?.description === "string" ? snippet.description : undefined,
    publishedAt: typeof snippet?.publishedAt === "string" ? snippet.publishedAt : undefined,
    channelId: typeof snippet?.channelId === "string" ? snippet.channelId : undefined,
    channelTitle: typeof snippet?.channelTitle === "string" ? snippet.channelTitle : undefined,
    thumbnails: snippet?.thumbnails,
    duration: typeof contentDetails?.duration === "string" ? contentDetails.duration : undefined,
    privacyStatus: typeof status?.privacyStatus === "string" ? status.privacyStatus : undefined,
    ...(asRecord(item.statistics) ? { statistics: asRecord(item.statistics) as Record<string, unknown> } : {})
  };
}

function normalizeCommentThread(item: Record<string, unknown>): CommentSummary {
  const snippet = asRecord(item.snippet);
  const topLevelComment = asRecord(snippet?.topLevelComment);
  const comment = normalizeComment(topLevelComment);
  const replies = asRecord(item.replies);
  const replyItems = Array.isArray(replies?.comments) ? replies.comments.map(asRecord).filter(Boolean).map(normalizeCommentReply) : [];
  return {
    ...comment,
    totalReplyCount: typeof snippet?.totalReplyCount === "number" ? snippet.totalReplyCount : undefined,
    ...(replyItems.length ? { replies: replyItems } : {})
  };
}

function normalizeComment(comment: Record<string, unknown> | undefined): CommentSummary {
  const snippet = asRecord(comment?.snippet);
  return {
    id: requireString(comment?.id, "comment.id"),
    videoId: typeof snippet?.videoId === "string" ? snippet.videoId : undefined,
    authorDisplayName: typeof snippet?.authorDisplayName === "string" ? snippet.authorDisplayName : undefined,
    authorChannelUrl: typeof snippet?.authorChannelUrl === "string" ? snippet.authorChannelUrl : undefined,
    textDisplay: typeof snippet?.textDisplay === "string" ? snippet.textDisplay : undefined,
    textOriginal: typeof snippet?.textOriginal === "string" ? snippet.textOriginal : undefined,
    likeCount: typeof snippet?.likeCount === "number" ? snippet.likeCount : undefined,
    publishedAt: typeof snippet?.publishedAt === "string" ? snippet.publishedAt : undefined,
    updatedAt: typeof snippet?.updatedAt === "string" ? snippet.updatedAt : undefined
  };
}

function normalizeCommentReply(comment: Record<string, unknown> | undefined): CommentReplySummary {
  const normalized = normalizeComment(comment);
  return {
    id: normalized.id,
    authorDisplayName: normalized.authorDisplayName,
    textDisplay: normalized.textDisplay,
    textOriginal: normalized.textOriginal,
    likeCount: normalized.likeCount,
    publishedAt: normalized.publishedAt,
    updatedAt: normalized.updatedAt
  };
}

function firstItem(payload: Record<string, unknown>, code: string, message: string): Record<string, unknown> {
  const items = arrayItems(payload);
  if (!items[0]) throw new CliError(code, message);
  return items[0];
}

function arrayItems(payload: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(payload.items) ? payload.items.map(asRecord).filter(isRecord) : [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function isRecord(value: Record<string, unknown> | undefined): value is Record<string, unknown> {
  return Boolean(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value === "string" && value) return value;
  throw new CliError("youtube_response_invalid", `YouTube response is missing ${field}.`);
}

function inferVideoMimeType(filePath: string): string {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".mp4") return "video/mp4";
  if (extension === ".mov") return "video/quicktime";
  if (extension === ".m4v") return "video/x-m4v";
  if (extension === ".webm") return "video/webm";
  if (extension === ".mkv") return "video/x-matroska";
  if (extension === ".avi") return "video/x-msvideo";
  return "application/octet-stream";
}
