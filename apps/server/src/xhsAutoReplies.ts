import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import {
  XIAOHONGSHU_PLATFORM,
  type HermesLlmSelection,
  type XhsAutoReplyItem,
  type XhsAutoReplyItemStatus,
  type XhsAutoReplyLocale,
  type XhsAutoReplyRunResult,
  type XhsAutoReplySettings,
  type XhsAutoReplySyncResult,
  type XhsPublishedPost
} from "@growth-hacker/core";

import type { AppConfig } from "./config";
import { createHermesChatRun, getHermesRun } from "./hermesChat";
import { runHermesProviderPrompt } from "./hermesModels";
import { commandExists, redact, runCommand } from "./shell";
import { listXhsPublishedPosts, refreshXhsPublishedPostsFromCli, type StoredXhsPublishedPost } from "./xhsPublished";
import { assertSafeSegment, profileRoot, safeStat, xhsDocumentRoot } from "./workspace";

const XHS_AUTO_REPLY_QUEUE_SCHEMA_VERSION = 1;
const XHS_AUTO_REPLY_SETTINGS_SCHEMA_VERSION = 1;
const MAX_NOTES_TO_SCAN = 20;
const MAX_AGENT_COMMENTS = 50;

interface QueueStore {
  schemaVersion: typeof XHS_AUTO_REPLY_QUEUE_SCHEMA_VERSION;
  items: XhsAutoReplyItem[];
}

interface SettingsStore {
  schemaVersion: typeof XHS_AUTO_REPLY_SETTINGS_SCHEMA_VERSION;
  locale?: XhsAutoReplyLocale;
  dryRun?: boolean;
  maxRepliesPerRun?: number;
  delaySeconds?: number;
  updatedAt?: string;
}

export interface UpdateXhsAutoReplySettingsInput {
  stylePrompt?: string;
  locale?: XhsAutoReplyLocale;
  dryRun?: boolean;
  maxRepliesPerRun?: number;
  delaySeconds?: number;
}

export interface UpdateXhsAutoReplyItemInput {
  status?: XhsAutoReplyItemStatus;
  replyContent?: string;
  decisionReason?: string;
}

interface CurrentXhsUser {
  id?: string;
  redId?: string;
  nickname?: string;
}

interface AutoReplyDecision {
  commentId: string;
  action: "reply" | "skip" | "needs-review";
  content?: string;
  reason?: string;
}

export function listXhsAutoReplies(config: AppConfig, profile: string): { settings: XhsAutoReplySettings; items: XhsAutoReplyItem[] } {
  assertProfileExists(config, profile);
  return {
    settings: readSettings(config, profile),
    items: sortItems(readQueueStore(config, profile).items)
  };
}

export function updateXhsAutoReplySettings(
  config: AppConfig,
  profile: string,
  input: UpdateXhsAutoReplySettingsInput
): XhsAutoReplySettings {
  assertProfileExists(config, profile);
  const current = readSettings(config, profile);
  const now = new Date().toISOString();
  const next: XhsAutoReplySettings = {
    stylePrompt: input.stylePrompt === undefined ? current.stylePrompt : cleanText(input.stylePrompt, 8000),
    locale: normalizeLocale(input.locale) ?? current.locale,
    dryRun: typeof input.dryRun === "boolean" ? input.dryRun : current.dryRun,
    maxRepliesPerRun: normalizeInteger(input.maxRepliesPerRun, current.maxRepliesPerRun, 1, 50),
    delaySeconds: normalizeInteger(input.delaySeconds, current.delaySeconds, 0, 120),
    updatedAt: now
  };
  writeSettings(config, profile, next);
  return next;
}

export function updateXhsAutoReplyItem(config: AppConfig, profile: string, id: string, input: UpdateXhsAutoReplyItemInput): XhsAutoReplyItem {
  assertProfileExists(config, profile);
  const store = readQueueStore(config, profile);
  const index = store.items.findIndex((item) => item.id === id);
  if (index < 0) throw new Error(`auto_reply_item_not_found:${id}`);
  const current = store.items[index];
  const updated: XhsAutoReplyItem = {
    ...current,
    status: normalizeItemStatus(input.status) ?? current.status,
    replyContent: input.replyContent === undefined ? current.replyContent : cleanOptionalText(input.replyContent, 1000),
    decisionReason: input.decisionReason === undefined ? current.decisionReason : cleanOptionalText(input.decisionReason, 1000),
    updatedAt: new Date().toISOString()
  };
  store.items[index] = updated;
  writeQueueStore(config, profile, store);
  return updated;
}

export async function syncXhsAutoReplyQueue(config: AppConfig, profile: string): Promise<XhsAutoReplySyncResult> {
  assertProfileExists(config, profile);
  const xhs = await commandExists("xhs");
  if (!xhs) throw new Error("xhs_cli_not_found");

  const syncedAt = new Date().toISOString();
  const errors: string[] = [];
  let posts = listXhsPublishedPosts(config, profile);
  try {
    posts = (await refreshXhsPublishedPostsFromCli(config, profile)).posts;
  } catch (error) {
    errors.push(`my-notes: ${error instanceof Error ? error.message : "sync_failed"}`);
  }

  const currentUser = await fetchCurrentXhsUser(xhs);
  const existingStore = readQueueStore(config, profile);
  const existingById = new Map(existingStore.items.map((item) => [item.id, item]));
  const nextById = new Map(existingById);
  const scanned = posts.filter((post) => post.status !== "archived").slice(0, MAX_NOTES_TO_SCAN);
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let alreadyReplied = 0;

  for (const post of scanned) {
    const commentsResult = await fetchCommentsForPost(xhs, post);
    if (!commentsResult.ok) {
      errors.push(`${post.id}: ${commentsResult.error}`);
      continue;
    }

    for (const comment of commentsResult.comments) {
      const normalized = normalizeCommentItem(profile, post, comment, syncedAt);
      if (!normalized) {
        skipped += 1;
        continue;
      }

      if (userMatchesCurrent(comment.user, currentUser)) {
        skipped += 1;
        continue;
      }

      const replied = await commentHasCurrentUserReply(xhs, post, normalized.commentId, normalized.subCommentCount ?? 0, currentUser);
      if (replied) alreadyReplied += 1;

      const existing = existingById.get(normalized.id);
      if (existing) {
        updated += 1;
        nextById.set(normalized.id, mergeSyncedItem(existing, normalized, replied, syncedAt));
      } else {
        imported += 1;
        nextById.set(normalized.id, {
          ...normalized,
          status: replied ? "already-replied" : "pending"
        });
      }
    }
  }

  const items = sortItems([...nextById.values()]);
  writeQueueStore(config, profile, { schemaVersion: XHS_AUTO_REPLY_QUEUE_SCHEMA_VERSION, items });
  return { syncedAt, imported, updated, skipped, alreadyReplied, items, errors };
}

export async function runXhsAutoReplyBatch(
  config: AppConfig,
  profile: string,
  agentId: string,
  options: { runId?: string; llm?: HermesLlmSelection } = {}
): Promise<XhsAutoReplyRunResult> {
  assertProfileExists(config, profile);
  const xhs = await commandExists("xhs");
  if (!xhs) throw new Error("xhs_cli_not_found");

  const settings = readSettings(config, profile);
  if (!settings.stylePrompt.trim()) throw new Error("reply_style_prompt_required");
  const runId = options.runId ?? `auto-reply-${randomUUID().slice(0, 8)}`;

  await syncXhsAutoReplyQueue(config, profile);
  const currentUser = await fetchCurrentXhsUser(xhs);
  if (!settings.dryRun && !currentUser.nickname && !currentUser.redId && !currentUser.id) {
    throw new Error("xhs_account_identity_required");
  }

  let store = readQueueStore(config, profile);
  const pending = sortItems(store.items)
    .filter((item) => item.status === "pending" || item.status === "failed")
    .slice(0, settings.maxRepliesPerRun);

  if (!pending.length) {
    return { runId, dryRun: settings.dryRun, scanned: 0, replied: 0, drafted: 0, skipped: 0, failed: 0, needsReview: 0, stopped: false, items: [] };
  }

  const decisions = await generateReplyDecisions(config, agentId, settings, pending, options.llm);
  const decisionsByCommentId = new Map(decisions.map((decision) => [decision.commentId, decision]));
  const handled: XhsAutoReplyItem[] = [];
  let replied = 0;
  let drafted = 0;
  let skipped = 0;
  let failed = 0;
  let needsReview = 0;
  let stopped = false;

  for (const item of pending) {
    const decision = decisionsByCommentId.get(item.commentId) ?? { commentId: item.commentId, action: "needs-review", reason: "agent_missing_decision" };
    const content = cleanOptionalText(decision.content, 1000);
    const reason = cleanOptionalText(decision.reason, 1000);
    let next: XhsAutoReplyItem;

    if (decision.action === "skip") {
      skipped += 1;
      next = patchItem(store, item.id, {
        status: "skipped",
        decisionReason: reason ?? "agent_skip",
        lastRunId: runId,
        updatedAt: new Date().toISOString()
      });
      appendActionLog(config, profile, { runId, item: next, action: "skip" });
    } else if (decision.action === "needs-review" || !content) {
      needsReview += 1;
      next = patchItem(store, item.id, {
        status: "needs-review",
        replyContent: content,
        decisionReason: reason ?? (content ? "agent_needs_review" : "empty_reply_content"),
        lastRunId: runId,
        updatedAt: new Date().toISOString()
      });
      appendActionLog(config, profile, { runId, item: next, action: "needs-review" });
    } else if (settings.dryRun) {
      drafted += 1;
      next = patchItem(store, item.id, {
        status: "drafted",
        replyContent: content,
        decisionReason: reason,
        lastRunId: runId,
        updatedAt: new Date().toISOString()
      });
      appendActionLog(config, profile, { runId, item: next, action: "draft" });
    } else {
      const result = await runCommand(
        xhs,
        ["reply", item.noteUrl || item.noteId, "--comment-id", item.commentId, "--content", content, "--json"],
        { timeoutMs: 90000 }
      );
      if (result.exitCode === 0) {
        replied += 1;
        next = patchItem(store, item.id, {
          status: "sent",
          replyContent: content,
          decisionReason: reason,
          error: undefined,
          lastRunId: runId,
          updatedAt: new Date().toISOString()
        });
        appendActionLog(config, profile, { runId, item: next, action: "reply", result: result.stdout || result.stderr });
        if (settings.delaySeconds > 0 && pending.indexOf(item) < pending.length - 1) {
          await sleep(settings.delaySeconds * 1000);
        }
      } else {
        failed += 1;
        stopped = true;
        next = patchItem(store, item.id, {
          status: "failed",
          replyContent: content,
          decisionReason: reason,
          error: redact(result.stderr || result.stdout || result.error || "xhs_reply_failed"),
          lastRunId: runId,
          updatedAt: new Date().toISOString()
        });
        appendActionLog(config, profile, { runId, item: next, action: "reply_failed", result: next.error });
      }
    }

    handled.push(next);
    store = writeAndReadQueueStore(config, profile, store);
    if (stopped) break;
  }

  return { runId, dryRun: settings.dryRun, scanned: pending.length, replied, drafted, skipped, failed, needsReview, stopped, items: handled };
}

async function generateReplyDecisions(
  config: AppConfig,
  agentId: string,
  settings: XhsAutoReplySettings,
  items: XhsAutoReplyItem[],
  llm?: HermesLlmSelection
): Promise<AutoReplyDecision[]> {
  const comments = items.slice(0, MAX_AGENT_COMMENTS).map((item) => ({
    commentId: item.commentId,
    noteId: item.noteId,
    noteTitle: item.noteTitle,
    author: item.commentAuthorName,
    content: item.commentContent
  }));
  const prompt = [
    "你是小红书账号运营 agent。根据用户给定的回复风格，为未回复评论做逐条决策。",
    "只返回 JSON，不要 markdown，不要解释。",
    "JSON shape: {\"decisions\":[{\"commentId\":\"...\",\"action\":\"reply|skip|needs-review\",\"content\":\"...\",\"reason\":\"...\"}]}",
    "规则：只回复真实、有上下文的评论；广告、辱骂、引战、隐私、医疗/法律/金融承诺、要求联系方式的评论必须 skip 或 needs-review；回复必须短、自然、像账号本人，不要暴露自动化。",
    `地区语言风格: ${localeInstruction(settings.locale)}`,
    "",
    `回复风格 prompt:\n${settings.stylePrompt}`,
    "",
    `评论队列:\n${JSON.stringify(comments, null, 2)}`
  ].join("\n");
  if (llm) {
    const output = await runHermesProviderPrompt(
      config,
      llm,
      [
        "Return only the requested JSON object. Do not run tools. Do not send Xiaohongshu replies.",
        "",
        prompt
      ].join("\n")
    );
    return normalizeDecisions(parseJsonFromText(output));
  }
  const run = await createHermesChatRun(config, {
    agentId,
    input: prompt,
    instructions: "Return only the requested JSON object. Do not run tools. Do not send Xiaohongshu replies.",
    model: "gpt-5.4",
    permissionMode: "read_only",
    reasoningEffort: "medium",
    sessionId: `auto-reply-${Date.now()}`
  });
  const status = await waitForHermesRun(config, run.runId);
  if (status.status !== "completed") throw new Error(`auto_reply_agent_failed:${status.status}`);
  const output = status.output?.trim();
  if (!output) throw new Error("auto_reply_agent_empty_output");
  return normalizeDecisions(parseJsonFromText(output));
}

async function waitForHermesRun(config: AppConfig, runId: string) {
  const started = Date.now();
  while (Date.now() - started < 10 * 60 * 1000) {
    const status = await getHermesRun(config, runId);
    if (["completed", "failed", "cancelled", "canceled"].includes(status.status)) return status;
    await sleep(2000);
  }
  throw new Error("auto_reply_agent_timeout");
}

async function fetchCurrentXhsUser(xhs: string): Promise<CurrentXhsUser> {
  const result = await runCommand(xhs, ["whoami", "--json"], { timeoutMs: 30000, redactOutput: false });
  if (result.exitCode !== 0) {
    throw new Error(redact(result.stderr || result.stdout || result.error || "xhs_whoami_failed"));
  }
  const data = objectValue(parseEnvelope(result.stdout, "xhs_whoami").data) ?? {};
  const user = objectValue(data.user) ?? data;
  return {
    id: firstString(user.user_id, user.userid, user.id),
    redId: firstString(user.red_id, user.redId, user.redid, user.username),
    nickname: firstString(user.nickname, user.name)
  };
}

async function fetchCommentsForPost(
  xhs: string,
  post: StoredXhsPublishedPost
): Promise<{ ok: true; comments: Array<Record<string, unknown>> } | { ok: false; error: string }> {
  const ref = post.url || post.id;
  if (!ref) return { ok: false, error: "missing_note_reference" };
  const args = ["comments", ref, "--all", "--json"];
  if (post.xsecToken) args.splice(2, 0, "--xsec-token", post.xsecToken);
  const result = await runCommand(xhs, args, { timeoutMs: 120000, redactOutput: false });
  if (result.exitCode !== 0) return { ok: false, error: redact(result.stderr || result.stdout || result.error || "xhs_comments_failed") };
  try {
    const data = parseEnvelope(result.stdout, "xhs_comments").data;
    return { ok: true, comments: extractComments(data) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "xhs_comments_parse_failed" };
  }
}

async function commentHasCurrentUserReply(
  xhs: string,
  post: XhsPublishedPost,
  commentId: string,
  subCommentCount: number,
  currentUser: CurrentXhsUser
): Promise<boolean> {
  if (subCommentCount < 1) return false;
  const result = await runCommand(xhs, ["sub-comments", post.id, commentId, "--json"], { timeoutMs: 90000, redactOutput: false });
  if (result.exitCode !== 0) return false;
  try {
    return extractComments(parseEnvelope(result.stdout, "xhs_sub_comments").data).some((comment) => userMatchesCurrent(comment.user, currentUser));
  } catch {
    return false;
  }
}

function normalizeCommentItem(
  profile: string,
  post: XhsPublishedPost,
  comment: Record<string, unknown>,
  now: string
): XhsAutoReplyItem | undefined {
  const user = objectValue(comment.user_info) ?? objectValue(comment.user) ?? objectValue(comment.author) ?? {};
  const commentId = firstString(comment.id, comment.comment_id, comment.commentId, comment.oid);
  const content = cleanOptionalText(firstString(comment.content, comment.text, deepString(comment, "comment", "content")), 1000);
  if (!commentId || !content) return undefined;
  return {
    id: stableHash(post.id, commentId),
    platform: XIAOHONGSHU_PLATFORM,
    profile,
    noteId: post.id,
    noteUrl: post.url,
    noteTitle: post.title,
    commentId,
    commentAuthorId: firstString(user.user_id, user.userid, user.id),
    commentAuthorName: firstString(user.nickname, user.name),
    commentContent: content,
    commentCreatedAt: normalizeDate(firstValue(comment.time, comment.create_time, comment.created_at)),
    subCommentCount: numberValue(firstValue(comment.sub_comment_count, comment.sub_comment_cnt, comment.subCommentsCount)),
    source: "comments",
    status: "pending",
    createdAt: now,
    updatedAt: now
  };
}

function mergeSyncedItem(existing: XhsAutoReplyItem, synced: XhsAutoReplyItem, alreadyReplied: boolean, now: string): XhsAutoReplyItem {
  const terminal = new Set<XhsAutoReplyItemStatus>(["sent", "skipped", "drafted", "needs-review"]);
  return {
    ...existing,
    ...synced,
    status: terminal.has(existing.status) ? existing.status : alreadyReplied ? "already-replied" : existing.status === "failed" ? "failed" : "pending",
    replyContent: existing.replyContent,
    decisionReason: existing.decisionReason,
    error: existing.error,
    lastRunId: existing.lastRunId,
    createdAt: existing.createdAt,
    updatedAt: now
  };
}

function patchItem(store: QueueStore, id: string, patch: Partial<XhsAutoReplyItem>): XhsAutoReplyItem {
  const index = store.items.findIndex((item) => item.id === id);
  if (index < 0) throw new Error(`auto_reply_item_not_found:${id}`);
  const updated = { ...store.items[index], ...patch };
  store.items[index] = updated;
  return updated;
}

function readSettings(config: AppConfig, profile: string): XhsAutoReplySettings {
  const stylePrompt = existsSync(stylePath(config, profile)) ? readFileSync(stylePath(config, profile), "utf8").trim() : "";
  if (!existsSync(settingsPath(config, profile))) {
    return { stylePrompt, locale: "zh-CN", dryRun: true, maxRepliesPerRun: 10, delaySeconds: 12 };
  }
  const payload = JSON.parse(readFileSync(settingsPath(config, profile), "utf8")) as SettingsStore;
  return {
    stylePrompt,
    locale: normalizeLocale(payload.locale) ?? "zh-CN",
    dryRun: payload.dryRun ?? true,
    maxRepliesPerRun: normalizeInteger(payload.maxRepliesPerRun, 10, 1, 50),
    delaySeconds: normalizeInteger(payload.delaySeconds, 12, 0, 120),
    updatedAt: payload.updatedAt
  };
}

function writeSettings(config: AppConfig, profile: string, settings: XhsAutoReplySettings): void {
  const root = assertProfileExists(config, profile);
  writeFileSync(stylePath(config, profile), settings.stylePrompt.trim() ? `${settings.stylePrompt.trim()}\n` : "", { mode: 0o600 });
  writeAtomic(settingsPath(config, profile), {
    schemaVersion: XHS_AUTO_REPLY_SETTINGS_SCHEMA_VERSION,
    locale: settings.locale,
    dryRun: settings.dryRun,
    maxRepliesPerRun: settings.maxRepliesPerRun,
    delaySeconds: settings.delaySeconds,
    updatedAt: settings.updatedAt
  });
  mkdirSync(root, { recursive: true, mode: 0o700 });
}

function readQueueStore(config: AppConfig, profile: string): QueueStore {
  assertProfileExists(config, profile);
  const path = queuePath(config, profile);
  if (!existsSync(path)) return { schemaVersion: XHS_AUTO_REPLY_QUEUE_SCHEMA_VERSION, items: [] };
  const payload = JSON.parse(readFileSync(path, "utf8")) as QueueStore;
  return { schemaVersion: XHS_AUTO_REPLY_QUEUE_SCHEMA_VERSION, items: (payload.items ?? []).map(normalizeStoredItem) };
}

function writeQueueStore(config: AppConfig, profile: string, store: QueueStore): void {
  assertProfileExists(config, profile);
  writeAtomic(queuePath(config, profile), { schemaVersion: XHS_AUTO_REPLY_QUEUE_SCHEMA_VERSION, items: sortItems(store.items) });
}

function writeAndReadQueueStore(config: AppConfig, profile: string, store: QueueStore): QueueStore {
  writeQueueStore(config, profile, store);
  return readQueueStore(config, profile);
}

function appendActionLog(
  config: AppConfig,
  profile: string,
  entry: { runId: string; item: XhsAutoReplyItem; action: string; result?: string }
): void {
  const payload = {
    at: new Date().toISOString(),
    type: "auto-reply",
    runId: entry.runId,
    action: entry.action,
    noteId: entry.item.noteId,
    commentId: entry.item.commentId,
    itemId: entry.item.id,
    status: entry.item.status,
    replyContent: entry.item.replyContent,
    decisionReason: entry.item.decisionReason,
    result: entry.result
  };
  appendFileSync(join(xhsActionLogRoot(config, profile), "xhs-action-log.md"), `${JSON.stringify(payload)}\n`, { mode: 0o600 });
}

function assertProfileExists(config: AppConfig, profile: string): string {
  assertSafeSegment(profile, "profile");
  const root = profileRoot(config, XIAOHONGSHU_PLATFORM, profile);
  if (!safeStat(root)?.isDirectory()) throw new Error(`profile_not_found:${XIAOHONGSHU_PLATFORM}/${profile}`);
  return root;
}

function xhsActionLogRoot(config: AppConfig, profile: string): string {
  const profilePath = assertProfileExists(config, profile);
  const documentRoot = xhsDocumentRoot(config, profile);
  return safeStat(documentRoot)?.isDirectory() ? documentRoot : profilePath;
}

function queuePath(config: AppConfig, profile: string): string {
  return join(profileRoot(config, XIAOHONGSHU_PLATFORM, profile), "xhs-reply-queue.json");
}

function settingsPath(config: AppConfig, profile: string): string {
  return join(profileRoot(config, XIAOHONGSHU_PLATFORM, profile), "xhs-reply-settings.json");
}

function stylePath(config: AppConfig, profile: string): string {
  return join(profileRoot(config, XIAOHONGSHU_PLATFORM, profile), "xhs-reply-style.md");
}

function writeAtomic(path: string, payload: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(payload, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, path);
}

function parseEnvelope(stdout: string, label: string): { ok?: boolean; data?: unknown; error?: { code?: string; message?: string } } {
  const envelope = JSON.parse(stdout) as { ok?: boolean; data?: unknown; error?: { code?: string; message?: string } };
  if (envelope.ok === false) throw new Error(envelope.error?.message || envelope.error?.code || `${label}_failed`);
  return envelope;
}

function parseJsonFromText(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(value);
    if (fenced) return JSON.parse(fenced[1]);
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(value.slice(start, end + 1));
    throw new Error("auto_reply_agent_non_json");
  }
}

function normalizeDecisions(value: unknown): AutoReplyDecision[] {
  const root = objectValue(value);
  const raw = Array.isArray(value) ? value : Array.isArray(root?.decisions) ? root.decisions : [];
  return raw
    .map((item) => objectValue(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      commentId: firstString(item.commentId, item.comment_id) ?? "",
      action: normalizeDecisionAction(item.action),
      content: cleanOptionalText(firstString(item.content, item.reply, item.replyContent), 1000),
      reason: cleanOptionalText(firstString(item.reason, item.decisionReason), 1000)
    }))
    .filter((item) => item.commentId);
}

function normalizeDecisionAction(value: unknown): AutoReplyDecision["action"] {
  if (value === "reply" || value === "skip" || value === "needs-review") return value;
  return "needs-review";
}

function normalizeStoredItem(item: XhsAutoReplyItem): XhsAutoReplyItem {
  return {
    ...item,
    platform: XIAOHONGSHU_PLATFORM,
    status: normalizeItemStatus(item.status) ?? "pending",
    source: item.source ?? "comments",
    updatedAt: item.updatedAt ?? new Date().toISOString(),
    createdAt: item.createdAt ?? item.updatedAt ?? new Date().toISOString()
  };
}

function normalizeItemStatus(value: unknown): XhsAutoReplyItemStatus | undefined {
  if (
    value === "pending" ||
    value === "drafted" ||
    value === "sent" ||
    value === "skipped" ||
    value === "needs-review" ||
    value === "failed" ||
    value === "already-replied"
  ) {
    return value;
  }
  return undefined;
}

function normalizeLocale(value: unknown): XhsAutoReplyLocale | undefined {
  if (value === "zh-CN" || value === "zh-HK" || value === "zh-TW" || value === "en" || value === "zh-SG-MY") return value;
  return undefined;
}

function localeInstruction(locale: XhsAutoReplyLocale): string {
  if (locale === "zh-HK") return "香港繁中。使用香港常见繁体表达和口吻，避免大陆简体词汇，语气自然克制。";
  if (locale === "zh-TW") return "台湾繁中。使用台湾常见繁体表达和词汇，避免大陆简体词汇，语气亲切自然。";
  if (locale === "en") return "英语。用自然、简洁的 English reply，不夹中文，除非评论本身需要保留专名。";
  if (locale === "zh-SG-MY") return "新马简中。使用新加坡/马来西亚华语常见简中表达，语气轻松自然，避免过强大陆营销腔。";
  return "中国简中。使用大陆简体中文表达，语气自然，避免过度营销和夸张承诺。";
}

function extractComments(value: unknown): Array<Record<string, unknown>> {
  const data = objectValue(value);
  if (!data) return [];
  const candidates = firstValue(data.comments, data.comment_list, data.items, deepValue(data, "data", "comments"), deepValue(data, "data", "items"));
  if (!Array.isArray(candidates)) return [];
  return candidates.filter((item): item is Record<string, unknown> => Boolean(objectValue(item)));
}

function userMatchesCurrent(value: unknown, currentUser: CurrentXhsUser): boolean {
  const user = objectValue(value) ?? {};
  const id = firstString(user.user_id, user.userid, user.id);
  const redId = firstString(user.red_id, user.redId, user.redid, user.username);
  const nickname = firstString(user.nickname, user.name);
  return Boolean(
    (id && currentUser.id && id === currentUser.id) ||
      (redId && currentUser.redId && redId === currentUser.redId) ||
      (nickname && currentUser.nickname && nickname === currentUser.nickname)
  );
}

function sortItems(items: XhsAutoReplyItem[]): XhsAutoReplyItem[] {
  return [...items].sort((a, b) => {
    const statusRank = statusOrder(a.status) - statusOrder(b.status);
    if (statusRank !== 0) return statusRank;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

function statusOrder(status: XhsAutoReplyItemStatus): number {
  if (status === "pending" || status === "failed") return 0;
  if (status === "needs-review" || status === "drafted") return 1;
  if (status === "sent") return 2;
  return 3;
}

function normalizeInteger(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : fallback;
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.trunc(number), min), max);
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanOptionalText(value: unknown, maxLength: number): string | undefined {
  const text = cleanText(value, maxLength);
  return text || undefined;
}

function stableHash(...values: string[]): string {
  return createHash("sha1").update(values.join("\0")).digest("hex").slice(0, 16);
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function firstValue(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function deepValue(value: unknown, ...path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    const object = objectValue(current);
    if (!object) return undefined;
    current = object[key];
  }
  return current;
}

function deepString(value: unknown, ...path: string[]): string | undefined {
  return firstString(deepValue(value, ...path));
}

function normalizeDate(value: unknown): string | undefined {
  const raw = firstString(value);
  if (!raw) return undefined;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) {
    const ms = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    return new Date(ms).toISOString();
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}
