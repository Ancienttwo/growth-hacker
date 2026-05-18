export const WORKSPACE_SCHEMA_VERSION = 1;
export const DEFAULT_GROWTH_AGENT = "growth-agent";
export const XIAOHONGSHU_PLATFORM = "xiaohongshu";
export const VAULT_WORKSPACE_PLATFORM = "vault";
export const VAULT_WORKSPACE_PROFILE = "vault";

export type RuntimeKind = "hermes" | "openclaw";
export type RuntimeState = "available" | "missing" | "degraded";
export type PlatformId = typeof XIAOHONGSHU_PLATFORM | "youtube" | "facebook" | "x" | "instagram";

export const WORKSPACE_PLATFORMS: PlatformId[] = [XIAOHONGSHU_PLATFORM, "x", "facebook", "youtube"];

export interface RuntimeStatus {
  kind: RuntimeKind;
  state: RuntimeState;
  command?: string;
  version?: string;
  profileExists?: boolean;
  skillInstalled?: boolean;
  raw?: string;
  guidance?: string;
}

export interface GrowthWorkspaceManifest {
  schemaVersion: typeof WORKSPACE_SCHEMA_VERSION;
  growthRoot: string;
  knownPlatforms: string[];
  migrations: Array<{
    id: string;
    status: "planned" | "completed" | "conflict" | "partial";
    createdAt: string;
    source?: string;
    target?: string;
  }>;
}

export interface WorkspaceProfile {
  platform: string;
  profile: string;
  path: string;
  updatedAt?: string;
  artifactCount: number;
}

export interface ArtifactInfo {
  platform: string;
  profile: string;
  path: string;
  name: string;
  kind: "file" | "directory";
  mime: "markdown" | "csv" | "json" | "image" | "video" | "text" | "directory";
  size: number;
  updatedAt?: string;
}

export interface ArtifactContent {
  artifact: ArtifactInfo;
  content?: string;
  binary?: boolean;
}

export interface MigrationFilePlan {
  relativePath: string;
  source: string;
  target: string;
  action: "copy" | "skip" | "conflict";
  reason: string;
  sourceSize: number;
  targetSize?: number;
  sourceMtimeMs: number;
  targetMtimeMs?: number;
}

export interface MigrationProfilePlan {
  platform: typeof XIAOHONGSHU_PLATFORM;
  profile: string;
  source: string;
  target: string;
  status: "ready" | "conflict" | "empty";
  files: MigrationFilePlan[];
}

export interface MigrationPlan {
  id: "xiaohongshu-legacy";
  sourceRoot: string;
  targetRoot: string;
  profiles: MigrationProfilePlan[];
  conflictCount: number;
  copyCount: number;
}

export interface XhsAuthStatus {
  installed: boolean;
  authenticated: boolean;
  scope?: "global";
  state?: "signed-in" | "guest" | "missing" | "invalid" | "unavailable";
  guest?: boolean;
  nickname?: string;
  redId?: string;
  errorCode?: string;
  message?: string;
}

export interface JobSnapshot {
  id: string;
  type: string;
  status: "queued" | "running" | "succeeded" | "failed";
  command: string[];
  startedAt: string;
  finishedAt?: string;
  exitCode?: number | null;
  logs: string[];
}

export type AgentRunnerKind = RuntimeKind | "local";
export type SocialCronTaskType = "workspace-diagnosis" | "daily-ops-refresh" | "health-report" | "auto-reply" | "topic-harvest";
export type SocialCronSource = "growth" | "hermes";
export type SocialBoardTaskStatus = "todo" | "ready" | "running" | "blocked" | "done" | "failed" | "archived";
export type XhsPublishedPostStatus = "published" | "monitoring" | "needs-review" | "archived";
export type XhsAutoReplyItemStatus = "pending" | "drafted" | "sent" | "skipped" | "needs-review" | "failed" | "already-replied";
export type XhsAutoReplyLocale = "zh-CN" | "zh-HK" | "zh-TW" | "en" | "zh-SG-MY";
export type SocialPlatformCliState = "available" | "missing" | "not-configured" | "degraded";

export interface SocialPlatformCapabilities {
  workspace: boolean;
  publishedPosts: boolean;
  comments: boolean;
  autoReplies: boolean;
  scheduledTasks: SocialCronTaskType[];
}

export interface SocialPlatformCliStatus {
  command?: string;
  path?: string;
  state: SocialPlatformCliState;
  authenticated?: boolean;
  authState?: string;
  message?: string;
}

export interface SocialPlatformInfo {
  id: PlatformId;
  label: string;
  shortLabel: string;
  cli: SocialPlatformCliStatus;
  capabilities: SocialPlatformCapabilities;
}

export interface XhsPublishedPostStats {
  views?: number;
  likes?: number;
  collects?: number;
  comments?: number;
  shares?: number;
}

export interface XhsPublishedPost {
  id: string;
  platform: typeof XIAOHONGSHU_PLATFORM;
  profile: string;
  title: string;
  description?: string;
  authorName?: string;
  authorAvatarUrl?: string;
  coverUrl?: string;
  url?: string;
  contentType: "image" | "video" | "text" | "unknown";
  publishedAt?: string;
  syncedAt?: string;
  updatedAt: string;
  keyword?: string;
  status: XhsPublishedPostStatus;
  statusNote?: string;
  source: "xhs-cli" | "metrics" | "manual";
  stats: XhsPublishedPostStats;
}

export interface XhsAutoReplySettings {
  stylePrompt: string;
  locale: XhsAutoReplyLocale;
  dryRun: boolean;
  maxRepliesPerRun: number;
  delaySeconds: number;
  updatedAt?: string;
}

export interface XhsAutoReplyItem {
  id: string;
  platform: typeof XIAOHONGSHU_PLATFORM;
  profile: string;
  noteId: string;
  noteUrl?: string;
  noteTitle?: string;
  commentId: string;
  commentAuthorId?: string;
  commentAuthorName?: string;
  commentContent: string;
  commentCreatedAt?: string;
  subCommentCount?: number;
  source: "comments" | "notifications";
  status: XhsAutoReplyItemStatus;
  replyContent?: string;
  decisionReason?: string;
  error?: string;
  lastRunId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface XhsAutoReplySyncResult {
  syncedAt: string;
  imported: number;
  updated: number;
  skipped: number;
  alreadyReplied: number;
  items: XhsAutoReplyItem[];
  errors: string[];
}

export interface XhsAutoReplyRunResult {
  runId: string;
  dryRun: boolean;
  scanned: number;
  replied: number;
  drafted: number;
  skipped: number;
  failed: number;
  needsReview: number;
  stopped: boolean;
  items: XhsAutoReplyItem[];
}

export interface SocialAgent {
  id: string;
  runner: AgentRunnerKind;
}

export interface DashboardChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  agentId?: string;
  parentSessionId?: string;
  hermesSessionId?: string;
  handoffSummary?: string;
  events: Record<string, unknown>[];
}

export interface DashboardChatSessionState {
  sessions: DashboardChatSession[];
  activeId?: string;
}

export interface HermesLlmSelection {
  provider: string;
  model: string;
}

export interface HermesModelOption {
  id: string;
  provider: string;
  label: string;
  value: string;
}

export interface HermesProviderOption {
  id: string;
  name: string;
  current: boolean;
  source?: string;
  totalModels: number;
  models: HermesModelOption[];
}

export interface HermesModelOptions {
  providers: HermesProviderOption[];
  models: HermesModelOption[];
  current?: HermesLlmSelection;
}

export interface HermesContextTokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning: number;
}

export interface HermesSessionSummary {
  id: string;
  source: string;
  model?: string;
  title?: string;
  userId?: string;
  parentSessionId?: string;
  startedAt?: string;
  endedAt?: string;
  endReason?: string;
  messageCount: number;
  toolCallCount: number;
  apiCallCount: number;
  tokens: HermesContextTokenUsage;
}

export interface HermesToolCallSummary {
  id?: string;
  name: string;
  argumentsPreview?: string;
}

export interface HermesMessageSummary {
  id: number;
  sessionId: string;
  role: string;
  contentPreview?: string;
  toolCallId?: string;
  toolName?: string;
  toolCalls: HermesToolCallSummary[];
  timestamp?: string;
  tokenCount?: number;
  finishReason?: string;
}

export type HermesGatewayEventKind = "inbound" | "response" | "compression" | "provider" | "lifecycle" | "log";

export interface HermesGatewayEvent {
  id: string;
  kind: HermesGatewayEventKind;
  level: string;
  timestamp?: string;
  logger?: string;
  context?: string;
  message: string;
  platform?: string;
  chat?: string;
  user?: string;
  fromSessionId?: string;
  toSessionId?: string;
  durationSeconds?: number;
  apiCalls?: number;
  responseChars?: number;
}

export interface HermesContextSnapshot {
  generatedAt: string;
  sourcePaths: {
    stateDb: string;
    gatewayLog: string;
  };
  available: {
    stateDb: boolean;
    gatewayLog: boolean;
  };
  query?: string;
  selectedSessionId?: string;
  sessions: HermesSessionSummary[];
  messages: HermesMessageSummary[];
  gatewayEvents: HermesGatewayEvent[];
}

export interface HermesSkillInfo {
  name: string;
  category: string;
  description: string;
  path: string;
  enabled: boolean;
  status: "enabled" | "disabled";
}

export interface SocialBoardTask {
  id: string;
  boardId: "social-media";
  agentId: string;
  runner: AgentRunnerKind;
  cronSource?: SocialCronSource;
  readOnly?: boolean;
  sourceOutputPath?: string;
  sourceMtimeMs?: number;
  hermesSessionId?: string;
  hermesSessionPath?: string;
  syncedAt?: string;
  llm?: HermesLlmSelection;
  platform: string;
  profile: string;
  taskType: SocialCronTaskType;
  title: string;
  status: SocialBoardTaskStatus;
  source: "manual" | "cron";
  sourceId?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  lastJobId?: string;
  result?: string;
  error?: string;
}

export interface SocialTaskCalendarItem {
  id: string;
  source: "cron" | "board";
  cronSource?: SocialCronSource;
  readOnly?: boolean;
  title: string;
  startsAt: string;
  agentId: string;
  runner: AgentRunnerKind;
  llm?: HermesLlmSelection;
  platform: string;
  profile: string;
  taskType: SocialCronTaskType;
  status: SocialBoardTaskStatus | "scheduled" | "paused" | "running" | "failed";
}

export interface SocialCronSchedule {
  kind: "interval" | "daily";
  value: string;
  display: string;
  minutes?: number;
  time?: string;
}

export interface SocialCronJob {
  id: string;
  source?: SocialCronSource;
  readOnly?: boolean;
  agentId: string;
  llm?: HermesLlmSelection;
  platform: string;
  profile: string;
  name: string;
  taskType: SocialCronTaskType;
  schedule: SocialCronSchedule;
  enabled: boolean;
  state: "scheduled" | "paused" | "running" | "failed";
  createdAt: string;
  updatedAt: string;
  nextRunAt?: string;
  lastRunAt?: string;
  lastStatus?: "succeeded" | "failed";
  lastJobId?: string;
  lastError?: string;
  runCount: number;
}

export function mimeFromPath(path: string): ArtifactInfo["mime"] {
  const lower = path.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".json")) return "json";
  if (/\.(png|jpg|jpeg|gif|webp)$/.test(lower)) return "image";
  if (/\.(mp4|mov|m4v|webm)$/.test(lower)) return "video";
  return "text";
}
