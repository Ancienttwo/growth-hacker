import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { YOUTUBE_SCOPES, buildRuntimeConfig } from "../src/config";
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
});

async function clientWithResponses(responses: Response[]) {
  const root = await mkdtemp(join(tmpdir(), "yt-cli-api-"));
  tempRoots.push(root);
  const urls: URL[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    urls.push(new URL(String(input)));
    const response = responses.shift();
    if (!response) throw new Error("unexpected fetch");
    return response;
  }) as typeof fetch;
  const client = new YoutubeApiClient({
    config: buildRuntimeConfig({ profile: "astrozi", growthRoot: root }),
    fetchImpl,
    accessToken: "access",
    scopes: [YOUTUBE_SCOPES.read]
  });
  return { client, urls };
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
