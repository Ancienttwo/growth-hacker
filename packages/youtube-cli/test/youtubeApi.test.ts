import { afterEach, describe, expect, test } from "bun:test";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { YOUTUBE_SCOPES, buildRuntimeConfig } from "../src/config";
import { readUploadState, writeUploadState } from "../src/store";
import { YoutubeApiClient } from "../src/youtubeApi";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("youtube api client", () => {
  test("reads own channel and stores normalized account", async () => {
    const { client, urls } = await clientWithResponses([channelResponse()]);

    const result = await client.channelMine();

    expect(urls[0].pathname).toBe("/youtube/v3/channels");
    expect(urls[0].searchParams.get("mine")).toBe("true");
    expect(result).toMatchObject({
      id: "UC123",
      title: "AstroZi",
      uploadsPlaylistId: "UU123"
    });
  });

  test("lists uploaded videos through the uploads playlist", async () => {
    const { client, urls } = await clientWithResponses([
      channelResponse(),
      jsonResponse({
        nextPageToken: "next",
        items: [
          {
            snippet: {
              title: "Launch",
              channelId: "UC123",
              channelTitle: "AstroZi",
              thumbnails: {}
            },
            contentDetails: {
              videoId: "video-1",
              videoPublishedAt: "2026-05-24T00:00:00Z"
            },
            status: { privacyStatus: "public" }
          }
        ]
      })
    ]);

    const result = await client.videosList({ maxResults: 25 });

    expect(urls[1].pathname).toBe("/youtube/v3/playlistItems");
    expect(urls[1].searchParams.get("playlistId")).toBe("UU123");
    expect(result.nextPageToken).toBe("next");
    expect(result.videos[0]).toMatchObject({ id: "video-1", title: "Launch", privacyStatus: "public" });
  });

  test("gets one video by id", async () => {
    const { client, urls } = await clientWithResponses([
      jsonResponse({
        items: [
          {
            id: "video-1",
            snippet: { title: "Launch", publishedAt: "2026-05-24T00:00:00Z" },
            contentDetails: { duration: "PT1M" },
            status: { privacyStatus: "private" },
            statistics: { viewCount: "5" }
          }
        ]
      })
    ]);

    const result = await client.videoGet("video-1");

    expect(urls[0].searchParams.get("id")).toBe("video-1");
    expect(result).toMatchObject({ id: "video-1", title: "Launch", duration: "PT1M", privacyStatus: "private" });
  });

  test("lists comments with replies", async () => {
    const { client, urls } = await clientWithResponses([
      jsonResponse({
        items: [
          {
            snippet: {
              totalReplyCount: 1,
              topLevelComment: {
                id: "comment-1",
                snippet: {
                  videoId: "video-1",
                  authorDisplayName: "Viewer",
                  textDisplay: "hello",
                  likeCount: 2
                }
              }
            },
            replies: {
              comments: [
                {
                  id: "reply-1",
                  snippet: { authorDisplayName: "AstroZi", textDisplay: "thanks" }
                }
              ]
            }
          }
        ]
      })
    ]);

    const result = await client.commentsList({ videoId: "video-1", maxResults: 50 });

    expect(urls[0].pathname).toBe("/youtube/v3/commentThreads");
    expect(urls[0].searchParams.get("textFormat")).toBe("plainText");
    expect(result.comments[0]).toMatchObject({
      id: "comment-1",
      videoId: "video-1",
      totalReplyCount: 1,
      replies: [{ id: "reply-1", authorDisplayName: "AstroZi" }]
    });
  });

  test("dry-runs comment reply without auth or API calls", async () => {
    let called = false;
    const { client } = await clientWithResponses([]);
    (client as unknown as { fetchImpl: typeof fetch }).fetchImpl = (async () => {
      called = true;
      return jsonResponse({});
    }) as unknown as typeof fetch;

    const result = await client.replyToComment({
      parentId: "comment-1",
      textOriginal: "thanks"
    });

    expect(result).toMatchObject({
      action: "reply",
      dryRun: true,
      parentId: "comment-1",
      textOriginal: "thanks"
    });
    expect(called).toBe(false);
  });

  test("posts a confirmed comment reply with operate scope", async () => {
    const { client, urls, inits } = await clientWithResponses([
      channelResponse(),
      jsonResponse({
        id: "reply-1",
        snippet: {
          parentId: "comment-1",
          textOriginal: "thanks"
        }
      })
    ], [YOUTUBE_SCOPES.operate]);

    const result = await client.replyToComment({
      parentId: "comment-1",
      textOriginal: "thanks",
      confirm: "comment-1"
    });

    expect(urls[0].pathname).toBe("/youtube/v3/channels");
    expect(urls[1].pathname).toBe("/youtube/v3/comments");
    expect(urls[1].searchParams.get("part")).toBe("snippet");
    expect(inits[1]?.method).toBe("POST");
    expect(JSON.parse(String(inits[1]?.body))).toEqual({
      snippet: { parentId: "comment-1", textOriginal: "thanks" }
    });
    expect(result).toMatchObject({
      action: "reply",
      dryRun: false,
      comment: { id: "reply-1", textOriginal: "thanks" }
    });
  });

  test("moderates a confirmed comment and supports ban-author only for rejected", async () => {
    const { client, urls, inits } = await clientWithResponses([channelResponse(), new Response("", { status: 204 })], [YOUTUBE_SCOPES.operate]);

    const result = await client.moderateComment({
      commentId: "comment-1",
      moderationStatus: "rejected",
      banAuthor: true,
      confirm: "comment-1"
    });

    expect(urls[0].pathname).toBe("/youtube/v3/channels");
    expect(urls[1].pathname).toBe("/youtube/v3/comments/setModerationStatus");
    expect(urls[1].searchParams.get("id")).toBe("comment-1");
    expect(urls[1].searchParams.get("moderationStatus")).toBe("rejected");
    expect(urls[1].searchParams.get("banAuthor")).toBe("true");
    expect(inits[1]?.method).toBe("POST");
    expect(result).toMatchObject({ action: "moderate", dryRun: false, banAuthor: true });
  });

  test("deletes a confirmed comment with operate scope", async () => {
    const { client, urls, inits } = await clientWithResponses([channelResponse(), new Response("", { status: 204 })], [YOUTUBE_SCOPES.operate]);

    const result = await client.deleteComment({
      commentId: "comment-1",
      confirm: "comment-1"
    });

    expect(urls[0].pathname).toBe("/youtube/v3/channels");
    expect(urls[1].pathname).toBe("/youtube/v3/comments");
    expect(urls[1].searchParams.get("id")).toBe("comment-1");
    expect(inits[1]?.method).toBe("DELETE");
    expect(result).toEqual({
      action: "delete",
      dryRun: false,
      commentId: "comment-1"
    });
  });

  test("requires expected channel binding before confirmed comment mutations", async () => {
    const { client, urls } = await clientWithResponses([], [YOUTUBE_SCOPES.operate], false);

    await expect(client.deleteComment({ commentId: "comment-1", confirm: "comment-1" })).rejects.toMatchObject({
      code: "youtube_expected_channel_missing"
    });
    expect(urls).toHaveLength(0);
  });

  test("blocks confirmed comment mutations when the authenticated channel mismatches", async () => {
    const { client, urls, inits } = await clientWithResponses([channelResponse()], [YOUTUBE_SCOPES.operate], "UC999");

    await expect(client.deleteComment({ commentId: "comment-1", confirm: "comment-1" })).rejects.toMatchObject({
      code: "youtube_expected_channel_mismatch"
    });
    expect(urls).toHaveLength(1);
    expect(urls[0].pathname).toBe("/youtube/v3/channels");
    expect(inits[0]?.method).toBe("GET");
  });

  test("blocks comment mutations with wrong confirm or missing operate scope before API calls", async () => {
    const { client } = await clientWithResponses([], [YOUTUBE_SCOPES.read]);

    await expect(client.deleteComment({ commentId: "comment-1", confirm: "wrong" })).rejects.toMatchObject({
      code: "youtube_confirm_mismatch"
    });
    await expect(client.deleteComment({ commentId: "comment-1", confirm: "comment-1" })).rejects.toMatchObject({
      code: "youtube_scope_missing"
    });
  });

  test("normalizes auth, quota, rate, and server errors", async () => {
    for (const [status, reason, code] of [
      [401, "authError", "youtube_auth_expired"],
      [403, "quotaExceeded", "youtube_quota_exceeded"],
      [403, "insufficientPermissions", "youtube_scope_missing"],
      [429, "rateLimitExceeded", "youtube_rate_limited"],
      [500, "backendError", "youtube_api_unavailable"]
    ] as const) {
      const { client } = await clientWithResponses([errorResponse(status, reason)]);
      await expect(client.videoGet("video-1")).rejects.toMatchObject({ code });
    }
  });

  test("rejects tokens without read-capable scopes before API calls", async () => {
    const root = await mkdtemp(join(tmpdir(), "yt-cli-api-"));
    tempRoots.push(root);
    let called = false;
    const client = new YoutubeApiClient({
      config: buildRuntimeConfig({ profile: "astrozi", growthRoot: root }),
      fetchImpl: (async () => {
        called = true;
        return jsonResponse({});
      }) as unknown as typeof fetch,
      accessToken: "access",
      scopes: [YOUTUBE_SCOPES.upload]
    });

    await expect(client.videoGet("video-1")).rejects.toMatchObject({ code: "youtube_scope_missing" });
    expect(called).toBe(false);
  });

  test("uploads a private video through a resumable session", async () => {
    const root = await mkdtemp(join(tmpdir(), "yt-cli-api-"));
    tempRoots.push(root);
    const videoPath = join(root, "video.mp4");
    await writeFile(videoPath, "fake-video-bytes");
    const calls: Array<{ url: URL; init?: RequestInit }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: new URL(String(input)), init });
      if (calls.length === 1) {
        return channelResponse();
      }
      if (calls.length === 2) {
        return new Response("{}", {
          status: 200,
          headers: { Location: "https://upload.youtube.test/session/1" }
        });
      }
      return jsonResponse({
        id: "uploaded-1",
        snippet: { title: "Launch" },
        status: { privacyStatus: "private" }
      });
    }) as typeof fetch;
    const client = new YoutubeApiClient({
      config: runtimeConfig(root),
      fetchImpl,
      accessToken: "access",
      scopes: [YOUTUBE_SCOPES.operate]
    });

    const result = await client.uploadVideo({
      filePath: videoPath,
      title: "Launch",
      description: "desc",
      categoryId: "22",
      tags: ["astrozi", "launch"],
      privacyStatus: "private",
      madeForKids: false,
      containsSyntheticMedia: true,
      notifySubscribers: false
    });

    expect(calls[0].url.pathname).toBe("/youtube/v3/channels");
    expect(calls[1].url.pathname).toBe("/upload/youtube/v3/videos");
    expect(calls[1].url.searchParams.get("uploadType")).toBe("resumable");
    expect(calls[1].url.searchParams.get("part")).toBe("snippet,status");
    expect(calls[1].url.searchParams.get("notifySubscribers")).toBe("false");
    expect(JSON.parse(String(calls[1].init?.body))).toMatchObject({
      snippet: { title: "Launch", description: "desc", tags: ["astrozi", "launch"] },
      status: { privacyStatus: "private", selfDeclaredMadeForKids: false, containsSyntheticMedia: true }
    });
    expect(calls[2].url.href).toBe("https://upload.youtube.test/session/1");
    expect((calls[2].init?.headers as Record<string, string>)["Content-Range"]).toBe("bytes 0-15/16");
    expect(result.video).toMatchObject({ id: "uploaded-1", title: "Launch", privacyStatus: "private" });
    await expect(access(result.upload.uploadStatePath)).rejects.toThrow();
  });

  test("requires expected channel binding before uploads", async () => {
    const root = await mkdtemp(join(tmpdir(), "yt-cli-api-"));
    tempRoots.push(root);
    const videoPath = join(root, "video.mp4");
    await writeFile(videoPath, "fake-video-bytes");
    let called = false;
    const client = new YoutubeApiClient({
      config: runtimeConfig(root, false),
      fetchImpl: (async () => {
        called = true;
        return jsonResponse({});
      }) as unknown as typeof fetch,
      accessToken: "access",
      scopes: [YOUTUBE_SCOPES.operate]
    });

    await expect(
      client.uploadVideo({
        filePath: videoPath,
        title: "Launch",
        description: "",
        categoryId: "22",
        tags: [],
        privacyStatus: "private",
        madeForKids: false,
        containsSyntheticMedia: true,
        notifySubscribers: false
      })
    ).rejects.toMatchObject({ code: "youtube_expected_channel_missing" });
    expect(called).toBe(false);
  });

  test("requires read-capable scope for upload channel verification", async () => {
    const root = await mkdtemp(join(tmpdir(), "yt-cli-api-"));
    tempRoots.push(root);
    const videoPath = join(root, "video.mp4");
    await writeFile(videoPath, "fake-video-bytes");
    let called = false;
    const client = new YoutubeApiClient({
      config: runtimeConfig(root),
      fetchImpl: (async () => {
        called = true;
        return jsonResponse({});
      }) as unknown as typeof fetch,
      accessToken: "access",
      scopes: [YOUTUBE_SCOPES.upload]
    });

    await expect(
      client.uploadVideo({
        filePath: videoPath,
        title: "Launch",
        description: "",
        categoryId: "22",
        tags: [],
        privacyStatus: "private",
        madeForKids: false,
        containsSyntheticMedia: true,
        notifySubscribers: false
      })
    ).rejects.toMatchObject({ code: "youtube_scope_missing" });
    expect(called).toBe(false);
  });

  test("blocks public upload without explicit confirmation before API calls", async () => {
    const root = await mkdtemp(join(tmpdir(), "yt-cli-api-"));
    tempRoots.push(root);
    let called = false;
    const client = new YoutubeApiClient({
      config: buildRuntimeConfig({ profile: "astrozi", growthRoot: root }),
      fetchImpl: (async () => {
        called = true;
        return jsonResponse({});
      }) as unknown as typeof fetch,
      accessToken: "access",
      scopes: [YOUTUBE_SCOPES.upload]
    });

    await expect(
      client.uploadVideo({
        filePath: join(root, "missing.mp4"),
        title: "Launch",
        description: "",
        categoryId: "22",
        tags: [],
        privacyStatus: "public",
        madeForKids: false,
        containsSyntheticMedia: true,
        notifySubscribers: false
      })
    ).rejects.toMatchObject({ code: "youtube_public_upload_requires_confirmation" });
    expect(called).toBe(false);
  });

  test("rejects upload without upload-capable scope before API calls", async () => {
    const root = await mkdtemp(join(tmpdir(), "yt-cli-api-"));
    tempRoots.push(root);
    const videoPath = join(root, "video.mp4");
    await writeFile(videoPath, "fake-video-bytes");
    let called = false;
    const client = new YoutubeApiClient({
      config: buildRuntimeConfig({ profile: "astrozi", growthRoot: root }),
      fetchImpl: (async () => {
        called = true;
        return jsonResponse({});
      }) as unknown as typeof fetch,
      accessToken: "access",
      scopes: [YOUTUBE_SCOPES.read]
    });

    await expect(
      client.uploadVideo({
        filePath: videoPath,
        title: "Launch",
        description: "",
        categoryId: "22",
        tags: [],
        privacyStatus: "private",
        madeForKids: false,
        containsSyntheticMedia: true,
        notifySubscribers: false
      })
    ).rejects.toMatchObject({ code: "youtube_scope_missing" });
    expect(called).toBe(false);
  });

  test("checks remote upload status from the saved session", async () => {
    const root = await mkdtemp(join(tmpdir(), "yt-cli-api-"));
    tempRoots.push(root);
    await writeUploadState(buildRuntimeConfig({ profile: "astrozi", growthRoot: root }), uploadStateFixture("astrozi", join(root, "video.mp4")));
    const calls: Array<{ url: URL; init?: RequestInit }> = [];
    const client = new YoutubeApiClient({
      config: buildRuntimeConfig({ profile: "astrozi", growthRoot: root }),
      fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: new URL(String(input)), init });
        return new Response("", {
          status: 308,
          headers: { Range: "bytes=0-3", "Retry-After": "5" }
        });
      }) as typeof fetch,
      accessToken: "access",
      scopes: [YOUTUBE_SCOPES.upload]
    });

    const result = await client.uploadStatus("abcdef1234567890");

    expect(calls[0].url.href).toBe("https://upload.youtube.test/session/1");
    expect((calls[0].init?.headers as Record<string, string>)["Content-Range"]).toBe("bytes */16");
    expect(result).toMatchObject({
      uploadId: "abcdef1234567890",
      uploadedBytes: 4,
      remainingBytes: 12,
      state: "in-progress",
      retryAfter: "5"
    });
  });

  test("resumes upload from the next byte and clears completed state", async () => {
    const root = await mkdtemp(join(tmpdir(), "yt-cli-api-"));
    tempRoots.push(root);
    const videoPath = join(root, "video.mp4");
    await writeFile(videoPath, "fake-video-bytes");
    const config = runtimeConfig(root);
    await writeUploadState(config, uploadStateFixture("astrozi", videoPath));
    const calls: Array<{ url: URL; init?: RequestInit }> = [];
    const client = new YoutubeApiClient({
      config,
      fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: new URL(String(input)), init });
        if (calls.length === 1) {
          return channelResponse();
        }
        if (calls.length === 2) {
          return new Response("", { status: 308, headers: { Range: "bytes=0-3" } });
        }
        return jsonResponse({
          id: "uploaded-1",
          snippet: { title: "Launch" },
          status: { privacyStatus: "private" }
        }, 201);
      }) as typeof fetch,
      accessToken: "access",
      scopes: [YOUTUBE_SCOPES.operate]
    });

    const result = await client.resumeUpload("abcdef1234567890");

    expect(calls[0].url.pathname).toBe("/youtube/v3/channels");
    expect((calls[1].init?.headers as Record<string, string>)["Content-Range"]).toBe("bytes */16");
    expect((calls[2].init?.headers as Record<string, string>)["Content-Range"]).toBe("bytes 4-15/16");
    expect((calls[2].init?.headers as Record<string, string>)["Content-Length"]).toBe("12");
    expect(result).toMatchObject({
      uploadId: "abcdef1234567890",
      state: "complete",
      uploadedBytes: 16,
      remainingBytes: 0,
      video: { id: "uploaded-1" }
    });
    await expect(readUploadState(config, "abcdef1234567890")).rejects.toMatchObject({ code: "youtube_upload_state_missing" });
  });

  test("maps expired upload sessions to an actionable error", async () => {
    const root = await mkdtemp(join(tmpdir(), "yt-cli-api-"));
    tempRoots.push(root);
    const config = buildRuntimeConfig({ profile: "astrozi", growthRoot: root });
    await writeUploadState(config, uploadStateFixture("astrozi", join(root, "video.mp4")));
    const client = new YoutubeApiClient({
      config,
      fetchImpl: (async () => jsonResponse({}, 404)) as unknown as typeof fetch,
      accessToken: "access",
      scopes: [YOUTUBE_SCOPES.upload]
    });

    await expect(client.uploadStatus("abcdef1234567890")).rejects.toMatchObject({ code: "youtube_upload_session_expired" });
  });
});

async function clientWithResponses(responses: Response[], scopes: string[] = [YOUTUBE_SCOPES.read], expectedChannel: boolean | string = true) {
  const root = await mkdtemp(join(tmpdir(), "yt-cli-api-"));
  tempRoots.push(root);
  const urls: URL[] = [];
  const inits: Array<RequestInit | undefined> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    urls.push(new URL(String(input)));
    inits.push(init);
    const response = responses.shift();
    if (!response) throw new Error("unexpected fetch");
    return response;
  }) as typeof fetch;
  const client = new YoutubeApiClient({
    config: runtimeConfig(root, expectedChannel),
    fetchImpl,
    accessToken: "access",
    scopes
  });
  return { client, urls, inits };
}

function runtimeConfig(root: string, expectedChannel: boolean | string = true) {
  return buildRuntimeConfig({
    profile: "astrozi",
    growthRoot: root,
    ...(expectedChannel ? { expectedChannelId: expectedChannel === true ? "UC123" : expectedChannel } : {})
  });
}

function channelResponse(): Response {
  return jsonResponse({
    items: [
      {
        id: "UC123",
        snippet: { title: "AstroZi", customUrl: "@astrozi" },
        contentDetails: { relatedPlaylists: { uploads: "UU123" } },
        statistics: { subscriberCount: "10" }
      }
    ]
  });
}

function errorResponse(status: number, reason: string): Response {
  return jsonResponse(
    {
      error: {
        message: reason,
        errors: [{ reason }]
      }
    },
    status
  );
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function uploadStateFixture(profile: string, filePath: string) {
  const now = new Date("2026-05-25T00:00:00.000Z").toISOString();
  return {
    schemaVersion: 1 as const,
    profile,
    account: "youtube" as const,
    uploadId: "abcdef1234567890",
    filePath,
    size: 16,
    mimeType: "video/mp4",
    metadata: {
      snippet: { title: "Launch" },
      status: { privacyStatus: "private" }
    },
    sessionUrl: "https://upload.youtube.test/session/1",
    createdAt: now,
    updatedAt: now
  };
}
