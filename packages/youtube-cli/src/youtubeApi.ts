import { requireReadScope } from "./config";
import { getValidAccessToken } from "./oauth";
import { writeAccount, type YoutubeAccountFile } from "./store";
import { CliError, type RuntimeConfig } from "./types";

const API_BASE = "https://www.googleapis.com/youtube/v3";

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

export class YoutubeApiClient {
  private readonly config: RuntimeConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly staticAccessToken?: string;
  private readonly staticScopes?: string[];

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

  private async request(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    const token = this.staticAccessToken
      ? { accessToken: this.staticAccessToken, scopes: this.staticScopes ?? [] }
      : await getValidAccessToken(this.config);
    requireReadScope(token.scopes);

    const url = new URL(`${API_BASE}/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

    const response = await this.fetchImpl(url, {
      headers: { Authorization: `Bearer ${token.accessToken}`, Accept: "application/json" }
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw normalizeYoutubeError(response.status, payload);
    return payload;
  }
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
