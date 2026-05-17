import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type { AppConfig } from "../src/config";
import { listXhsPublishedPosts, toPublicXhsPublishedPost, updateXhsPublishedPost, upsertXhsPublishedPostItems } from "../src/xhsPublished";

function config(): AppConfig {
  const root = mkdtempSync(join(tmpdir(), "growth-hacker-xhs-published-"));
  return {
    growthRoot: join(root, ".growth"),
    hermesHome: join(root, ".hermes"),
    hermesApiBaseUrl: "http://127.0.0.1:8642",
    hermesApiKey: "",
    defaultHermesProfile: "growth-agent",
    socialAgents: [{ id: "growth-agent", runner: "local" }],
    socialCronAgents: ["growth-agent"],
    bundledXiaohongshuSkillRoot: join(root, "skill"),
    legacyXiaohongshuRoot: join(root, ".xiaohongshu", "client"),
    port: 0
  };
}

function createProfile(appConfig: AppConfig, profile = "astrozi"): string {
  mkdirSync(join(appConfig.growthRoot, profile, "xiaohongshu"), { recursive: true });
  const documentPath = join(appConfig.growthRoot, "vault", profile, "xiaohongshu");
  mkdirSync(documentPath, { recursive: true });
  return documentPath;
}

describe("XHS published posts", () => {
  test("lists published posts from profile metrics.csv", () => {
    const appConfig = config();
    const profile = createProfile(appConfig);
    writeFileSync(
      join(profile, "metrics.csv"),
      [
        "date,note_title,views,likes,collects,comments,shares,content_type,keyword,status_note",
        "2026-05-16,7年打水漂 香港身份没了,9000,277,88,13,6,image,香港身份,"
      ].join("\n")
    );

    const posts = listXhsPublishedPosts(appConfig, "astrozi");

    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      title: "7年打水漂 香港身份没了",
      keyword: "香港身份",
      source: "metrics",
      stats: { views: 9000, likes: 277, collects: 88, comments: 13, shares: 6 }
    });
  });

  test("upserts xhs CLI notes and preserves local management status", () => {
    const appConfig = config();
    createProfile(appConfig);

    const first = upsertXhsPublishedPostItems(appConfig, "astrozi", [
      {
        id: "note-1",
        xsec_token: "xsec-1",
        xsec_source: "pc_creatormng",
        share_url: "https://www.xiaohongshu.com/explore/note-1",
        note_card: {
          display_title: "香港入境处请人啦！每月顶薪3w+港币",
          type: "normal",
          time: 1_765_843_200,
          user: { nickname: "搵工小野猪", avatar: "https://cdn.example/avatar.jpg" },
          image_list: [{ url: "https://cdn.example/cover.jpg" }],
          interact_info: { liked_count: "1.2w", collected_count: "330", comment_count: "44" }
        }
      }
    ]);

    expect(first.imported).toBe(1);
    expect(first.posts[0]).toMatchObject({
      id: "note-1",
      authorName: "搵工小野猪",
      coverUrl: "https://cdn.example/cover.jpg",
      stats: { likes: 12000, collects: 330, comments: 44 },
      xsecToken: "xsec-1",
      xsecSource: "pc_creatormng"
    });
    expect(toPublicXhsPublishedPost(first.posts[0])).not.toHaveProperty("xsecToken");

    updateXhsPublishedPost(appConfig, "astrozi", "note-1", { status: "needs-review", statusNote: "封面可复盘" });
    const second = upsertXhsPublishedPostItems(appConfig, "astrozi", [
      {
        id: "note-1",
        note_card: {
          display_title: "香港入境处请人啦！每月顶薪3w+港币",
          interact_info: { liked_count: "1.5w", collected_count: "400", comment_count: "51" }
        }
      }
    ]);

    expect(second.updated).toBe(1);
    expect(second.posts[0]).toMatchObject({
      status: "needs-review",
      statusNote: "封面可复盘",
      stats: { likes: 15000, collects: 400, comments: 51 }
    });
  });

  test("reconciles deleted xhs notes by archiving metrics rows with note_id", () => {
    const appConfig = config();
    const profile = createProfile(appConfig);
    writeFileSync(
      join(profile, "metrics.csv"),
      [
        "date,note_title,views,likes,collects,comments,shares,content_type,keyword,status_note",
        "2026-05-17,一张图看懂：八字十神到底在说什么？,0,0,0,0,0,八字入门,八字十神,published_initial_snapshot; note_id=6a094ac6000000003503aba7"
      ].join("\n")
    );

    const before = listXhsPublishedPosts(appConfig, "astrozi");
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({
      id: "6a094ac6000000003503aba7",
      status: "monitoring",
      source: "metrics"
    });

    const sync = upsertXhsPublishedPostItems(appConfig, "astrozi", [], 0, { reconcileMissing: true });

    expect(sync.archived).toBe(1);
    expect(sync.posts[0]).toMatchObject({
      id: "6a094ac6000000003503aba7",
      status: "archived"
    });
    expect(sync.posts[0].statusNote).toContain("missing_from_xhs_my_notes_at=");
    expect(listXhsPublishedPosts(appConfig, "astrozi")[0].status).toBe("archived");
  });
});
