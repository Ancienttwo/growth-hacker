import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  XIAOHONGSHU_PLATFORM,
  type XhsPublishedPost,
  type XhsPublishedPostStats,
  type XhsPublishedPostStatus
} from "@growth-hacker/core";

import type { AppConfig } from "./config";
import { commandExists, redact, runCommand } from "./shell";
import { assertSafeSegment, profileRoot, safeStat } from "./workspace";

const XHS_PUBLISHED_POSTS_SCHEMA_VERSION = 1;
const XHS_MY_NOTES_MAX_PAGES = 10;

interface XhsPublishedPostStore {
  schemaVersion: typeof XHS_PUBLISHED_POSTS_SCHEMA_VERSION;
  posts: XhsPublishedPost[];
}

export interface UpdateXhsPublishedPostInput {
  status?: XhsPublishedPostStatus;
  statusNote?: string;
  keyword?: string;
}

export interface XhsPublishedPostsSyncResult {
  source: "xhs-cli";
  syncedAt: string;
  imported: number;
  updated: number;
  archived: number;
  skipped: number;
  posts: XhsPublishedPost[];
}

interface UpsertXhsPublishedPostOptions {
  reconcileMissing?: boolean;
}

export function listXhsPublishedPosts(config: AppConfig, profile: string): XhsPublishedPost[] {
  assertProfileExists(config, profile);
  return sortPosts(mergePostLists(readStore(config, profile).posts, readMetricsPosts(config, profile)));
}

export async function refreshXhsPublishedPostsFromCli(config: AppConfig, profile: string): Promise<XhsPublishedPostsSyncResult> {
  assertProfileExists(config, profile);
  const xhs = await commandExists("xhs");
  if (!xhs) throw new Error("xhs_cli_not_found");

  const payload = await fetchXhsMyNotes(xhs);
  return upsertXhsPublishedPostItems(config, profile, payload.items, payload.skipped, { reconcileMissing: true });
}

export function upsertXhsPublishedPostItems(
  config: AppConfig,
  profile: string,
  items: Array<Record<string, unknown>>,
  skipped = 0,
  options: UpsertXhsPublishedPostOptions = {}
): XhsPublishedPostsSyncResult {
  assertProfileExists(config, profile);
  const syncedAt = new Date().toISOString();
  const current = listXhsPublishedPosts(config, profile);
  const currentById = new Map(current.map((post) => [post.id, post]));
  const activeIds = new Set<string>();
  let imported = 0;
  let updated = 0;
  let archived = 0;

  for (const item of items) {
    const next = normalizeXhsPublishedPostItem(profile, item, syncedAt);
    activeIds.add(next.id);
    const existing = currentById.get(next.id);
    if (existing) {
      updated += 1;
      currentById.set(next.id, {
        ...existing,
        ...next,
        keyword: existing.keyword || next.keyword,
        status: existing.status,
        statusNote: existing.statusNote,
        updatedAt: syncedAt
      });
    } else {
      imported += 1;
      currentById.set(next.id, next);
    }
  }

  if (options.reconcileMissing) {
    for (const [id, post] of currentById) {
      if (activeIds.has(id) || post.status === "archived" || !canReconcileWithXhsSync(post)) continue;
      archived += 1;
      currentById.set(id, {
        ...post,
        status: "archived",
        statusNote: appendStatusNote(post.statusNote, `missing_from_xhs_my_notes_at=${syncedAt}`),
        updatedAt: syncedAt
      });
    }
  }

  const posts = sortPosts([...currentById.values()]);
  writeStore(config, profile, { schemaVersion: XHS_PUBLISHED_POSTS_SCHEMA_VERSION, posts });
  return { source: "xhs-cli", syncedAt, imported, updated, archived, skipped, posts };
}

export function updateXhsPublishedPost(
  config: AppConfig,
  profile: string,
  id: string,
  input: UpdateXhsPublishedPostInput
): XhsPublishedPost {
  assertProfileExists(config, profile);
  const posts = listXhsPublishedPosts(config, profile);
  const index = posts.findIndex((post) => post.id === id);
  if (index < 0) throw new Error(`published_post_not_found:${id}`);

  const current = posts[index];
  const updated: XhsPublishedPost = {
    ...current,
    status: normalizeStatus(input.status) ?? current.status,
    statusNote: input.statusNote === undefined ? current.statusNote : cleanOptionalString(input.statusNote),
    keyword: input.keyword === undefined ? current.keyword : cleanOptionalString(input.keyword),
    updatedAt: new Date().toISOString()
  };
  posts[index] = updated;
  writeStore(config, profile, { schemaVersion: XHS_PUBLISHED_POSTS_SCHEMA_VERSION, posts: sortPosts(posts) });
  return updated;
}

export function normalizeXhsPublishedPostItem(profile: string, item: Record<string, unknown>, syncedAt: string): XhsPublishedPost {
  const card = objectValue(item.note_card) ?? item;
  const interact = objectValue(card.interact_info) ?? objectValue(item.interact_info) ?? objectValue(card.interactions) ?? {};
  const imageList = arrayValue(card.image_list) ?? arrayValue(item.image_list) ?? arrayValue(card.images_list) ?? arrayValue(item.images_list) ?? [];
  const coverObject = objectValue(card.cover) ?? objectValue(item.cover);
  const author = objectValue(card.user) ?? objectValue(item.user) ?? objectValue(card.author) ?? {};

  const rawId = firstString(item.id, item.note_id, item.noteId, card.id, card.note_id, card.noteId);
  const title = firstString(card.display_title, card.title, item.display_title, item.title, card.desc, item.desc) ?? "Untitled note";
  const description = cleanOptionalString(firstString(card.desc, item.desc, card.description, item.description));
  const publishedAt = normalizeDate(firstValue(card.time, card.publish_time, card.last_update_time, item.time, item.publish_time, item.created_at));
  const id = rawId || `note-${stableHash(profile, title, publishedAt ?? "")}`;
  const type = firstString(card.type, item.type, card.note_type, item.note_type);
  const contentType = normalizeContentType(type, imageList, objectValue(card.video_info) ?? objectValue(item.video_info));
  const coverUrl =
    normalizeUrl(firstString(coverObject?.url, coverObject?.master_url, card.cover_url, item.cover_url, deepString(imageList[0], "url"))) ??
    undefined;
  const url = normalizeUrl(firstString(item.url, item.share_url, card.url, card.share_url)) ?? (rawId ? `https://www.xiaohongshu.com/explore/${rawId}` : undefined);

  return {
    id,
    platform: XIAOHONGSHU_PLATFORM,
    profile,
    title,
    description,
    authorName: cleanOptionalString(firstString(author.nickname, author.name, item.nickname)),
    authorAvatarUrl: normalizeUrl(firstString(author.avatar, author.image, author.avatar_url)),
    coverUrl,
    url,
    contentType,
    publishedAt,
    syncedAt,
    updatedAt: syncedAt,
    status: "published",
    source: "xhs-cli",
    stats: normalizeStats(interact, card, item)
  };
}

function parseXhsEnvelope(stdout: string): { items: Array<Record<string, unknown>>; skipped: number } {
  let envelope: unknown;
  try {
    envelope = JSON.parse(stdout);
  } catch {
    throw new Error("xhs_my_notes_non_json");
  }

  const root = objectValue(envelope);
  if (!root) throw new Error("xhs_my_notes_invalid_json");
  if (root.ok === false) {
    const error = objectValue(root.error);
    throw new Error(firstString(error?.code, error?.message) ?? "xhs_my_notes_error");
  }

  const data = root.data ?? root;
  const rawItems = extractItems(data);
  const items = rawItems.filter((item): item is Record<string, unknown> => Boolean(objectValue(item)));
  return { items, skipped: rawItems.length - items.length };
}

function extractItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const object = objectValue(value);
  if (!object) return [];
  for (const key of ["items", "notes", "list", "data"]) {
    const next = object[key];
    if (Array.isArray(next)) return next;
    if (key === "data") {
      const nested = extractItems(next);
      if (nested.length) return nested;
    }
  }
  return [];
}

async function fetchXhsMyNotes(xhs: string): Promise<{ items: Array<Record<string, unknown>>; skipped: number }> {
  const items: Array<Record<string, unknown>> = [];
  const seenPages = new Set<string>();
  let skipped = 0;

  for (let page = 0; page < XHS_MY_NOTES_MAX_PAGES; page += 1) {
    const result = await runCommand(xhs, ["my-notes", "--page", String(page), "--json"], { timeoutMs: 90000, redactOutput: false });
    if (result.exitCode !== 0) {
      throw new Error(redact(result.stderr || result.stdout || result.error || "xhs_my_notes_failed"));
    }

    const payload = parseXhsEnvelope(result.stdout);
    if (!payload.items.length) break;

    const pageKey = payload.items.map((item) => xhsPostId(item) ?? stableHash(JSON.stringify(item))).join("|");
    if (seenPages.has(pageKey)) break;
    seenPages.add(pageKey);

    items.push(...payload.items);
    skipped += payload.skipped;
  }

  return { items, skipped };
}

function readMetricsPosts(config: AppConfig, profile: string): XhsPublishedPost[] {
  const path = join(profileRoot(config, XIAOHONGSHU_PLATFORM, profile), "metrics.csv");
  if (!existsSync(path)) return [];
  const rows = parseCsv(readFileSync(path, "utf8"));
  const [header, ...body] = rows;
  if (!header?.length) return [];
  const keys = header.map((key) => key.trim());
  const now = new Date().toISOString();
  return body
    .map((cells) => Object.fromEntries(keys.map((key, index) => [key, cells[index]?.trim() ?? ""])))
    .filter((row) => row.note_title)
    .map((row) => {
      const publishedAt = normalizeDate(row.date);
      const noteId = cleanOptionalString(firstString(row.note_id, row.id, row.xhs_note_id, extractNoteId(row.status_note)));
      return {
        id: noteId ?? `metrics-${stableHash(profile, row.date, row.note_title)}`,
        platform: XIAOHONGSHU_PLATFORM,
        profile,
        title: row.note_title,
        contentType: normalizeContentType(row.content_type, [], undefined),
        publishedAt,
        updatedAt: now,
        keyword: cleanOptionalString(row.keyword),
        status: row.status_note ? "monitoring" : "published",
        statusNote: cleanOptionalString(row.status_note),
        source: "metrics",
        stats: {
          views: parseVisibleCount(row.views),
          likes: parseVisibleCount(row.likes),
          collects: parseVisibleCount(row.collects),
          comments: parseVisibleCount(row.comments),
          shares: parseVisibleCount(row.shares)
        }
      } satisfies XhsPublishedPost;
    });
}

function readStore(config: AppConfig, profile: string): XhsPublishedPostStore {
  const path = storePath(config, profile);
  if (!existsSync(path)) return { schemaVersion: XHS_PUBLISHED_POSTS_SCHEMA_VERSION, posts: [] };
  const payload = JSON.parse(readFileSync(path, "utf8")) as XhsPublishedPostStore;
  return {
    schemaVersion: XHS_PUBLISHED_POSTS_SCHEMA_VERSION,
    posts: (payload.posts ?? []).map(normalizeStoredPost)
  };
}

function writeStore(config: AppConfig, profile: string, store: XhsPublishedPostStore): void {
  const dir = storeDir(config);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = storePath(config, profile);
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify({ schemaVersion: XHS_PUBLISHED_POSTS_SCHEMA_VERSION, posts: store.posts }, null, 2) + "\n", {
    mode: 0o600
  });
  renameSync(tmp, path);
}

function normalizeStoredPost(post: XhsPublishedPost): XhsPublishedPost {
  return {
    ...post,
    platform: XIAOHONGSHU_PLATFORM,
    status: normalizeStatus(post.status) ?? "published",
    source: post.source ?? "manual",
    stats: post.stats ?? {},
    updatedAt: post.updatedAt ?? new Date().toISOString()
  };
}

function canReconcileWithXhsSync(post: XhsPublishedPost): boolean {
  if (post.source === "xhs-cli") return true;
  if (post.source === "metrics" && !post.id.startsWith("metrics-")) return true;
  return Boolean(post.url?.includes("xiaohongshu.com/explore/"));
}

function appendStatusNote(current: string | undefined, note: string): string {
  return current ? `${current}; ${note}` : note;
}

function mergePostLists(primary: XhsPublishedPost[], secondary: XhsPublishedPost[]): XhsPublishedPost[] {
  const byId = new Map<string, XhsPublishedPost>();
  for (const post of secondary) byId.set(post.id, post);
  for (const post of primary) byId.set(post.id, post);
  return [...byId.values()];
}

function sortPosts(posts: XhsPublishedPost[]): XhsPublishedPost[] {
  return [...posts].sort((a, b) => {
    const left = a.publishedAt ?? a.syncedAt ?? a.updatedAt;
    const right = b.publishedAt ?? b.syncedAt ?? b.updatedAt;
    return right.localeCompare(left) || a.title.localeCompare(b.title);
  });
}

function assertProfileExists(config: AppConfig, profile: string): void {
  assertSafeSegment(profile, "profile");
  const root = profileRoot(config, XIAOHONGSHU_PLATFORM, profile);
  if (!safeStat(root)?.isDirectory()) throw new Error(`profile_not_found:${XIAOHONGSHU_PLATFORM}/${profile}`);
}

function storeDir(config: AppConfig): string {
  return join(config.growthRoot, "published-posts", XIAOHONGSHU_PLATFORM);
}

function storePath(config: AppConfig, profile: string): string {
  assertSafeSegment(profile, "profile");
  return join(storeDir(config), `${profile}.json`);
}

function normalizeStats(
  interact: Record<string, unknown>,
  card: Record<string, unknown>,
  item: Record<string, unknown>
): XhsPublishedPostStats {
  return {
    views: firstCount(interact.view_count, interact.views, card.view_count, item.view_count, item.views),
    likes: firstCount(interact.liked_count, interact.like_count, interact.likes, card.liked_count, card.likes, item.liked_count, item.likes),
    collects: firstCount(interact.collected_count, interact.collect_count, interact.collects, card.collected_count, item.collected_count),
    comments: firstCount(interact.comment_count, interact.comments, card.comment_count, card.comments_count, item.comment_count, item.comments_count),
    shares: firstCount(interact.share_count, interact.shares, card.share_count, card.shared_count, item.share_count, item.shared_count)
  };
}

function normalizeContentType(value: unknown, imageList: unknown[], videoInfo: Record<string, unknown> | undefined): XhsPublishedPost["contentType"] {
  const type = String(value ?? "").toLowerCase();
  if (type.includes("video") || videoInfo) return "video";
  if (type.includes("image") || type.includes("normal") || imageList.length) return "image";
  if (type.includes("text")) return "text";
  return "unknown";
}

function xhsPostId(item: Record<string, unknown>): string | undefined {
  const card = objectValue(item.note_card) ?? item;
  return cleanOptionalString(firstString(item.id, item.note_id, item.noteId, card.id, card.note_id, card.noteId));
}

function extractNoteId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.match(/(?:^|[;,\s])note[-_ ]?id\s*[:=]\s*([a-zA-Z0-9_-]+)/i);
  return match?.[1];
}

function normalizeStatus(value: unknown): XhsPublishedPostStatus | undefined {
  return value === "published" || value === "monitoring" || value === "needs-review" || value === "archived" ? value : undefined;
}

function normalizeDate(value: unknown): string | undefined {
  const raw = firstValue(value);
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw === "number") {
    const millis = raw < 10_000_000_000 ? raw * 1000 : raw;
    return new Date(millis).toISOString();
  }
  const text = String(raw).trim();
  if (/^\d+$/.test(text)) return normalizeDate(Number(text));
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeUrl(value: unknown): string | undefined {
  const text = cleanOptionalString(firstString(value));
  if (!text || !/^https?:\/\//i.test(text)) return undefined;
  return text;
}

function firstCount(...values: unknown[]): number | undefined {
  for (const value of values) {
    const count = parseVisibleCount(value);
    if (count !== undefined) return count;
  }
  return undefined;
}

function parseVisibleCount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value !== "string") return undefined;
  const text = value.trim().replace(/,/g, "");
  if (!text || text === "-") return undefined;
  const match = text.match(/^(\d+(?:\.\d+)?)(万|w|k|千)?$/i);
  if (!match) return undefined;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return undefined;
  const unit = match[2]?.toLowerCase();
  const multiplier = unit === "万" || unit === "w" ? 10000 : unit === "k" || unit === "千" ? 1000 : 1;
  return Math.round(base * multiplier);
}

function cleanOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function firstValue(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function arrayValue(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function deepString(value: unknown, key: string): string | undefined {
  return firstString(objectValue(value)?.[key]);
}

function stableHash(...parts: string[]): string {
  return createHash("sha1").update(parts.join("\0")).digest("hex").slice(0, 12);
}

function parseCsv(value: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cellValue) => cellValue.trim()));
}
