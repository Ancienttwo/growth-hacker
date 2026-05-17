export const WORKSPACE_SCHEMA_VERSION = 1;
export const DEFAULT_GROWTH_AGENT = "growth-agent";
export const XIAOHONGSHU_PLATFORM = "xiaohongshu";

export type RuntimeKind = "hermes" | "openclaw";
export type RuntimeState = "available" | "missing" | "degraded";
export type PlatformId = typeof XIAOHONGSHU_PLATFORM | "youtube" | "facebook" | "x" | "instagram";

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
export type SocialCronTaskType = "workspace-diagnosis" | "daily-ops-refresh" | "health-report";
export type SocialBoardTaskStatus = "todo" | "ready" | "running" | "blocked" | "done" | "failed" | "archived";
export type XhsPublishedPostStatus = "published" | "monitoring" | "needs-review" | "archived";

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

export interface SocialAgent {
  id: string;
  runner: AgentRunnerKind;
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
  title: string;
  startsAt: string;
  agentId: string;
  runner: AgentRunnerKind;
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
  agentId: string;
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
