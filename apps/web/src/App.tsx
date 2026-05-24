import {
  Activity,
  Archive,
  Bookmark,
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Folder,
  Gauge,
  Heart,
  Image as ImageIcon,
  KeyRound,
  Languages,
  LayoutDashboard,
  Loader2,
  MessageSquare,
  Mic,
  Play,
  Plus,
  RefreshCcw,
  Reply,
  Search,
  Send,
  ShieldCheck,
  Share2,
  SlidersHorizontal,
  Square,
  Terminal,
  Trash2,
  UserPlus,
  Video,
  X,
  Zap
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import type {
  ArtifactContent,
  ArtifactInfo,
  HermesContextSnapshot,
  HermesGatewayEvent,
  HermesLlmSelection,
  HermesModelOptions,
  HermesModelOption,
  HermesMessageSummary,
  HermesSessionSummary,
  HermesSkillInfo,
  JobSnapshot,
  MigrationPlan,
  PlatformId,
  RuntimeStatus,
  SocialAgent,
  SocialBoardTask,
  SocialBoardTaskStatus,
  SocialCronJob,
  SocialCronTaskType,
  SocialPlatformInfo,
  SocialTaskCalendarItem,
  WorkspaceProfile,
  XhsAutoReplyItem,
  XhsAutoReplyItemStatus,
  XhsAutoReplyLocale,
  XhsAutoReplySettings,
  XhsPublishedPost,
  XhsPublishedPostStatus,
  XhsAuthStatus
} from "@growth-hacker/core";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  buildHermesChatInputFromTranscript,
  isImageChatAttachmentFile,
  isSupportedChatAttachmentFile,
  shouldSendChatOnKeyDown
} from "@/chatInput";
import { resolveChatMarkdownImageUrl } from "@/chatMarkdown";
import { findRunMissingTerminalEvent, hasTerminalEventForRun, isStatusPollTimeoutEvent, isTerminalRunEvent } from "@/chatRunStatus";
import { buildSkillInstructions, resolveAutomaticSkillHints } from "@/chatSkillInstructions";
import { toolTranscriptSummary } from "@/chatToolSummary";
import { appendVisualAssetContext, buildVisualAssetInstructions, resolveReusableVisualAssets } from "@/chatVisualAssets";
import { buildVaultAttachmentContent, buildVaultWorkspaceChatMessage } from "@/chatVaultPrompt";
import { buildCalendarWeekItems } from "@/calendarWeekItems";
import { intlLocale, languageLabel, speechLocale, useI18n, type I18nKey, type I18nLocale, type TFunction } from "@/i18n";
import { cn } from "@/lib/utils";
import {
  fallbackSocialPlatforms,
  isSameWorkspace,
  normalizePlatformMode,
  platformLogoSrc,
  platformModeStorageKey,
  resolveDashboardViewForPlatform,
  selectProfileForPlatform,
  sharedDashboardViews,
  socialPlatformInfo,
  visibleDashboardViews
} from "@/platformNavigation";
import type { DashboardView } from "@/platformNavigation";
import { shouldShowSocialBoardTask } from "@/socialBoardFilters";

interface WorkspacesResponse {
  profiles: WorkspaceProfile[];
}

interface RuntimeResponse {
  runtimes: RuntimeStatus[];
}

interface SocialPlatformsResponse {
  platforms: SocialPlatformInfo[];
}

interface SocialCronResponse {
  jobs: SocialCronJob[];
  agents: string[];
  socialAgents?: SocialAgent[];
  taskTypes: SocialCronTaskType[];
}

interface SocialBoardResponse {
  tasks: SocialBoardTask[];
  agents: SocialAgent[];
  taskTypes: SocialCronTaskType[];
}

interface SocialCalendarResponse {
  items: SocialTaskCalendarItem[];
}

interface XhsPublishedPostsResponse {
  posts: XhsPublishedPost[];
}

interface XhsPublishedPostsSyncResponse {
  source: "xhs-cli";
  syncedAt: string;
  imported: number;
  updated: number;
  archived: number;
  skipped: number;
  posts: XhsPublishedPost[];
}

interface XhsPublishedPostUpdateResponse {
  post: XhsPublishedPost;
}

interface XhsAutoRepliesResponse {
  settings: XhsAutoReplySettings;
  items: XhsAutoReplyItem[];
}

interface XhsAutoReplySettingsResponse {
  settings: XhsAutoReplySettings;
}

interface XhsAutoReplyItemUpdateResponse {
  item: XhsAutoReplyItem;
}

interface XhsAutoReplySyncResponse {
  syncedAt: string;
  imported: number;
  updated: number;
  skipped: number;
  alreadyReplied: number;
  items: XhsAutoReplyItem[];
  errors: string[];
}

interface HermesSkillsResponse {
  skills: HermesSkillInfo[];
}

interface HermesSkillUpdateResponse {
  skill: HermesSkillInfo;
}

type HermesContextResponse = HermesContextSnapshot;

interface HermesChatStatus {
  available: boolean;
  baseUrl: string;
  error?: string;
  authRequired?: boolean;
  health?: {
    gateway_state?: string;
    active_agents?: number;
    platforms?: Record<string, { state?: string }>;
  };
  capabilities?: {
    model?: string;
    features?: Record<string, unknown>;
  };
}

interface HermesVideoAuthStatus {
  installed: boolean;
  configured: boolean;
  authenticated: boolean;
  pluginEnabled: boolean;
  apiServerToolEnabled: boolean;
  provider?: string;
  model?: string;
  command?: string;
  message?: string;
}

interface HermesChatRunResponse {
  runId: string;
  status: string;
  sessionId: string;
  hermesSessionId: string;
}

interface HermesChatRunStatus {
  runId: string;
  status: string;
  sessionId?: string;
  model?: string;
  lastEvent?: string;
  output?: string;
  error?: unknown;
  usage?: Record<string, number>;
  updatedAt?: number;
  createdAt?: number;
}

interface ChatSessionsResponse {
  sessions: ChatSession[];
  activeId?: string;
}

interface ChatSessionResponse {
  session: ChatSession;
}

interface PersistHermesRunArtifactsResponse {
  artifacts: Array<{
    path: string;
    size: number;
    contentType: string;
  }>;
}

interface WorkspaceProfileResponse {
  profile: WorkspaceProfile;
}

interface YoutubeVideoDraft {
  title: string;
  prompt: string;
  aspectRatio: "16:9" | "9:16" | "1:1";
  duration: number;
  resolution: "720p" | "1080p";
  imageUrl: string;
}

interface HermesChatRunOptions {
  agentId: string;
  hermesSessionId?: string;
  instructions?: string;
  model: string;
  provider: string;
  permissionMode: ChatPermissionMode;
  reasoningEffort: ChatReasoningEffort;
}

interface HermesChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface HermesChatEvent {
  event: string;
  type?: string;
  run_id?: string;
  timestamp?: number;
  delta?: string;
  output?: string;
  tool?: string;
  name?: string;
  preview?: string;
  label?: string;
  status?: string;
  toolCallId?: string;
  call_id?: string;
  args?: unknown;
  arguments?: unknown;
  item?: {
    type?: string;
    status?: string;
    name?: string;
    call_id?: string;
    arguments?: unknown;
    output?: unknown;
  };
  duration?: number;
  error?: unknown;
  usage?: Record<string, number>;
  choices?: string[];
  choice?: string;
  command?: string;
  message?: string;
  agentId?: string;
  agentMessage?: string;
  model?: string;
  provider?: string;
  permissionMode?: string;
  reasoningEffort?: string;
  sessionId?: string;
  hermesSessionId?: string;
}

type ChatPermissionMode = "full_access" | "ask" | "read_only";
type ChatReasoningEffort = "low" | "medium" | "high" | "xhigh";
type ChatComposerMode = "image" | null;

interface ChatAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  content: string;
  kind?: "text" | "image";
  path?: string;
  absolutePath?: string;
  previewUrl?: string;
}

interface ChatAttachmentUploadResponse {
  attachment: {
    artifact: ArtifactInfo;
    absolutePath: string;
  };
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  agentId?: string;
  parentSessionId?: string;
  hermesSessionId?: string;
  handoffSummary?: string;
  events: HermesChatEvent[];
}

interface ChatSessionState {
  sessions: ChatSession[];
  activeId: string;
}

interface QueuedChatSteer {
  id: string;
  sessionId: string;
  visibleUserMessage: string;
  outgoingMessage: string;
  agentId: string;
  instructions?: string;
  model: string;
  provider: string;
  permissionMode: ChatPermissionMode;
  reasoningEffort: ChatReasoningEffort;
  runProfile: WorkspaceProfile | null;
}

type ChatEventsUpdate = HermesChatEvent[] | ((current: HermesChatEvent[]) => HermesChatEvent[]);

const platformLabel: Record<string, string> = {
  xiaohongshu: "Xiaohongshu",
  youtube: "YouTube",
  facebook: "Facebook",
  x: "X",
  instagram: "Instagram"
};

const socialCronTaskLabelKey: Record<SocialCronTaskType, I18nKey> = {
  "workspace-diagnosis": "socialCron.workspaceDiagnosis",
  "daily-ops-refresh": "socialCron.dailyOpsRefresh",
  "health-report": "socialCron.healthReport",
  "auto-reply": "socialCron.autoReply",
  "topic-harvest": "socialCron.topicHarvest"
};

const publishedPostStatusLabelKey: Record<XhsPublishedPostStatus, I18nKey> = {
  published: "publishedStatus.published",
  monitoring: "publishedStatus.monitoring",
  "needs-review": "publishedStatus.needsReview",
  archived: "publishedStatus.archived"
};

const publishedPostStatusOptions: Array<XhsPublishedPostStatus | "all"> = ["all", "published", "monitoring", "needs-review", "archived"];
const autoReplyStatusLabelKey: Record<XhsAutoReplyItemStatus, I18nKey> = {
  pending: "autoReply.status.pending",
  drafted: "autoReply.status.drafted",
  sent: "autoReply.status.sent",
  skipped: "autoReply.status.skipped",
  "needs-review": "autoReply.status.needsReview",
  failed: "autoReply.status.failed",
  "already-replied": "autoReply.status.alreadyReplied"
};
const autoReplyLocaleLabelKey: Record<XhsAutoReplyLocale, I18nKey> = {
  "zh-CN": "autoReply.locale.zhCN",
  "zh-HK": "autoReply.locale.zhHK",
  "zh-TW": "autoReply.locale.zhTW",
  en: "autoReply.locale.en",
  "zh-SG-MY": "autoReply.locale.zhSGMY"
};
const autoReplyLocaleOptions = Object.keys(autoReplyLocaleLabelKey) as XhsAutoReplyLocale[];
const autoReplyStylePresets: Array<{ id: string; labelKey: I18nKey; descriptionKey: I18nKey; prompt: string }> = [
  {
    id: "girlfriend-seeding",
    labelKey: "autoReply.preset.girlfriend.label",
    descriptionKey: "autoReply.preset.girlfriend.description",
    prompt: [
      "闺蜜安利风：像朋友在评论区自然接话，热情但不硬卖。",
      "回复 15-35 字，短句，最多 1 个 emoji。",
      "先回应对方问题，再给一个轻量建议或真实感受。",
      "可少量使用“姐妹/宝宝/家人们”，不要每条都用。",
      "不承诺效果，不引导私信，不留联系方式。"
    ].join("\n")
  },
  {
    id: "tutorial-helper",
    labelKey: "autoReply.preset.tutorial.label",
    descriptionKey: "autoReply.preset.tutorial.description",
    prompt: [
      "干货答疑风：像作者在认真补充说明，直接解决评论里的问题。",
      "回复 20-50 字，优先给步骤、条件或判断标准。",
      "可以用“先看这点/重点是/建议先...”这种口吻。",
      "不要写成长段教程，不要加话题标签。",
      "遇到不确定、强个案或专业风险，标记 needs-review。"
    ].join("\n")
  },
  {
    id: "pitfall-list",
    labelKey: "autoReply.preset.pitfall.label",
    descriptionKey: "autoReply.preset.pitfall.description",
    prompt: [
      "排雷避坑风：像做过对比后的评论区提醒，语气真诚克制。",
      "回复 15-45 字，先认可对方感受，再指出一个避坑点。",
      "可用“这个点真的要注意/别急着冲/先看适不适合你”。",
      "避免制造焦虑，不攻击品牌或他人。",
      "不做绝对化判断，不承诺结果。"
    ].join("\n")
  },
  {
    id: "soft-interaction",
    labelKey: "autoReply.preset.interaction.label",
    descriptionKey: "autoReply.preset.interaction.description",
    prompt: [
      "高互动风：像账号本人在评论区继续聊天，目标是自然延长讨论。",
      "回复 15-35 字，先接住评论，再抛一个轻问题。",
      "可用“你更想看哪种/你现在是哪种情况/我下次补这个”。",
      "不要硬要点赞关注收藏，不要引导私信。",
      "广告、辱骂、隐私、联系方式相关评论直接 skip。"
    ].join("\n")
  }
];
const defaultAutoReplySettings: XhsAutoReplySettings = {
  stylePrompt: "",
  locale: "zh-CN",
  dryRun: false,
  maxRepliesPerRun: 10,
  delaySeconds: 12
};
const defaultSocialCronTaskTypes: SocialCronTaskType[] = ["workspace-diagnosis", "daily-ops-refresh", "health-report", "auto-reply"];
const boardStatuses: SocialBoardTaskStatus[] = ["todo", "ready", "running", "blocked", "done", "failed", "archived"];
const boardStatusLabelKey: Record<SocialBoardTaskStatus, I18nKey> = {
  todo: "board.status.todo",
  ready: "board.status.ready",
  running: "board.status.running",
  blocked: "board.status.blocked",
  done: "board.status.done",
  failed: "board.status.failed",
  archived: "board.status.archived"
};
const chatPermissionLabelKey: Record<ChatPermissionMode, I18nKey> = {
  full_access: "chat.permission.fullAccess",
  ask: "chat.permission.ask",
  read_only: "chat.permission.readOnly"
};
const chatReasoningLabelKey: Record<ChatReasoningEffort, I18nKey> = {
  low: "chat.effort.low",
  medium: "chat.effort.medium",
  high: "chat.effort.high",
  xhigh: "chat.effort.xhigh"
};
const chatModelOptions = ["gpt-5.5", "gpt-5.4", "gpt-5.3-codex-spark"];
const fallbackHermesModelOptions: HermesModelOptions = {
  providers: [
    {
      id: "openai-codex",
      name: "OpenAI Codex",
      current: true,
      totalModels: chatModelOptions.length,
      models: chatModelOptions.map((model) => ({
        id: model,
        provider: "openai-codex",
        label: `openai-codex / ${model}`,
        value: hermesLlmValue({ provider: "openai-codex", model })
      }))
    }
  ],
  models: chatModelOptions.map((model) => ({
    id: model,
    provider: "openai-codex",
    label: `openai-codex / ${model}`,
    value: hermesLlmValue({ provider: "openai-codex", model })
  })),
  current: { provider: "openai-codex", model: "gpt-5.5" }
};
const chatAttachmentMaxChars = 120000;
const chatDefaultSessionTitle = "New session";
const chatSessionLimit = 24;
const chatSessionsStorageKey = "growth-hacker.chatSessions";
const activeChatSessionStorageKey = "growth-hacker.activeChatSessionId";
const defaultYoutubeVideoDraft: YoutubeVideoDraft = {
  title: "",
  prompt: "",
  aspectRatio: "16:9",
  duration: 8,
  resolution: "720p",
  imageUrl: ""
};
const chatSessionSaveQueues = new Map<string, Promise<void>>();
const chatSessionSaveVersions = new Map<string, number>();
const chatModelContextWindows: Record<string, number> = {
  "gpt-5.5": 258000,
  "gpt-5.4": 1050000,
  "gpt-5.3-codex-spark": 128000
};
const vaultWorkspacePlatform = "vault";
const vaultWorkspaceProfile = "vault";
const vaultWorkspaceRoot = "~/.growth/vault";

type KnowledgeSubNavTab = "explorer" | "sessions";

const dashboardNavById: Record<DashboardView, { id: DashboardView; labelKey: I18nKey; icon: LucideIcon }> = {
  workspace: { id: "workspace", labelKey: "nav.workspace", icon: LayoutDashboard },
  knowledge: { id: "knowledge", labelKey: "nav.knowledge", icon: Bookmark },
  published: { id: "published", labelKey: "nav.published", icon: ImageIcon },
  replies: { id: "replies", labelKey: "nav.replies", icon: Reply },
  calendar: { id: "calendar", labelKey: "nav.calendar", icon: CalendarClock },
  board: { id: "board", labelKey: "nav.board", icon: Bot },
  chat: { id: "chat", labelKey: "nav.chat", icon: MessageSquare },
  hermes: { id: "hermes", labelKey: "nav.hermes", icon: Activity },
  skills: { id: "skills", labelKey: "nav.skills", icon: Gauge },
  setup: { id: "setup", labelKey: "nav.setup", icon: KeyRound }
};

const defaultChatLlmValue =
  localStorage.getItem("growth-hacker.chatLlm") ??
  (localStorage.getItem("growth-hacker.chatModel")
    ? hermesLlmValue({ provider: "openai-codex", model: localStorage.getItem("growth-hacker.chatModel") ?? "gpt-5.5" })
    : hermesLlmValue(fallbackHermesModelOptions.current ?? { provider: "openai-codex", model: "gpt-5.5" }));
const defaultChatReasoningEffort = normalizeChatReasoningEffort(localStorage.getItem("growth-hacker.chatReasoningEffort") ?? "xhigh");
const defaultChatPermissionMode = normalizeChatPermissionMode(localStorage.getItem("growth-hacker.chatPermissionMode") ?? "ask");

export function App() {
  const { locale, localeOptions, setLocale, t } = useI18n();
  const [profiles, setProfiles] = useState<WorkspaceProfile[]>([]);
  const [platforms, setPlatforms] = useState<SocialPlatformInfo[]>(fallbackSocialPlatforms);
  const [runtimes, setRuntimes] = useState<RuntimeStatus[]>([]);
  const [migration, setMigration] = useState<MigrationPlan | null>(null);
  const [auth, setAuth] = useState<XhsAuthStatus | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactInfo[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<WorkspaceProfile | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactContent | null>(null);
  const [vaultArtifacts, setVaultArtifacts] = useState<ArtifactInfo[]>([]);
  const [selectedVaultArtifact, setSelectedVaultArtifact] = useState<ArtifactContent | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobSnapshot | null>(null);
  const [socialCronJobs, setSocialCronJobs] = useState<SocialCronJob[]>([]);
  const [socialCronAgents, setSocialCronAgents] = useState<string[]>([]);
  const [socialAgents, setSocialAgents] = useState<SocialAgent[]>([]);
  const [socialBoardTasks, setSocialBoardTasks] = useState<SocialBoardTask[]>([]);
  const [socialCalendarItems, setSocialCalendarItems] = useState<SocialTaskCalendarItem[]>([]);
  const [publishedPosts, setPublishedPosts] = useState<XhsPublishedPost[]>([]);
  const [publishedSearch, setPublishedSearch] = useState("");
  const [publishedStatusFilter, setPublishedStatusFilter] = useState<XhsPublishedPostStatus | "all">("all");
  const [publishedSyncNotice, setPublishedSyncNotice] = useState<string | null>(null);
  const [autoReplyItems, setAutoReplyItems] = useState<XhsAutoReplyItem[]>([]);
  const [autoReplySettings, setAutoReplySettings] = useState<XhsAutoReplySettings>(defaultAutoReplySettings);
  const [autoReplyNotice, setAutoReplyNotice] = useState<string | null>(null);
  const [hermesChatStatus, setHermesChatStatus] = useState<HermesChatStatus | null>(null);
  const [hermesVideoAuth, setHermesVideoAuth] = useState<HermesVideoAuthStatus | null>(null);
  const [hermesVideoAuthUrl, setHermesVideoAuthUrl] = useState<string | null>(null);
  const [hermesModelOptions, setHermesModelOptions] = useState<HermesModelOptions>(fallbackHermesModelOptions);
  const [hermesSkills, setHermesSkills] = useState<HermesSkillInfo[]>([]);
  const [hermesContext, setHermesContext] = useState<HermesContextSnapshot | null>(null);
  const [chatSessionState, setChatSessionState] = useState<ChatSessionState>(() => loadChatSessionState());
  const chatSessionStateRef = useRef(chatSessionState);
  const [activeChatRunId, setActiveChatRunId] = useState<string | null>(null);
  const [chatPermissionMode, setChatPermissionMode] = useState<ChatPermissionMode>(defaultChatPermissionMode);
  const [chatLlmValue, setChatLlmValue] = useState(defaultChatLlmValue);
  const [chatReasoningEffort, setChatReasoningEffort] = useState<ChatReasoningEffort>(defaultChatReasoningEffort);
  const [chatAttachments, setChatAttachments] = useState<ChatAttachment[]>([]);
  const [chatComposerNotice, setChatComposerNotice] = useState<string | null>(null);
  const [chatComposerMode, setChatComposerMode] = useState<ChatComposerMode>(null);
  const [queuedChatSteers, setQueuedChatSteers] = useState<QueuedChatSteer[]>([]);
  const queuedChatSteersRef = useRef<QueuedChatSteer[]>([]);
  const [newWorkspaceProfileName, setNewWorkspaceProfileName] = useState("astrozi");
  const [youtubeVideoDraft, setYoutubeVideoDraft] = useState<YoutubeVideoDraft>(defaultYoutubeVideoDraft);
  const [youtubeVideoNotice, setYoutubeVideoNotice] = useState<string | null>(null);
  const [activeYoutubeVideoRunId, setActiveYoutubeVideoRunId] = useState<string | null>(null);
  const [socialCronTaskTypes, setSocialCronTaskTypes] = useState<SocialCronTaskType[]>(defaultSocialCronTaskTypes);
  const [socialCronTaskType, setSocialCronTaskType] = useState<SocialCronTaskType>("workspace-diagnosis");
  const [socialCronSchedule, setSocialCronSchedule] = useState("daily 09:00");
  const [socialCronAgentId, setSocialCronAgentId] = useState("growth-agent");
  const [selectedLlmValue, setSelectedLlmValue] = useState(localStorage.getItem("growth-hacker.socialLlm") ?? "");
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(() => new Set());
  const [expandedVaultDirectories, setExpandedVaultDirectories] = useState<Set<string>>(() => new Set());
  const [activePlatform, setActivePlatform] = useState<PlatformId>(() => normalizePlatformMode(localStorage.getItem(platformModeStorageKey)));
  const [selectedProfilesByPlatform, setSelectedProfilesByPlatform] = useState<Partial<Record<PlatformId, WorkspaceProfile>>>({});
  const [activeView, setActiveView] = useState<DashboardView>("workspace");
  const [calendarWeekStartDate, setCalendarWeekStartDate] = useState(() => startOfWeek(new Date()));
  const [calendarWeekWasChanged, setCalendarWeekWasChanged] = useState(false);
  const [knowledgeSubNavTab, setKnowledgeSubNavTab] = useState<KnowledgeSubNavTab>("explorer");
  const [chatDraft, setChatDraft] = useState("");
  const [skillSearch, setSkillSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const youtubeVideoAbortRef = useRef<AbortController | null>(null);
  const recoveringRunIdsRef = useRef<Set<string>>(new Set());

  const refresh = async () => {
    const [
      workspacePayload,
      runtimePayload,
      migrationPayload,
      authPayload,
      platformsPayload,
      socialCronPayload,
      socialBoardPayload,
      socialCalendarPayload,
      hermesModelsPayload,
      hermesContextPayload,
      chatStatusPayload,
      hermesVideoAuthPayload
    ] = await Promise.all([
      api<WorkspacesResponse>("/api/workspaces"),
      api<RuntimeResponse>("/api/runtimes"),
      api<MigrationPlan>("/api/migrations/xiaohongshu-legacy/plan", { method: "POST" }),
      api<XhsAuthStatus>("/api/platforms/xiaohongshu/auth"),
      api<SocialPlatformsResponse>("/api/platforms").catch(() => ({ platforms: fallbackSocialPlatforms })),
      api<SocialCronResponse>("/api/social-cron/jobs").catch(() => ({
        jobs: [],
        agents: ["growth-agent"],
        socialAgents: [{ id: "growth-agent", runner: "local" as const }],
        taskTypes: defaultSocialCronTaskTypes
      })),
      api<SocialBoardResponse>("/api/social-board/tasks").catch(() => ({ tasks: [], agents: [], taskTypes: defaultSocialCronTaskTypes })),
      api<SocialCalendarResponse>("/api/social-calendar/items").catch(() => ({ items: [] })),
      api<HermesModelOptions>("/api/hermes/models").catch(() => fallbackHermesModelOptions),
      api<HermesContextResponse>("/api/hermes/context").catch(() => null),
      getHermesChatStatus(),
      api<HermesVideoAuthStatus>("/api/hermes/video-auth/status").catch(() => null)
    ]);
    setProfiles(workspacePayload.profiles);
    setRuntimes(runtimePayload.runtimes);
    setMigration(migrationPayload);
    setAuth(authPayload);
    setPlatforms(platformsPayload.platforms.length ? platformsPayload.platforms : fallbackSocialPlatforms);
    setSocialCronJobs(socialCronPayload.jobs);
    setSocialCronAgents(socialCronPayload.agents);
    setSocialAgents(socialCronPayload.socialAgents ?? socialBoardPayload.agents);
    setSocialBoardTasks(socialBoardPayload.tasks);
    setSocialCalendarItems(socialCalendarPayload.items);
    setHermesModelOptions(hermesModelsPayload.models.length ? hermesModelsPayload : fallbackHermesModelOptions);
    setHermesContext(hermesContextPayload);
    setHermesChatStatus(chatStatusPayload);
    setHermesVideoAuth(hermesVideoAuthPayload);
    setSocialCronTaskTypes(socialCronPayload.taskTypes.length ? socialCronPayload.taskTypes : defaultSocialCronTaskTypes);
    setActivePlatform((current) => normalizePlatformMode(current, platformsPayload.platforms.length ? platformsPayload.platforms : fallbackSocialPlatforms));
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (socialCronAgents.length && !socialCronAgents.includes(socialCronAgentId)) {
      setSocialCronAgentId(socialCronAgents[0]);
    }
  }, [socialCronAgentId, socialCronAgents]);

  useEffect(() => {
    if (!selectedLlmValue && hermesModelOptions.current) {
      setSelectedLlmValue(hermesLlmValue(hermesModelOptions.current));
    }
  }, [hermesModelOptions.current?.provider, hermesModelOptions.current?.model, selectedLlmValue]);

  useEffect(() => {
    if (!hermesModelOptions.models.length) return;
    if (hermesModelOptions.models.some((option) => option.value === chatLlmValue)) return;
    const nextValue = hermesModelOptions.current ? hermesLlmValue(hermesModelOptions.current) : hermesModelOptions.models[0]?.value;
    if (nextValue) setChatLlmValue(nextValue);
  }, [chatLlmValue, hermesModelOptions.current?.provider, hermesModelOptions.current?.model, hermesModelOptions.models]);

  useEffect(() => {
    if (!selectedProfile) {
      setArtifacts([]);
      setSelectedArtifact(null);
      setPublishedPosts([]);
      setAutoReplyItems([]);
      setAutoReplySettings(defaultAutoReplySettings);
      return;
    }
    setExpandedDirectories(new Set());
    setPublishedSyncNotice(null);
    setAutoReplyNotice(null);
    void reloadProfileArtifacts(selectedProfile);
    if (selectedProfile.platform === "xiaohongshu") {
      void reloadPublishedPosts(selectedProfile.profile);
      void reloadAutoReplies(selectedProfile.profile);
    } else {
      setPublishedPosts([]);
      setAutoReplyItems([]);
      setAutoReplySettings(defaultAutoReplySettings);
    }
  }, [selectedProfile?.platform, selectedProfile?.profile]);

  useEffect(() => {
    if (activeView !== "knowledge") return;
    void reloadVaultArtifacts(selectedVaultArtifact?.artifact.path);
  }, [activeView]);

  useEffect(() => {
    if (activeView !== "hermes") return;
    void reloadHermesContext();
  }, [activeView]);

  useEffect(() => {
    localStorage.setItem("growth-hacker.chatPermissionMode", chatPermissionMode);
  }, [chatPermissionMode]);

  useEffect(() => {
    localStorage.setItem("growth-hacker.chatLlm", chatLlmValue);
  }, [chatLlmValue]);

  useEffect(() => {
    localStorage.setItem("growth-hacker.chatReasoningEffort", chatReasoningEffort);
  }, [chatReasoningEffort]);

  useEffect(() => {
    if (selectedLlmValue) localStorage.setItem("growth-hacker.socialLlm", selectedLlmValue);
  }, [selectedLlmValue]);

  useEffect(() => {
    void hydrateChatSessions();
  }, []);

  const hermes = runtimes.find((runtime) => runtime.kind === "hermes");
  const openclaw = runtimes.find((runtime) => runtime.kind === "openclaw");
  const activePlatformInfo = useMemo(() => socialPlatformInfo(platforms, activePlatform), [activePlatform, platforms]);
  const visibleModeViewIds = useMemo(() => visibleDashboardViews(activePlatformInfo), [activePlatformInfo]);
  const modeSpecificNav = useMemo(
    () => visibleModeViewIds.filter((view) => !sharedDashboardViews.includes(view)).map((view) => dashboardNavById[view]),
    [visibleModeViewIds]
  );
  const sharedNav = useMemo(() => sharedDashboardViews.map((view) => dashboardNavById[view]), []);
  const activePlatformProfiles = useMemo(() => profiles.filter((profile) => profile.platform === activePlatform), [activePlatform, profiles]);
  const activeProfileGroups = useMemo(() => groupByPlatform(activePlatformProfiles), [activePlatformProfiles]);
  const activeSocialCronTaskTypes = useMemo(
    () => socialCronTaskTypes.filter((taskType) => activePlatformInfo.capabilities.scheduledTasks.includes(taskType)),
    [activePlatformInfo.capabilities.scheduledTasks, socialCronTaskTypes]
  );
  const activeSocialCronJobs = useMemo(() => socialCronJobs.filter((job) => job.platform === activePlatform), [activePlatform, socialCronJobs]);
  const activeSocialBoardTasks = useMemo(
    () => socialBoardTasks.filter((task) => task.platform === activePlatform && shouldShowSocialBoardTask(task)),
    [activePlatform, socialBoardTasks]
  );
  const selectedRuntimeJob = selectedJob && !selectedJob.type.startsWith("social-board-") ? selectedJob : null;
  const activeSocialCalendarItems = useMemo(
    () => socialCalendarItems.filter((item) => item.platform === activePlatform),
    [activePlatform, socialCalendarItems]
  );
  const defaultCalendarWeekStart = useMemo(
    () => resolveDefaultCalendarWeekStart(activeSocialCalendarItems, activeSocialCronJobs),
    [activeSocialCalendarItems, activeSocialCronJobs]
  );
  const artifactTree = useMemo(() => buildArtifactTree(artifacts), [artifacts]);
  const visibleArtifacts = useMemo(() => flattenArtifactTree(artifactTree, expandedDirectories), [artifactTree, expandedDirectories]);
  const vaultArtifactTree = useMemo(() => buildArtifactTree(vaultArtifacts), [vaultArtifacts]);
  const visibleVaultArtifacts = useMemo(
    () => flattenArtifactTree(vaultArtifactTree, expandedVaultDirectories),
    [vaultArtifactTree, expandedVaultDirectories]
  );
  const activeChatSession = chatSessionState.sessions.find((session) => session.id === chatSessionState.activeId) ?? chatSessionState.sessions[0];
  const chatEvents = activeChatSession?.events ?? [];
  const queuedChatSteerCount = activeChatSession ? queuedChatSteers.filter((steer) => steer.sessionId === activeChatSession.id).length : 0;

  useEffect(() => {
    chatSessionStateRef.current = chatSessionState;
  }, [chatSessionState]);

  useEffect(() => {
    localStorage.setItem(platformModeStorageKey, activePlatform);
  }, [activePlatform]);

  useEffect(() => {
    setCalendarWeekWasChanged(false);
  }, [activePlatform]);

  useEffect(() => {
    if (!calendarWeekWasChanged) setCalendarWeekStartDate(defaultCalendarWeekStart);
  }, [calendarWeekWasChanged, defaultCalendarWeekStart]);

  useEffect(() => {
    setActiveView((current) => resolveDashboardViewForPlatform(current, activePlatformInfo));
  }, [activePlatformInfo]);

  useEffect(() => {
    const next = selectProfileForPlatform(profiles, activePlatform, selectedProfilesByPlatform[activePlatform]);
    setSelectedProfile((current) => (isSameWorkspace(current, next) ? current : next));
  }, [activePlatform, profiles, selectedProfilesByPlatform]);

  useEffect(() => {
    if (activeSocialCronTaskTypes.length && !activeSocialCronTaskTypes.includes(socialCronTaskType)) {
      setSocialCronTaskType(activeSocialCronTaskTypes[0]);
    }
  }, [activeSocialCronTaskTypes, socialCronTaskType]);

  useEffect(() => {
    if (!activeChatSession) return;
    const runId = findRunMissingTerminalEvent(activeChatSession.events, isRecoverableRunProgressEvent);
    if (!runId || recoveringRunIdsRef.current.has(runId)) return;
    recoveringRunIdsRef.current.add(runId);
    void getHermesRunStatus(runId)
      .then(async (status) => {
        const event = runStatusToTerminalEvent(status);
        if (!event) return;
        if (event.event === "run.completed") await persistChatRunArtifacts(runId, selectedProfile);
        updateChatSessionEvents(activeChatSession.id, (current) =>
          hasTerminalEventForRun(current, runId) ? current : [...current, event]
        );
        setActiveChatRunId((current) => (current === runId ? null : current));
        setBusy((current) => (current === "chat-run" ? null : current));
        void refresh();
        if (activeView === "knowledge") void reloadVaultArtifacts(selectedVaultArtifact?.artifact.path);
      })
      .catch((error) => {
        updateChatSessionEvents(activeChatSession.id, (current) =>
          hasTerminalEventForRun(current, runId)
            ? current
            : [
                ...current,
                {
                  event: "run.failed",
                  run_id: runId,
                  timestamp: Date.now() / 1000,
                  error: error instanceof Error ? error.message : "run_status_unavailable"
                }
              ]
        );
        setActiveChatRunId((current) => (current === runId ? null : current));
        setBusy((current) => (current === "chat-run" ? null : current));
      })
      .finally(() => {
        recoveringRunIdsRef.current.delete(runId);
      });
  }, [activeChatSession, activeChatRunId, selectedProfile]);

  const selectedChatAgentId = activeView === "chat" || activeView === "knowledge" ? activeChatSession?.agentId : undefined;
  const selectedSocialAgent =
    socialAgents.find((agent) => agent.id === selectedChatAgentId) ??
    socialAgents.find((agent) => agent.id === socialCronAgentId) ??
    socialAgents[0];
  const selectedLlm = hermesLlmFromValue(selectedLlmValue) ?? hermesModelOptions.current;
  const selectedChatLlm =
    hermesLlmFromValue(chatLlmValue) ?? hermesModelOptions.current ?? fallbackHermesModelOptions.current ?? { provider: "openai-codex", model: "gpt-5.5" };
  const chatModel = selectedChatLlm.model;
  const activeNavItem = dashboardNavById[activeView] ?? dashboardNavById.workspace;
  const activeNavLabel = t(activeNavItem.labelKey);
  const topbarTitle =
    activeView === "chat" || activeView === "knowledge"
      ? activeChatSession
        ? displayChatSessionTitle(activeChatSession, t)
        : t("common.newSession")
      : activeNavLabel;
  const topbarEyebrow = activeView === "chat" ? activeNavLabel : topbarContext(activeView, selectedProfile, activePlatform, t);
  useEffect(() => {
    if (!selectedSocialAgent) {
      setHermesSkills([]);
      return;
    }
    void reloadHermesSkills(selectedSocialAgent.id);
  }, [selectedSocialAgent?.id]);

  function toggleDirectory(path: string) {
    setExpandedDirectories((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function toggleVaultDirectory(path: string) {
    setExpandedVaultDirectories((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  async function reloadProfileArtifacts(profile = selectedProfile, preferredPath = selectedArtifact?.artifact.path): Promise<ArtifactInfo[]> {
    if (!profile) {
      setArtifacts([]);
      setSelectedArtifact(null);
      return [];
    }
    const payload = await api<{ artifacts: ArtifactInfo[] }>(
      `/api/platforms/${encodeURIComponent(profile.platform)}/profiles/${encodeURIComponent(profile.profile)}/artifacts`
    );
    setArtifacts(payload.artifacts);
    const first =
      (preferredPath ? payload.artifacts.find((item) => item.kind === "file" && item.path === preferredPath) : undefined) ??
      payload.artifacts.find((item) => item.kind === "file" && item.path === "01-client-brief.md") ??
      payload.artifacts.find((item) => item.kind === "file" && !item.path.includes("/")) ??
      payload.artifacts.find((item) => item.kind === "file");
    if (first) {
      await openArtifact(first);
    } else {
      setSelectedArtifact(null);
    }
    return payload.artifacts;
  }

  async function openArtifact(artifact: ArtifactInfo) {
    if (artifact.kind !== "file") return;
    const payload = await api<ArtifactContent>(
      `/api/platforms/${encodeURIComponent(artifact.platform)}/profiles/${encodeURIComponent(
        artifact.profile
      )}/artifact?path=${encodeURIComponent(artifact.path)}`
    );
    setSelectedArtifact(payload);
  }

  async function reloadVaultArtifacts(preferredPath = selectedVaultArtifact?.artifact.path): Promise<ArtifactInfo[]> {
    const payload = await api<{ artifacts: ArtifactInfo[] }>("/api/vault/artifacts").catch(() => ({ artifacts: [] }));
    setVaultArtifacts(payload.artifacts);
    const next =
      (preferredPath ? payload.artifacts.find((item) => item.kind === "file" && item.path === preferredPath) : undefined) ??
      payload.artifacts.find((item) => item.kind === "file" && item.mime === "markdown") ??
      payload.artifacts.find((item) => item.kind === "file");
    if (next) {
      await openVaultArtifact(next);
    } else {
      setSelectedVaultArtifact(null);
    }
    return payload.artifacts;
  }

  async function openVaultArtifact(artifact: ArtifactInfo) {
    if (artifact.kind !== "file") return;
    const payload = await api<ArtifactContent>(`/api/vault/artifact?path=${encodeURIComponent(artifact.path)}`);
    setSelectedVaultArtifact(payload);
  }

  function referenceVaultArtifact(artifactContent = selectedVaultArtifact) {
    if (!artifactContent?.content) return;
    const path = artifactContent.artifact.path;
    const content = buildVaultAttachmentContent(artifactContent, vaultWorkspaceRoot);
    const id = `vault:${path}:${artifactContent.artifact.updatedAt ?? ""}`;
    setChatAttachments((current) =>
      current.some((attachment) => attachment.id === id || attachment.name === `vault:${path}`)
        ? current
        : [
            ...current,
            {
              id,
              name: `vault:${path}`,
              mime: artifactContent.artifact.mime === "markdown" ? "text/markdown" : "text/plain",
              size: content.length,
              content: truncateAttachmentContent(content)
            }
          ]
    );
    setChatComposerNotice(t("notice.referenced", { path }));
  }

  async function runMigration() {
    setBusy("migration");
    try {
      setMigration(await api<MigrationPlan>("/api/migrations/xiaohongshu-legacy/run", { method: "POST" }));
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function bootstrap() {
    setBusy("bootstrap");
    try {
      await api("/api/bootstrap/growth-agent", { method: "POST" });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function login(mode: "qrcode" | "browser") {
    setBusy(`login-${mode}`);
    try {
      const job = await api<JobSnapshot>("/api/platforms/xiaohongshu/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode })
      });
      setSelectedJob(job);
      const source = new EventSource(`/api/jobs/${job.id}/events`);
      source.onmessage = (event) => {
        const next = JSON.parse(event.data) as JobSnapshot;
        setSelectedJob(next);
        if (next.status === "succeeded" || next.status === "failed") {
          source.close();
          setBusy(null);
          void refresh();
        }
      };
      source.onerror = () => {
        source.close();
        setBusy(null);
      };
    } catch {
      setBusy(null);
    }
  }

  async function activateHermesVideoAuth() {
    setBusy("hermes-video-auth");
    setHermesVideoAuthUrl(null);
    try {
      const job = await api<JobSnapshot>("/api/hermes/video-auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      watchJob(
        job,
        () => {
          setBusy(null);
          void refresh();
        },
        (next) => {
          const url = extractOAuthUrlFromJob(next);
          if (url) setHermesVideoAuthUrl(url);
        }
      );
    } catch {
      setBusy(null);
    }
  }

  async function reloadSocialCron() {
    const [cronPayload, boardPayload, calendarPayload] = await Promise.all([
      api<SocialCronResponse>("/api/social-cron/jobs"),
      api<SocialBoardResponse>("/api/social-board/tasks"),
      api<SocialCalendarResponse>("/api/social-calendar/items")
    ]);
    setSocialCronJobs(cronPayload.jobs);
    setSocialCronAgents(cronPayload.agents);
    setSocialAgents(cronPayload.socialAgents ?? boardPayload.agents);
    setSocialBoardTasks(boardPayload.tasks);
    setSocialCalendarItems(calendarPayload.items);
    setSocialCronTaskTypes(cronPayload.taskTypes.length ? cronPayload.taskTypes : defaultSocialCronTaskTypes);
    return cronPayload;
  }

  async function reloadPublishedPosts(profile = selectedProfile?.profile): Promise<XhsPublishedPost[]> {
    if (!profile) {
      setPublishedPosts([]);
      return [];
    }
    const payload = await api<XhsPublishedPostsResponse>(
      `/api/platforms/xiaohongshu/profiles/${encodeURIComponent(profile)}/published-posts`
    ).catch(() => ({ posts: [] }));
    setPublishedPosts(payload.posts);
    return payload.posts;
  }

  async function syncPublishedPosts() {
    if (!selectedProfile) return;
    setBusy("published-sync");
    setPublishedSyncNotice(null);
    try {
      const payload = await api<XhsPublishedPostsSyncResponse>(
        `/api/platforms/xiaohongshu/profiles/${encodeURIComponent(selectedProfile.profile)}/published-posts/sync`,
        { method: "POST" }
      );
      setPublishedPosts(payload.posts);
      setPublishedSyncNotice(t("published.syncSuccess", { imported: payload.imported, updated: payload.updated, archived: payload.archived }));
    } catch (error) {
      setPublishedSyncNotice(error instanceof Error ? error.message : t("published.syncFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function updatePublishedPost(post: XhsPublishedPost, patch: { status?: XhsPublishedPostStatus; statusNote?: string; keyword?: string }) {
    if (!selectedProfile) return;
    setBusy(`published-update-${post.id}`);
    try {
      const payload = await api<XhsPublishedPostUpdateResponse>(
        `/api/platforms/xiaohongshu/profiles/${encodeURIComponent(selectedProfile.profile)}/published-posts/${encodeURIComponent(post.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch)
        }
      );
      setPublishedPosts((current) => current.map((item) => (item.id === payload.post.id ? payload.post : item)));
    } finally {
      setBusy(null);
    }
  }

  async function reloadAutoReplies(profile = selectedProfile?.profile): Promise<XhsAutoReplyItem[]> {
    if (!profile) {
      setAutoReplyItems([]);
      setAutoReplySettings(defaultAutoReplySettings);
      return [];
    }
    const payload = await api<XhsAutoRepliesResponse>(
      `/api/platforms/xiaohongshu/profiles/${encodeURIComponent(profile)}/auto-replies`
    ).catch(() => ({ settings: defaultAutoReplySettings, items: [] }));
    setAutoReplySettings(payload.settings);
    setAutoReplyItems(payload.items);
    return payload.items;
  }

  async function saveAutoReplySettings(nextSettings = autoReplySettings) {
    if (!selectedProfile) return;
    setBusy("auto-reply-settings");
    setAutoReplyNotice(null);
    try {
      const payload = await persistAutoReplySettings(nextSettings);
      setAutoReplySettings(payload.settings);
      setAutoReplyNotice(t("autoReply.saveSuccess"));
    } catch (error) {
      setAutoReplyNotice(error instanceof Error ? error.message : t("autoReply.saveFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function persistAutoReplySettings(nextSettings = autoReplySettings): Promise<XhsAutoReplySettingsResponse> {
    if (!selectedProfile) throw new Error("profile_required");
    return api<XhsAutoReplySettingsResponse>(
      `/api/platforms/xiaohongshu/profiles/${encodeURIComponent(selectedProfile.profile)}/auto-replies/settings`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextSettings)
      }
    );
  }

  async function syncAutoReplies() {
    if (!selectedProfile) return;
    setBusy("auto-reply-sync");
    setAutoReplyNotice(null);
    try {
      const payload = await api<XhsAutoReplySyncResponse>(
        `/api/platforms/xiaohongshu/profiles/${encodeURIComponent(selectedProfile.profile)}/auto-replies/sync`,
        { method: "POST" }
      );
      setAutoReplyItems(payload.items);
      const errorText = payload.errors.length ? t("autoReply.syncErrors", { count: payload.errors.length }) : "";
      setAutoReplyNotice(
        t("autoReply.syncSuccess", { imported: payload.imported, updated: payload.updated, alreadyReplied: payload.alreadyReplied, errorText })
      );
    } catch (error) {
      setAutoReplyNotice(error instanceof Error ? error.message : t("autoReply.syncFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function runAutoReplies() {
    if (!selectedProfile) return;
    setBusy("auto-reply-run");
    setAutoReplyNotice(null);
    try {
      const settingsPayload = await persistAutoReplySettings(autoReplySettings);
      setAutoReplySettings(settingsPayload.settings);
      const snapshot = await api<JobSnapshot>(
        `/api/platforms/xiaohongshu/profiles/${encodeURIComponent(selectedProfile.profile)}/auto-replies/run`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: socialCronAgentId || socialCronAgents[0], llm: selectedLlm })
        }
      );
      watchJob(snapshot, () => {
        void reloadAutoReplies();
        void reloadSocialCron();
      });
      await reloadSocialCron();
      setActiveView("board");
    } catch (error) {
      setAutoReplyNotice(error instanceof Error ? error.message : t("autoReply.runFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function updateAutoReplyItem(item: XhsAutoReplyItem, patch: { status?: XhsAutoReplyItemStatus; replyContent?: string }) {
    if (!selectedProfile) return;
    setBusy(`auto-reply-item-${item.id}`);
    try {
      const payload = await api<XhsAutoReplyItemUpdateResponse>(
        `/api/platforms/xiaohongshu/profiles/${encodeURIComponent(selectedProfile.profile)}/auto-replies/items/${encodeURIComponent(item.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch)
        }
      );
      setAutoReplyItems((current) => current.map((currentItem) => (currentItem.id === payload.item.id ? payload.item : currentItem)));
    } finally {
      setBusy(null);
    }
  }

  async function createWorkspaceProfileFromUi() {
    const profileName = newWorkspaceProfileName.trim();
    if (!profileName) return;
    setBusy("workspace-profile-create");
    setYoutubeVideoNotice(null);
    try {
      const payload = await api<WorkspaceProfileResponse>(`/api/platforms/${encodeURIComponent(activePlatform)}/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: profileName })
      });
      setProfiles((current) => {
        const withoutDuplicate = current.filter((profile) => !isSameWorkspace(profile, payload.profile));
        return [...withoutDuplicate, payload.profile].sort((a, b) => `${a.platform}/${a.profile}`.localeCompare(`${b.platform}/${b.profile}`));
      });
      setSelectedProfilesByPlatform((current) => ({ ...current, [payload.profile.platform as PlatformId]: payload.profile }));
      setSelectedProfile(payload.profile);
      await reloadProfileArtifacts(payload.profile, "");
      setYoutubeVideoNotice(t("youtube.profileReady", { profile: payload.profile.profile }));
    } catch (error) {
      setYoutubeVideoNotice(error instanceof Error ? error.message : t("youtube.profileCreateFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function startYoutubeVideoRun() {
    if (!selectedProfile || selectedProfile.platform !== "youtube" || !youtubeVideoDraft.prompt.trim()) return;
    setBusy("youtube-video-run");
    setYoutubeVideoNotice(t("youtube.runStarted"));
    const controller = new AbortController();
    youtubeVideoAbortRef.current = controller;
    let runId: string | null = null;
    try {
      const run = await api<HermesChatRunResponse>(
        `/api/platforms/youtube/profiles/${encodeURIComponent(selectedProfile.profile)}/video-runs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...youtubeVideoDraft,
            agentId: selectedSocialAgent?.id ?? socialCronAgentId
          })
        }
      );
      runId = run.runId;
      setActiveYoutubeVideoRunId(run.runId);
      const terminalEvent = await waitForHermesRunTerminal(run.runId, controller.signal);
      if (!terminalEvent) return;
      if (terminalEvent.event !== "run.completed") {
        setYoutubeVideoNotice(eventErrorMessage(terminalEvent, t("youtube.runFailed")));
        return;
      }
      const persisted = await api<PersistHermesRunArtifactsResponse>(`/api/chat/runs/${encodeURIComponent(run.runId)}/artifacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: selectedProfile.platform, profile: selectedProfile.profile })
      });
      const videoArtifact = persisted.artifacts.find((artifact) => artifact.contentType.startsWith("video/"));
      await reloadProfileArtifacts(selectedProfile, videoArtifact?.path);
      setYoutubeVideoNotice(
        videoArtifact ? t("youtube.runSuccess", { path: videoArtifact.path }) : t("youtube.runCompletedNoVideo")
      );
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setYoutubeVideoNotice(error instanceof Error ? error.message : t("youtube.runFailed"));
      }
    } finally {
      setActiveYoutubeVideoRunId((current) => (!runId || current === runId ? null : current));
      setBusy((current) => (current === "youtube-video-run" ? null : current));
      if (youtubeVideoAbortRef.current === controller) youtubeVideoAbortRef.current = null;
    }
  }

  async function stopYoutubeVideoRun() {
    if (!activeYoutubeVideoRunId) return;
    await stopHermesRun(activeYoutubeVideoRunId).catch(() => undefined);
    youtubeVideoAbortRef.current?.abort();
    setActiveYoutubeVideoRunId(null);
    setBusy((current) => (current === "youtube-video-run" ? null : current));
    setYoutubeVideoNotice(t("youtube.runStopped"));
  }

  async function reloadHermesSkills(agentId = selectedSocialAgent?.id): Promise<HermesSkillInfo[]> {
    if (!agentId) {
      setHermesSkills([]);
      return [];
    }
    const payload = await api<HermesSkillsResponse>(`/api/agents/${encodeURIComponent(agentId)}/skills`).catch(() => ({ skills: [] }));
    setHermesSkills(payload.skills);
    return payload.skills;
  }

  async function reloadHermesContext(sessionId = hermesContext?.selectedSessionId): Promise<HermesContextSnapshot | null> {
    const params = new URLSearchParams();
    if (sessionId) params.set("sessionId", sessionId);
    const payload = await api<HermesContextResponse>(`/api/hermes/context${params.size ? `?${params}` : ""}`).catch(() => null);
    setHermesContext(payload);
    return payload;
  }

  function selectHermesContextSession(sessionId: string) {
    void reloadHermesContext(sessionId);
  }

  function referenceHermesContext() {
    if (!hermesContext) return;
    const content = buildHermesContextAttachmentContent(hermesContext);
    const id = `hermes-context:${hermesContext.generatedAt}:${hermesContext.selectedSessionId ?? "latest"}`;
    setChatAttachments((current) =>
      current.some((attachment) => attachment.id === id)
        ? current
        : [
            ...current,
            {
              id,
              name: "hermes-context.json",
              mime: "application/json",
              size: content.length,
              content: truncateAttachmentContent(content)
            }
          ]
    );
    setChatComposerNotice("已引用 Hermes context");
    setActiveView("chat");
  }

  async function hydrateChatSessions(): Promise<void> {
    try {
      const serverState = normalizeChatSessionState(await getChatSessions());
      if (serverState.sessions.length) {
        setChatSessionState(serverState);
        return;
      }

      const legacyState = loadChatSessionState();
      if (legacyState.sessions.some((session) => session.events.length > 0)) {
        const imported = normalizeChatSessionState(await importChatSessions(legacyState));
        if (imported.sessions.length) {
          localStorage.removeItem(chatSessionsStorageKey);
          localStorage.removeItem(activeChatSessionStorageKey);
          setChatSessionState(imported);
          return;
        }
      }

      const next = createChatSession(selectedSocialAgent?.id ?? socialCronAgentId);
      setChatSessionState({ sessions: [next], activeId: next.id });
      const created = normalizeChatSessionState(await createChatSessionApi(next));
      if (created.sessions.length) setChatSessionState(created);
    } catch (error) {
      setChatComposerNotice(error instanceof Error ? error.message : "chat_sessions_unavailable");
    }
  }

  async function toggleHermesSkill(skill: HermesSkillInfo) {
    const agentId = selectedSocialAgent?.id;
    if (!agentId) return;
    setBusy(`skill-${skill.name}`);
    try {
      const payload = await api<HermesSkillUpdateResponse>(
        `/api/agents/${encodeURIComponent(agentId)}/skills/${encodeURIComponent(skill.name)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: !skill.enabled })
        }
      );
      setHermesSkills((current) =>
        current
          .map((item) =>
            item.name === payload.skill.name ? { ...item, enabled: payload.skill.enabled, status: payload.skill.status } : item
          )
          .sort(sortHermesSkills)
      );
    } finally {
      setBusy(null);
    }
  }

  async function createSocialCron() {
    if (!selectedProfile) return;
    setBusy("social-cron-create");
    try {
      await api<SocialCronJob>("/api/social-cron/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: socialCronAgentId || socialCronAgents[0],
          llm: selectedLlm,
          platform: selectedProfile.platform,
          profile: selectedProfile.profile,
          taskType: socialCronTaskType,
          schedule: socialCronSchedule
        })
      });
      await reloadSocialCron();
      setActiveView("calendar");
    } finally {
      setBusy(null);
    }
  }

  async function runSocialCron(job: SocialCronJob) {
    setBusy(`social-cron-run-${job.id}`);
    try {
      const snapshot = await api<JobSnapshot>(`/api/social-cron/jobs/${encodeURIComponent(job.id)}/run`, { method: "POST" });
      watchJob(snapshot, () => void reloadSocialCron());
      await reloadSocialCron();
      setActiveView("board");
    } finally {
      setBusy(null);
    }
  }

  async function runSocialBoardTask(task: SocialBoardTask) {
    setBusy(`social-board-run-${task.id}`);
    try {
      const snapshot = await api<JobSnapshot>(`/api/social-board/tasks/${encodeURIComponent(task.id)}/run`, { method: "POST" });
      watchJob(snapshot, () => void reloadSocialCron());
      await reloadSocialCron();
      setActiveView("board");
    } finally {
      setBusy(null);
    }
  }

  async function openSocialBoardTaskSession(task: SocialBoardTask) {
    if (!task.hermesSessionId || activeChatRunId) return;

    const existing = chatSessionStateRef.current.sessions.find((session) => session.hermesSessionId === task.hermesSessionId);
    if (existing) {
      selectChatSession(existing.id, "chat");
      return;
    }

    const next = createChatSessionFromSocialBoardTask(task);
    setBusy(`social-board-session-${task.id}`);
    commitChatSessionState({
      activeId: next.id,
      sessions: [next, ...chatSessionStateRef.current.sessions].slice(0, chatSessionLimit)
    });
    setActiveView("chat");
    setSocialCronAgentId(task.agentId);
    setChatDraft("");
    setChatAttachments([]);
    setChatComposerNotice(null);
    setChatComposerMode(null);

    try {
      const created = withActiveChatSession(normalizeChatSessionState(await createChatSessionApi(next)), next.id);
      commitChatSessionState(created);
      setActiveView("chat");
    } catch (error) {
      setChatComposerNotice(error instanceof Error ? error.message : "create_chat_session_failed");
    } finally {
      setBusy(null);
    }
  }

  async function toggleSocialCron(job: SocialCronJob) {
    setBusy(`social-cron-toggle-${job.id}`);
    try {
      await api<SocialCronJob>(`/api/social-cron/jobs/${encodeURIComponent(job.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !job.enabled })
      });
      await reloadSocialCron();
    } finally {
      setBusy(null);
    }
  }

  async function deleteSocialCron(job: SocialCronJob) {
    setBusy(`social-cron-delete-${job.id}`);
    try {
      await api(`/api/social-cron/jobs/${encodeURIComponent(job.id)}`, { method: "DELETE" });
      await reloadSocialCron();
    } finally {
      setBusy(null);
    }
  }

  function watchJob(job: JobSnapshot, onDone?: () => void, onUpdate?: (job: JobSnapshot) => void) {
    setSelectedJob(job);
    onUpdate?.(job);
    const source = new EventSource(`/api/jobs/${job.id}/events`);
    source.onmessage = (event) => {
      const next = JSON.parse(event.data) as JobSnapshot;
      setSelectedJob(next);
      onUpdate?.(next);
      if (next.status === "succeeded" || next.status === "failed") {
        source.close();
        onDone?.();
      }
    };
    source.onerror = () => source.close();
  }

  async function attachChatFiles(files: FileList | null) {
    const candidates = Array.from(files ?? []);
    if (!candidates.length) return;
    const accepted = candidates.filter(isSupportedChatAttachmentFile);
    const rejected = candidates.filter((file) => !isSupportedChatAttachmentFile(file));
    if (rejected.length) {
      setChatComposerNotice(t("notice.rejectedAttachments", { count: rejected.length }));
    } else {
      setChatComposerNotice(null);
    }
    try {
      const nextAttachments = await Promise.all(accepted.map((file) => buildChatAttachment(file, selectedProfile)));
      setChatAttachments((current) => [...current, ...nextAttachments]);
    } catch (error) {
      setChatComposerNotice(error instanceof Error ? error.message : "attach_chat_file_failed");
    }
  }

  function removeChatAttachment(id: string) {
    setChatAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  function commitChatSessionState(nextState: ChatSessionState) {
    chatSessionStateRef.current = nextState;
    if (nextState.activeId) localStorage.setItem(activeChatSessionStorageKey, nextState.activeId);
    setChatSessionState(nextState);
  }

  function updateChatSessionEvents(sessionId: string, update: ChatEventsUpdate, titleHint?: string) {
    setChatSessionState((current) => {
      let touched = false;
      const now = Date.now();
      const sessions = current.sessions.map((session) => {
        if (session.id !== sessionId) return session;
        touched = true;
        const events = typeof update === "function" ? update(session.events) : update;
        const shouldNameSession = titleHint && (!session.title.trim() || session.title === chatDefaultSessionTitle);
        const updatedSession = {
          ...session,
          events,
          title: shouldNameSession ? titleHint : session.title,
          updatedAt: now
        };
        queueMicrotask(() => void saveChatSession(updatedSession));
        return updatedSession;
      });
      if (!touched) return current;
      const nextState = { ...current, sessions: sortChatSessions(sessions).slice(0, chatSessionLimit) };
      chatSessionStateRef.current = nextState;
      return nextState;
    });
  }

  function createChatSessionFromUi() {
    chatAbortRef.current?.abort();
    const next = createChatSession(selectedSocialAgent?.id ?? socialCronAgentId);
    setChatSessionState((current) => ({
      activeId: next.id,
      sessions: [next, ...current.sessions].slice(0, chatSessionLimit)
    }));
    setActiveChatRunId(null);
    setChatDraft("");
    setChatAttachments([]);
    setChatComposerNotice(null);
    setChatComposerMode(null);
    void createChatSessionApi(next)
      .then((state) => setChatSessionState(normalizeChatSessionState(state)))
      .catch((error) => setChatComposerNotice(error instanceof Error ? error.message : "create_chat_session_failed"));
  }

  function selectChatSession(sessionId: string, nextView?: DashboardView) {
    if (activeChatRunId) return;
    const state = chatSessionStateRef.current;
    const next = state.sessions.find((session) => session.id === sessionId);
    if (!next) return;
    commitChatSessionState({ ...state, activeId: sessionId });
    void activateChatSessionApi(sessionId)
      .then((serverState) => commitChatSessionState(withActiveChatSession(normalizeChatSessionState(serverState), sessionId)))
      .catch(() => undefined);
    if (next.agentId) setSocialCronAgentId(next.agentId);
    if (nextView) setActiveView(nextView);
    setChatDraft("");
    setChatAttachments([]);
    setChatComposerNotice(null);
    setChatComposerMode(null);
  }

  function renameChatSession(sessionId: string, title: string) {
    setChatSessionState((current) => ({
      ...current,
      sessions: current.sessions.map((session) => {
        if (session.id !== sessionId) return session;
        const updatedSession = {
          ...session,
          title: title.slice(0, 80),
          updatedAt: Date.now()
        };
        queueMicrotask(() => void saveChatSession(updatedSession));
        return updatedSession;
      })
    }));
  }

  function deleteChatSession(sessionId: string) {
    if (activeChatRunId) return;
    const deletingActive = chatSessionState.activeId === sessionId;
    setChatSessionState((current) => {
      const remaining = current.sessions.filter((session) => session.id !== sessionId);
      const sessions = remaining.length ? remaining : [createChatSession(selectedSocialAgent?.id ?? socialCronAgentId)];
      return {
        activeId: deletingActive ? sessions[0].id : current.activeId,
        sessions
      };
    });
    void deleteChatSessionApi(sessionId)
      .then((state) => setChatSessionState(normalizeChatSessionState(state)))
      .catch((error) => setChatComposerNotice(error instanceof Error ? error.message : "delete_chat_session_failed"));
    if (deletingActive) {
      setChatDraft("");
      setChatAttachments([]);
      setChatComposerNotice(null);
      setChatComposerMode(null);
    }
  }

  function updateChatSessionAgent(agentId: string) {
    setSocialCronAgentId(agentId);
    if (!activeChatSession) return;
    setChatSessionState((current) => ({
      ...current,
      sessions: current.sessions.map((session) => {
        if (session.id !== activeChatSession.id) return session;
        const updatedSession = {
          ...session,
          agentId,
          updatedAt: Date.now()
        };
        queueMicrotask(() => void saveChatSession(updatedSession));
        return updatedSession;
      })
    }));
  }

  function handoffChatSessionFromUi() {
    if (activeChatRunId || !activeChatSession) return;
    void handoffChatSessionApi(activeChatSession.id, selectedSocialAgent?.id ?? socialCronAgentId)
      .then((state) => {
        setChatSessionState(normalizeChatSessionState(state));
        setChatDraft("");
        setChatAttachments([]);
        setChatComposerNotice(null);
        setChatComposerMode(null);
      })
      .catch((error) => setChatComposerNotice(error instanceof Error ? error.message : "handoff_chat_session_failed"));
  }

  function syncQueuedChatSteers(next: QueuedChatSteer[]) {
    queuedChatSteersRef.current = next;
    setQueuedChatSteers(next);
  }

  function enqueueChatSteer(submission: QueuedChatSteer) {
    const next = [...queuedChatSteersRef.current, submission];
    syncQueuedChatSteers(next);
    setChatComposerNotice(t("notice.chatSteerQueued", { count: next.filter((steer) => steer.sessionId === submission.sessionId).length }));
  }

  function drainQueuedChatSteers(sessionId: string) {
    const nextSubmission = queuedChatSteersRef.current.find((steer) => steer.sessionId === sessionId);
    if (!nextSubmission) return;
    syncQueuedChatSteers(queuedChatSteersRef.current.filter((steer) => steer.id !== nextSubmission.id));
    void runChatSubmission(nextSubmission);
  }

  function createChatSubmission(session: ChatSession): QueuedChatSteer | null {
    const message = chatDraft.trim();
    if (!message && !chatAttachments.length) return null;
    const agentId = selectedSocialAgent?.id ?? socialCronAgentId;
    const runComposerMode = chatComposerMode;
    const skillMentions = resolveSkillMentions(message, hermesSkills);
    if (skillMentions.error) {
      updateChatSessionEvents(session.id, (current) => [
        ...current,
        { event: "run.failed", error: skillMentions.error, timestamp: Date.now() / 1000 }
      ]);
      return null;
    }
    const baseOutgoingMessage =
      runComposerMode === "image" ? buildImageGenerationChatMessage(message, chatAttachments) : buildChatMessageWithAttachments(message, chatAttachments);
    const visualAssets = resolveReusableVisualAssets(baseOutgoingMessage, session.events, artifacts, selectedProfile);
    const visualMessage = appendVisualAssetContext(baseOutgoingMessage, visualAssets);
    const outgoingMessage =
      activeView === "knowledge"
        ? buildVaultWorkspaceChatMessage(visualMessage, { artifact: selectedVaultArtifact, vaultRoot: vaultWorkspaceRoot })
        : visualMessage;
    const visibleUserMessage =
      runComposerMode === "image" ? `Create image: ${message || summarizeAttachments(chatAttachments)}` : message || summarizeAttachments(chatAttachments);
    const automaticSkills = resolveAutomaticSkillHints(baseOutgoingMessage, hermesSkills, skillMentions.skills);
    return {
      id: `steer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      sessionId: session.id,
      visibleUserMessage,
      outgoingMessage,
      agentId,
      instructions: joinRunInstructions(buildSkillInstructions([...skillMentions.skills, ...automaticSkills]), buildVisualAssetInstructions(visualAssets)),
      model: chatModel,
      provider: selectedChatLlm.provider,
      permissionMode: chatPermissionMode,
      reasoningEffort: chatReasoningEffort,
      runProfile: activeView === "knowledge" ? null : selectedProfile
    };
  }

  async function sendChatMessage() {
    if (!activeChatSession) return;
    const message = chatDraft.trim();
    if (!message && !chatAttachments.length) return;
    const command = message.toLowerCase();
    const chatRunActive = Boolean(activeChatRunId) || busy === "chat-run";
    if (!chatRunActive && !chatAttachments.length && command === "/new") {
      createChatSessionFromUi();
      return;
    }
    if (!chatRunActive && !chatAttachments.length && (command === "/handoff" || command === "/compact")) {
      setChatDraft("");
      handoffChatSessionFromUi();
      return;
    }
    const submission = createChatSubmission(activeChatSession);
    if (!submission) return;
    setChatDraft("");
    setChatAttachments([]);
    setChatComposerNotice(null);
    setChatComposerMode(null);
    if (chatRunActive) {
      enqueueChatSteer(submission);
      return;
    }
    await runChatSubmission(submission);
  }

  async function runChatSubmission(submission: QueuedChatSteer) {
    const clientSessionId = submission.sessionId;
    const session = chatSessionStateRef.current.sessions.find((candidate) => candidate.id === clientSessionId);
    if (!session) return;
    const priorChatEvents = session.events;
    updateChatSessionEvents(
      clientSessionId,
      (current) => [
        ...current,
        {
          event: "message.user",
          message: submission.visibleUserMessage,
          agentMessage: submission.outgoingMessage !== submission.visibleUserMessage ? submission.outgoingMessage : undefined,
          timestamp: Date.now() / 1000
        }
      ],
      deriveChatSessionTitle(submission.visibleUserMessage)
    );
    setBusy("chat-run");
    let runId: string | null = null;
    let receivedTerminalEvent = false;
    let shouldDrainQueuedSteer = false;
    let controller: AbortController | null = null;
    try {
      const run = await createHermesChatRun(
        session.hermesSessionId ? submission.outgoingMessage : buildHermesChatInput(priorChatEvents, submission.outgoingMessage),
        clientSessionId,
        {
          agentId: submission.agentId,
          hermesSessionId: session.hermesSessionId,
          instructions: submission.instructions,
          model: submission.model,
          provider: submission.provider,
          permissionMode: submission.permissionMode,
          reasoningEffort: submission.reasoningEffort
        }
      );
      runId = run.runId;
      setActiveChatRunId(run.runId);
      updateChatSessionEvents(clientSessionId, (current) => [
        ...current,
        buildAgentRuntimeEvent(run, {
          agentId: submission.agentId,
          model: submission.model,
          provider: submission.provider,
          permissionMode: submission.permissionMode,
          reasoningEffort: submission.reasoningEffort
        })
      ]);
      const runController = new AbortController();
      controller = runController;
      chatAbortRef.current = runController;
      const finishWithTerminalEvent = async (next: HermesChatEvent) => {
        if (receivedTerminalEvent) return;
        receivedTerminalEvent = true;
        shouldDrainQueuedSteer = true;
        if (next.event === "run.completed") await persistChatRunArtifacts(next.run_id, submission.runProfile);
        updateChatSessionEvents(clientSessionId, (current) =>
          next.run_id && hasTerminalEventForRun(current, next.run_id) ? current : [...current, next]
        );
        setActiveChatRunId(null);
        setBusy(null);
        runController.abort();
        void refresh();
        if (activeView === "knowledge") void reloadVaultArtifacts(selectedVaultArtifact?.artifact.path);
      };
      let statusPollError: unknown;
      let eventStreamError: unknown;
      const statusPoll = waitForHermesRunTerminal(run.runId, runController.signal, (next) => {
        updateChatSessionEvents(clientSessionId, (current) =>
          current.some((event) => event.run_id === next.run_id && isStatusPollTimeoutEvent(event)) ? current : [...current, next]
        );
      })
        .then(async (terminalEvent) => {
          if (terminalEvent) await finishWithTerminalEvent(terminalEvent);
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          statusPollError = error;
        });
      await consumeHermesRunEvents(run.runId, runController.signal, (next) => {
        if (isTerminalRunEvent(next)) {
          void finishWithTerminalEvent(next);
          return;
        }
        updateChatSessionEvents(clientSessionId, (current) => [...current, next]);
        if (next.event === "approval.request" && next.run_id) {
          if (submission.permissionMode === "full_access") void approveHermesRun(next.run_id, "session");
          if (submission.permissionMode === "read_only") void approveHermesRun(next.run_id, "deny");
        }
      }).catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError" && receivedTerminalEvent) return;
        eventStreamError = error;
      });
      if (!receivedTerminalEvent && !runController.signal.aborted) {
        await statusPoll;
        if (!receivedTerminalEvent) throw statusPollError ?? eventStreamError;
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        updateChatSessionEvents(clientSessionId, (current) => [
          ...current,
          { event: "run.failed", error: error instanceof Error ? error.message : "chat_run_failed", timestamp: Date.now() / 1000 }
        ]);
      }
      setActiveChatRunId(null);
      setBusy(null);
    } finally {
      if (runId) {
        setActiveChatRunId((current) => (current === runId ? null : current));
        setBusy((current) => (current === "chat-run" ? null : current));
      }
      if (!controller || chatAbortRef.current === controller) chatAbortRef.current = null;
      if (shouldDrainQueuedSteer) drainQueuedChatSteers(clientSessionId);
    }
  }

  async function stopChatRun() {
    if (!activeChatRunId) return;
    await stopHermesRun(activeChatRunId).catch(() => undefined);
    chatAbortRef.current?.abort();
  }

  async function approveChatRun(runId: string, choice: string) {
    await approveHermesRun(runId, choice).catch((error) => {
      if (!activeChatSession) return;
      updateChatSessionEvents(activeChatSession.id, (current) => [
        ...current,
        { event: "approval.error", error: error instanceof Error ? error.message : "approval_failed", timestamp: Date.now() / 1000 }
      ]);
    });
  }

  async function persistChatRunArtifacts(runId: string | undefined, profile: WorkspaceProfile | null): Promise<void> {
    if (!runId || !profile) return;
    await api<PersistHermesRunArtifactsResponse>(`/api/chat/runs/${encodeURIComponent(runId)}/artifacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: profile.platform, profile: profile.profile })
    }).catch(() => undefined);
  }

  function resetChat() {
    createChatSessionFromUi();
  }

  function selectPlatformMode(platform: PlatformId) {
    const normalized = normalizePlatformMode(platform, platforms);
    const nextPlatform = socialPlatformInfo(platforms, normalized);
    setActivePlatform(normalized);
    setActiveView((current) => resolveDashboardViewForPlatform(current, nextPlatform));
  }

  function selectWorkspaceProfile(profile: WorkspaceProfile, nextView: DashboardView) {
    const normalized = normalizePlatformMode(profile.platform, platforms);
    setSelectedProfilesByPlatform((current) => ({ ...current, [normalized]: profile }));
    setActivePlatform(normalized);
    setSelectedProfile(profile);
    setActiveView(resolveDashboardViewForPlatform(nextView, socialPlatformInfo(platforms, normalized)));
  }

  return (
    <TooltipProvider delayDuration={120}>
      <div className="app-shell">
        <aside className="icon-rail" aria-label={t("aria.primaryNavigation")}>
          <PlatformModeSwitcher activePlatform={activePlatformInfo} onSelect={selectPlatformMode} platforms={platforms} />

          {modeSpecificNav.length ? (
            <nav className="rail-nav" aria-label={t("aria.platformTools", { platform: activePlatformInfo.label })}>
              {modeSpecificNav.map((item) => {
                const Icon = item.icon;
                const label = t(item.labelKey);
                return (
                  <Tooltip key={item.id}>
                    <TooltipTrigger asChild>
                      <Button
                        aria-label={label}
                        className={cn("rail-button", activeView === item.id && "rail-button-active")}
                        onClick={() => setActiveView(item.id)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Icon className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </nav>
          ) : null}

          {modeSpecificNav.length ? <div className="rail-divider" /> : null}

          <nav className="rail-nav" aria-label={t("aria.sharedTools")}>
            {sharedNav.map((item) => {
              const Icon = item.icon;
              const label = t(item.labelKey);
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={label}
                      className={cn("rail-button", activeView === item.id && "rail-button-active")}
                      onClick={() => setActiveView(item.id)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Icon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{label}</TooltipContent>
                </Tooltip>
              );
            })}
          </nav>

          <div className="rail-footer">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button aria-label={t("common.refresh")} className="rail-button" onClick={() => void refresh()} size="icon" type="button" variant="ghost">
                  <RefreshCcw className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{t("common.refresh")}</TooltipContent>
            </Tooltip>
          </div>
        </aside>

        <aside className="sub-nav" aria-label={t("aria.subNavigation", { label: activeNavLabel })}>
          <div className="sub-nav-header">
            <div className="sub-nav-header-copy">
              <p>{activeNavLabel}</p>
              <h1>Growth Hacker</h1>
            </div>
            {activeView === "knowledge" || activeView === "chat" ? (
              <Button
                className="sub-nav-header-action"
                disabled={Boolean(activeChatRunId)}
                onClick={resetChat}
                size="sm"
                type="button"
                variant="outline"
              >
                <Plus className="size-3.5" />
                {t("common.new")}
              </Button>
            ) : null}
          </div>
          <Separator />
          <ScrollArea className="sub-nav-scroll">
            {activeView === "workspace" ? (
              <WorkspaceSubNav
                artifacts={visibleArtifacts}
                expandedDirectories={expandedDirectories}
                onOpenArtifact={(artifact) => void openArtifact(artifact)}
                onSelectProfile={(profile) => selectWorkspaceProfile(profile, "workspace")}
                onToggleDirectory={toggleDirectory}
                profileGroups={activeProfileGroups}
                selectedArtifact={selectedArtifact}
                selectedProfile={selectedProfile}
              />
            ) : null}
            {activeView === "knowledge" ? (
              <KnowledgeSubNav
                activeRunId={activeChatRunId}
                activeSession={activeChatSession}
                agents={socialAgents}
                artifacts={visibleVaultArtifacts}
                expandedDirectories={expandedVaultDirectories}
                onDeleteSession={deleteChatSession}
                onHandoffChat={handoffChatSessionFromUi}
                onNewChat={resetChat}
                onOpenArtifact={(artifact) => void openVaultArtifact(artifact)}
                onReferenceCurrent={() => referenceVaultArtifact()}
                onSelectAgent={updateChatSessionAgent}
                onSelectSession={selectChatSession}
                onTabChange={setKnowledgeSubNavTab}
                onToggleDirectory={toggleVaultDirectory}
                selectedAgent={selectedSocialAgent}
                selectedArtifact={selectedVaultArtifact}
                sessions={chatSessionState.sessions}
                tab={knowledgeSubNavTab}
              />
            ) : null}
            {activeView === "published" ? (
              <PublishedPostsSubNav
                onSelectProfile={(profile) => {
                  selectWorkspaceProfile(profile, "published");
                }}
                posts={publishedPosts}
                profileGroups={activeProfileGroups}
                selectedProfile={selectedProfile}
              />
            ) : null}
            {activeView === "replies" ? (
              <AutoRepliesSubNav
                agents={socialCronAgents}
                items={autoReplyItems}
                onSelectAgent={setSocialCronAgentId}
                onSelectProfile={(profile) => {
                  selectWorkspaceProfile(profile, "replies");
                }}
                profileGroups={activeProfileGroups}
                selectedAgentId={socialCronAgentId}
                selectedProfile={selectedProfile}
              />
            ) : null}
            {activeView === "calendar" ? (
              <>
                <CalendarSubNav agents={socialAgents} items={activeSocialCalendarItems} />
                <Separator />
                <CronSubNav
                  agents={socialCronAgents}
                  busy={busy}
                  jobs={activeSocialCronJobs}
                  llmOptions={hermesModelOptions.models}
                  onCreate={() => void createSocialCron()}
                  onSelectLlm={setSelectedLlmValue}
                  selectedAgentId={socialCronAgentId}
                  selectedLlmValue={selectedLlmValue}
                  selectedProfile={selectedProfile}
                  setSchedule={setSocialCronSchedule}
                  setSelectedAgentId={setSocialCronAgentId}
                  setTaskType={setSocialCronTaskType}
                  schedule={socialCronSchedule}
                  taskType={socialCronTaskType}
                  taskTypes={activeSocialCronTaskTypes}
                />
              </>
            ) : null}
            {activeView === "board" ? <BoardSubNav agents={socialAgents} tasks={activeSocialBoardTasks} /> : null}
            {activeView === "chat" ? (
              <ChatSubNav
                activeRunId={activeChatRunId}
                activeSession={activeChatSession}
                agents={socialAgents}
                onDeleteSession={deleteChatSession}
                onHandoffChat={handoffChatSessionFromUi}
                onNewChat={resetChat}
                onSelectAgent={updateChatSessionAgent}
                onSelectSession={selectChatSession}
                selectedAgent={selectedSocialAgent}
                sessions={chatSessionState.sessions}
              />
            ) : null}
            {activeView === "hermes" ? (
              <HermesContextSubNav context={hermesContext} onSelectSession={selectHermesContextSession} />
            ) : null}
            {activeView === "skills" ? (
              <SkillsSubNav
                agents={socialAgents}
                onSelectAgent={setSocialCronAgentId}
                selectedAgent={selectedSocialAgent}
                skills={hermesSkills}
              />
            ) : null}
            {activeView === "setup" ? <SetupSubNav auth={auth} hermes={hermes} openclaw={openclaw} /> : null}
          </ScrollArea>
        </aside>

        <main className="main-panel">
          <header className="topbar">
            <div>
              <p className="text-xs font-medium text-muted-foreground">{topbarEyebrow}</p>
              {(activeView === "chat" || activeView === "knowledge") && activeChatSession ? (
                <input
                  aria-label={t("aria.sessionName")}
                  className="topbar-title-input"
                  onChange={(event) => renameChatSession(activeChatSession.id, event.target.value)}
                  placeholder={t("common.newSession")}
                  value={activeChatSession.title}
                />
              ) : (
                <h2 className="text-xl font-semibold tracking-normal">{topbarTitle}</h2>
              )}
            </div>
            <div className="topbar-actions">
              <LanguageSwitcher locale={locale} localeOptions={localeOptions} onLocaleChange={setLocale} />
              <ChatConnectionStatus className="topbar-connection-status" status={hermesChatStatus} />
              <StatusBadge state={platformCliBadgeState(activePlatformInfo)} label={platformCliBadgeLabel(activePlatformInfo, t)} />
              <Button onClick={() => void refresh()} size="sm" type="button" variant="outline">
                <RefreshCcw className="size-3.5" />
                {t("common.refresh")}
              </Button>
            </div>
          </header>

          <ScrollArea className="main-scroll">
            <div className={cn("main-content", activeView === "chat" && "main-content-chat", activeView === "knowledge" && "main-content-knowledge")}>
              {activeView === "workspace" ? (
                <WorkspaceView
                  activePlatform={activePlatform}
                  activeRunId={activeYoutubeVideoRunId}
                  busy={busy}
                  newProfileName={newWorkspaceProfileName}
                  notice={youtubeVideoNotice}
                  onCreateProfile={() => void createWorkspaceProfileFromUi()}
                  onGenerateVideo={() => void startYoutubeVideoRun()}
                  onNewProfileNameChange={setNewWorkspaceProfileName}
                  onStopVideo={() => void stopYoutubeVideoRun()}
                  onVideoDraftChange={setYoutubeVideoDraft}
                  selectedArtifact={selectedArtifact}
                  selectedProfile={selectedProfile}
                  videoDraft={youtubeVideoDraft}
                />
              ) : null}

              {activeView === "knowledge" ? (
                <KnowledgeView
                  activeRunId={activeChatRunId}
                  attachments={chatAttachments}
                  composerMode={chatComposerMode}
                  composerNotice={chatComposerNotice}
                  draft={chatDraft}
                  events={chatEvents}
                  model={chatModel}
                  modelOptions={hermesModelOptions.models}
                  modelValue={chatLlmValue}
                  onApprove={(runId, choice) => void approveChatRun(runId, choice)}
                  onAttachFiles={(files) => void attachChatFiles(files)}
                  onComposerModeChange={setChatComposerMode}
                  onDraftChange={setChatDraft}
                  onModelChange={setChatLlmValue}
                  onPermissionModeChange={setChatPermissionMode}
                  onReasoningEffortChange={setChatReasoningEffort}
                  onReferenceCurrent={() => referenceVaultArtifact()}
                  onRemoveAttachment={removeChatAttachment}
                  onSend={() => void sendChatMessage()}
                  onStop={() => void stopChatRun()}
                  permissionMode={chatPermissionMode}
                  queuedSteerCount={queuedChatSteerCount}
                  reasoningEffort={chatReasoningEffort}
                  runPending={busy === "chat-run"}
                  selectedAgent={selectedSocialAgent}
                  selectedArtifact={selectedVaultArtifact}
                  skills={hermesSkills}
                  status={hermesChatStatus}
                />
              ) : null}

              {activeView === "published" ? (
                <PublishedPostsView
                  busy={busy}
                  notice={publishedSyncNotice}
                  onSearchChange={setPublishedSearch}
                  onStatusFilterChange={setPublishedStatusFilter}
                  onSync={() => void syncPublishedPosts()}
                  onUpdate={(post, patch) => void updatePublishedPost(post, patch)}
                  posts={publishedPosts}
                  search={publishedSearch}
                  selectedProfile={selectedProfile}
                  statusFilter={publishedStatusFilter}
                />
              ) : null}

              {activeView === "replies" ? (
                <AutoRepliesView
                  agents={socialCronAgents}
                  busy={busy}
                  items={autoReplyItems}
                  llmOptions={hermesModelOptions.models}
                  notice={autoReplyNotice}
                  onRun={() => void runAutoReplies()}
                  onSaveSettings={() => void saveAutoReplySettings()}
                  onSelectAgent={setSocialCronAgentId}
                  onSelectLlm={setSelectedLlmValue}
                  onSettingsChange={setAutoReplySettings}
                  onSync={() => void syncAutoReplies()}
                  onUpdateItem={(item, patch) => void updateAutoReplyItem(item, patch)}
                  selectedAgentId={socialCronAgentId}
                  selectedLlmValue={selectedLlmValue}
                  selectedProfile={selectedProfile}
                  settings={autoReplySettings}
                />
              ) : null}

              {activeView === "calendar" ? (
                <CalendarScheduleView
                  busy={busy}
                  items={activeSocialCalendarItems}
                  jobs={activeSocialCronJobs}
                  onDelete={(job) => void deleteSocialCron(job)}
                  onRun={(job) => void runSocialCron(job)}
                  onThisWeek={() => {
                    setCalendarWeekWasChanged(true);
                    setCalendarWeekStartDate(startOfWeek(new Date()));
                  }}
                  onToggle={(job) => void toggleSocialCron(job)}
                  onNextWeek={() => {
                    setCalendarWeekWasChanged(true);
                    setCalendarWeekStartDate((current) => addDays(current, 7));
                  }}
                  onPreviousWeek={() => {
                    setCalendarWeekWasChanged(true);
                    setCalendarWeekStartDate((current) => addDays(current, -7));
                  }}
                  weekStart={calendarWeekStartDate}
                />
              ) : null}

              {activeView === "board" ? (
                <BoardView
                  busy={busy}
                  onOpenSession={(task) => void openSocialBoardTaskSession(task)}
                  onRun={(task) => void runSocialBoardTask(task)}
                  selectedJob={selectedJob}
                  tasks={activeSocialBoardTasks}
                />
              ) : null}

              {activeView === "chat" ? (
                <ChatView
                  activeRunId={activeChatRunId}
                  attachments={chatAttachments}
                  composerMode={chatComposerMode}
                  composerNotice={chatComposerNotice}
                  draft={chatDraft}
                  events={chatEvents}
                  model={chatModel}
                  modelOptions={hermesModelOptions.models}
                  modelValue={chatLlmValue}
                  onAttachFiles={(files) => void attachChatFiles(files)}
                  onApprove={(runId, choice) => void approveChatRun(runId, choice)}
                  onDraftChange={setChatDraft}
                  onComposerModeChange={setChatComposerMode}
                  onModelChange={setChatLlmValue}
                  onPermissionModeChange={setChatPermissionMode}
                  onReasoningEffortChange={setChatReasoningEffort}
                  onRemoveAttachment={removeChatAttachment}
                  onSend={() => void sendChatMessage()}
                  onStop={() => void stopChatRun()}
                  permissionMode={chatPermissionMode}
                  queuedSteerCount={queuedChatSteerCount}
                  reasoningEffort={chatReasoningEffort}
                  runPending={busy === "chat-run"}
                  selectedAgent={selectedSocialAgent}
                  skills={hermesSkills}
                  status={hermesChatStatus}
                />
              ) : null}

              {activeView === "hermes" ? (
                <HermesContextView
                  context={hermesContext}
                  onRefresh={() => void reloadHermesContext()}
                  onReference={referenceHermesContext}
                  onSelectSession={selectHermesContextSession}
                />
              ) : null}

              {activeView === "skills" ? (
                <SkillsView
                  agent={selectedSocialAgent}
                  busy={busy}
                  onRefresh={() => void reloadHermesSkills()}
                  onSearchChange={setSkillSearch}
                  onToggle={(skill) => void toggleHermesSkill(skill)}
                  search={skillSearch}
                  skills={hermesSkills}
                />
              ) : null}

              {activeView === "setup" ? (
                <SetupView
                  auth={auth}
                  busy={busy}
                  hermes={hermes}
                  hermesVideoAuth={hermesVideoAuth}
                  hermesVideoAuthUrl={hermesVideoAuthUrl}
                  job={selectedRuntimeJob}
                  migration={migration}
                  onActivateHermesVideoAuth={() => void activateHermesVideoAuth()}
                  onBootstrap={() => void bootstrap()}
                  onLogin={(mode) => void login(mode)}
                  onOpenHermesVideoAuthUrl={() => {
                    if (hermesVideoAuthUrl) window.open(hermesVideoAuthUrl, "_blank", "noopener,noreferrer");
                  }}
                  onRunMigration={() => void runMigration()}
                  openclaw={openclaw}
                />
              ) : null}
            </div>
          </ScrollArea>
        </main>
      </div>
    </TooltipProvider>
  );
}

function LanguageSwitcher({
  locale,
  localeOptions,
  onLocaleChange
}: {
  locale: I18nLocale;
  localeOptions: I18nLocale[];
  onLocaleChange: (locale: I18nLocale) => void;
}) {
  const { t } = useI18n();
  return (
    <Select onValueChange={(value) => onLocaleChange(value as I18nLocale)} value={locale}>
      <SelectTrigger aria-label={t("language.label")} className="language-select" size="sm">
        <Languages className="size-3.5" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {localeOptions.map((option) => (
          <SelectItem key={option} value={option}>
            {languageLabel(option, t)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PlatformModeSwitcher({
  activePlatform,
  onSelect,
  platforms
}: {
  activePlatform: SocialPlatformInfo;
  onSelect: (platform: PlatformId) => void;
  platforms: SocialPlatformInfo[];
}) {
  const { t } = useI18n();
  return (
    <DropdownMenuPrimitive.Root>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuPrimitive.Trigger asChild>
            <button
              aria-label={t("platform.switchModeCurrent", { platform: activePlatform.label })}
              className="rail-mode-trigger"
              type="button"
            >
              <PlatformLogo className="rail-mode-logo" platform={activePlatform} />
              <ChevronDown className="rail-mode-chevron" />
            </button>
          </DropdownMenuPrimitive.Trigger>
        </TooltipTrigger>
        <TooltipContent side="right">{t("platform.switchMode")}</TooltipContent>
      </Tooltip>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content align="start" className="mode-menu" side="right" sideOffset={8}>
          {platforms.map((platform) => (
            <DropdownMenuPrimitive.Item
              className="mode-menu-item"
              key={platform.id}
              onSelect={() => onSelect(platform.id)}
              textValue={platform.label}
            >
              <span className="mode-menu-mark">
                <PlatformLogo platform={platform} />
              </span>
              <span className="mode-menu-copy">
                <span>{platform.label}</span>
                <small>{platformCliDetail(platform, t)}</small>
              </span>
              {platform.id === activePlatform.id ? <CheckCircle2 className="mode-menu-check" /> : null}
            </DropdownMenuPrimitive.Item>
          ))}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

function PlatformLogo({ className, platform }: { className?: string; platform: SocialPlatformInfo }) {
  const [failed, setFailed] = useState(false);
  const src = platformLogoSrc(platform.id);
  if (!src || failed) {
    return <span className={cn("platform-logo-fallback", className)}>{platform.shortLabel}</span>;
  }
  return <img alt="" className={cn("platform-logo", className)} onError={() => setFailed(true)} src={src} />;
}

function WorkspaceSubNav({
  artifacts,
  expandedDirectories,
  onOpenArtifact,
  onSelectProfile,
  onToggleDirectory,
  profileGroups,
  selectedArtifact,
  selectedProfile
}: {
  artifacts: ArtifactTreeRow[];
  expandedDirectories: Set<string>;
  onOpenArtifact: (artifact: ArtifactInfo) => void;
  onSelectProfile: (profile: WorkspaceProfile) => void;
  onToggleDirectory: (path: string) => void;
  profileGroups: Record<string, WorkspaceProfile[]>;
  selectedArtifact: ArtifactContent | null;
  selectedProfile: WorkspaceProfile | null;
}) {
  const { t } = useI18n();
  return (
    <div className="sub-nav-body">
      <SectionLabel icon={Folder} label={t("section.workspaces")} />
      {Object.entries(profileGroups).map(([platform, items]) => (
        <div className="space-y-1" key={platform}>
          <p className="sub-nav-group-label">{platformLabel[platform] ?? platform}</p>
          {items.map((profile) => (
            <button
              className={cn("sub-nav-row", isSelectedWorkspace(selectedProfile, profile) && "sub-nav-row-active")}
              key={`${profile.platform}/${profile.profile}`}
              onClick={() => onSelectProfile(profile)}
              type="button"
            >
              <span className="truncate">{profile.profile}</span>
              <Badge variant="outline">{profile.artifactCount}</Badge>
            </button>
          ))}
        </div>
      ))}
      {!Object.keys(profileGroups).length ? <EmptyCompact label={t("empty.noProfiles")} /> : null}

      <Separator />

      <SectionLabel icon={FileText} label={t("section.artifacts")} />
      <div className="space-y-1">
        {artifacts.map(({ node, depth }) => {
          const artifact = node.artifact;
          const isDirectory = artifact.kind === "directory";
          const isExpanded = isDirectory && expandedDirectories.has(artifact.path);
          const isSelected = selectedArtifact?.artifact.path === artifact.path;
          const ArtifactIcon = isDirectory ? Folder : artifact.mime === "image" ? ImageIcon : artifact.mime === "video" ? Video : FileText;
          return (
            <button
              aria-expanded={isDirectory ? isExpanded : undefined}
              className={cn("artifact-nav-row", isSelected && "sub-nav-row-active")}
              key={artifact.path}
              onClick={() => (isDirectory ? onToggleDirectory(artifact.path) : onOpenArtifact(artifact))}
              style={{ paddingLeft: 8 + depth * 14 }}
              title={artifact.path}
              type="button"
            >
              {isDirectory ? (
                isExpanded ? (
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                )
              ) : (
                <span className="size-3.5 shrink-0" />
              )}
              <ArtifactIcon className="size-3.5 shrink-0" />
              <span className="truncate">{artifact.name}</span>
            </button>
          );
        })}
      </div>
      {!artifacts.length ? <EmptyCompact label={t("empty.noArtifacts")} /> : null}
    </div>
  );
}

function KnowledgeSubNav({
  activeRunId,
  activeSession,
  agents,
  artifacts,
  expandedDirectories,
  onDeleteSession,
  onHandoffChat,
  onNewChat,
  onOpenArtifact,
  onReferenceCurrent,
  onSelectAgent,
  onSelectSession,
  onTabChange,
  onToggleDirectory,
  selectedAgent,
  selectedArtifact,
  sessions,
  tab
}: {
  activeRunId: string | null;
  activeSession?: ChatSession;
  agents: SocialAgent[];
  artifacts: ArtifactTreeRow[];
  expandedDirectories: Set<string>;
  onDeleteSession: (sessionId: string) => void;
  onHandoffChat: () => void;
  onNewChat: () => void;
  onOpenArtifact: (artifact: ArtifactInfo) => void;
  onReferenceCurrent: () => void;
  onSelectAgent: (agentId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onTabChange: (tab: KnowledgeSubNavTab) => void;
  onToggleDirectory: (path: string) => void;
  selectedAgent?: SocialAgent;
  selectedArtifact: ArtifactContent | null;
  sessions: ChatSession[];
  tab: KnowledgeSubNavTab;
}) {
  const { t } = useI18n();
  return (
    <div className="sub-nav-body">
      <div className="sub-nav-tabs" role="tablist" aria-label={t("aria.subNavigation", { label: t("nav.knowledge") })}>
        <button
          aria-selected={tab === "explorer"}
          className={cn("sub-nav-tab", tab === "explorer" && "sub-nav-tab-active")}
          onClick={() => onTabChange("explorer")}
          role="tab"
          type="button"
        >
          <Folder className="size-3.5" />
          {t("knowledge.tabs.explorer")}
        </button>
        <button
          aria-selected={tab === "sessions"}
          className={cn("sub-nav-tab", tab === "sessions" && "sub-nav-tab-active")}
          onClick={() => onTabChange("sessions")}
          role="tab"
          type="button"
        >
          <Archive className="size-3.5" />
          {t("knowledge.tabs.sessions")}
        </button>
      </div>

      {tab === "explorer" ? (
        <VaultExplorerPanel
          artifacts={artifacts}
          expandedDirectories={expandedDirectories}
          onOpenArtifact={onOpenArtifact}
          onReferenceCurrent={onReferenceCurrent}
          onToggleDirectory={onToggleDirectory}
          selectedArtifact={selectedArtifact}
        />
      ) : (
        <ChatSessionsPanel
          activeRunId={activeRunId}
          activeSession={activeSession}
          agents={agents}
          onDeleteSession={onDeleteSession}
          onHandoffChat={onHandoffChat}
          onNewChat={onNewChat}
          onSelectAgent={onSelectAgent}
          onSelectSession={onSelectSession}
          selectedAgent={selectedAgent}
          sessions={sessions}
        />
      )}
    </div>
  );
}

function VaultExplorerPanel({
  artifacts,
  expandedDirectories,
  onOpenArtifact,
  onReferenceCurrent,
  onToggleDirectory,
  selectedArtifact
}: {
  artifacts: ArtifactTreeRow[];
  expandedDirectories: Set<string>;
  onOpenArtifact: (artifact: ArtifactInfo) => void;
  onReferenceCurrent: () => void;
  onToggleDirectory: (path: string) => void;
  selectedArtifact: ArtifactContent | null;
}) {
  const { t } = useI18n();
  return (
    <>
      <SectionLabel icon={Bookmark} label={t("section.vault")} />
      <MetricRow label={t("section.root")} value={vaultWorkspaceRoot} />
      <MetricRow label={t("section.files")} value={String(artifacts.filter(({ node }) => node.artifact.kind === "file").length)} />
      <Button className="w-full justify-start" disabled={!selectedArtifact?.content} onClick={onReferenceCurrent} type="button" variant="outline">
        <FileText className="size-3.5" />
        {t("knowledge.referenceCurrentNote")}
      </Button>

      <Separator />

      <SectionLabel icon={Folder} label={t("section.explorer")} />
      <div className="space-y-1">
        {artifacts.map(({ node, depth }) => {
          const artifact = node.artifact;
          const isDirectory = artifact.kind === "directory";
          const isExpanded = isDirectory && expandedDirectories.has(artifact.path);
          const isSelected = selectedArtifact?.artifact.path === artifact.path;
          const ArtifactIcon = isDirectory ? Folder : artifact.mime === "image" ? ImageIcon : artifact.mime === "video" ? Video : FileText;
          return (
            <button
              aria-expanded={isDirectory ? isExpanded : undefined}
              className={cn("artifact-nav-row", isSelected && "sub-nav-row-active")}
              key={artifact.path}
              onClick={() => (isDirectory ? onToggleDirectory(artifact.path) : onOpenArtifact(artifact))}
              style={{ paddingLeft: 8 + depth * 14 }}
              title={artifact.path}
              type="button"
            >
              {isDirectory ? (
                isExpanded ? (
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                )
              ) : (
                <span className="size-3.5 shrink-0" />
              )}
              <ArtifactIcon className="size-3.5 shrink-0" />
              <span className="truncate">{artifact.name}</span>
            </button>
          );
        })}
      </div>
      {!artifacts.length ? <EmptyCompact label={t("empty.noVaultFiles")} /> : null}
    </>
  );
}

function PublishedPostsSubNav({
  onSelectProfile,
  posts,
  profileGroups,
  selectedProfile
}: {
  onSelectProfile: (profile: WorkspaceProfile) => void;
  posts: XhsPublishedPost[];
  profileGroups: Record<string, WorkspaceProfile[]>;
  selectedProfile: WorkspaceProfile | null;
}) {
  const { t } = useI18n();
  const xhsProfiles = profileGroups.xiaohongshu ?? [];
  const totalEngagement = posts.reduce(
    (sum, post) => sum + (post.stats.likes ?? 0) + (post.stats.collects ?? 0) + (post.stats.comments ?? 0),
    0
  );
  return (
    <div className="sub-nav-body">
      <SectionLabel icon={ImageIcon} label={t("section.xhsProfiles")} />
      {xhsProfiles.map((profile) => (
        <button
          className={cn("sub-nav-row", isSelectedWorkspace(selectedProfile, profile) && "sub-nav-row-active")}
          key={`${profile.platform}/${profile.profile}`}
          onClick={() => onSelectProfile(profile)}
          type="button"
        >
          <span className="truncate">{profile.profile}</span>
          <Badge variant="outline">{profile.artifactCount}</Badge>
        </button>
      ))}
      {!xhsProfiles.length ? <EmptyCompact label={t("empty.noXhsProfiles")} /> : null}

      <Separator />

      <SectionLabel icon={Gauge} label={t("section.published")} />
      <MetricRow label={t("section.posts")} value={String(posts.length)} />
      <MetricRow label={t("section.engagement")} value={formatCompactNumber(totalEngagement)} />
      <MetricRow label={t("section.needsReview")} value={String(posts.filter((post) => post.status === "needs-review").length)} />
      <MetricRow label={t("section.archived")} value={String(posts.filter((post) => post.status === "archived").length)} />
    </div>
  );
}

function AutoRepliesSubNav({
  agents,
  items,
  onSelectAgent,
  onSelectProfile,
  profileGroups,
  selectedAgentId,
  selectedProfile
}: {
  agents: string[];
  items: XhsAutoReplyItem[];
  onSelectAgent: (agentId: string) => void;
  onSelectProfile: (profile: WorkspaceProfile) => void;
  profileGroups: Record<string, WorkspaceProfile[]>;
  selectedAgentId: string;
  selectedProfile: WorkspaceProfile | null;
}) {
  const { t } = useI18n();
  const xhsProfiles = profileGroups.xiaohongshu ?? [];
  return (
    <div className="sub-nav-body">
      <SectionLabel icon={Reply} label={t("section.xhsProfiles")} />
      {xhsProfiles.map((profile) => (
        <button
          className={cn("sub-nav-row", isSelectedWorkspace(selectedProfile, profile) && "sub-nav-row-active")}
          key={`${profile.platform}/${profile.profile}`}
          onClick={() => onSelectProfile(profile)}
          type="button"
        >
          <span className="truncate">{profile.profile}</span>
          <Badge variant="outline">{profile.artifactCount}</Badge>
        </button>
      ))}
      {!xhsProfiles.length ? <EmptyCompact label={t("empty.noXhsProfiles")} /> : null}

      <Separator />

      <SectionLabel icon={Bot} label={t("section.agent")} />
      <Select disabled={!agents.length} onValueChange={onSelectAgent} value={selectedAgentId}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t("common.agent")} />
        </SelectTrigger>
        <SelectContent>
          {agents.map((agent) => (
            <SelectItem key={agent} value={agent}>
              {agent}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Separator />

      <SectionLabel icon={Gauge} label={t("section.queue")} />
      <MetricRow label={t("section.pending")} value={String(items.filter((item) => item.status === "pending").length)} />
      <MetricRow label={t("section.drafted")} value={String(items.filter((item) => item.status === "drafted").length)} />
      <MetricRow label={t("section.needsReview")} value={String(items.filter((item) => item.status === "needs-review").length)} />
      <MetricRow label={t("section.sent")} value={String(items.filter((item) => item.status === "sent").length)} />
    </div>
  );
}

function CalendarSubNav({ agents, items }: { agents: SocialAgent[]; items: SocialTaskCalendarItem[] }) {
  const { t } = useI18n();
  const scheduled = items.filter((item) => item.source === "cron").length;
  const board = items.filter((item) => item.source === "board").length;
  return (
    <div className="sub-nav-body">
      <SectionLabel icon={CalendarClock} label={t("section.queue")} />
      <MetricRow label={t("section.scheduled")} value={String(scheduled)} />
      <MetricRow label={t("section.board")} value={String(board)} />
      <Separator />
      <SectionLabel icon={Bot} label={t("section.agents")} />
      <AgentList agents={agents} />
    </div>
  );
}

function BoardSubNav({ agents, tasks }: { agents: SocialAgent[]; tasks: SocialBoardTask[] }) {
  const { t } = useI18n();
  return (
    <div className="sub-nav-body">
      <SectionLabel icon={Gauge} label={t("section.lanes")} />
      {boardStatuses.map((status) => (
        <MetricRow key={status} label={t(boardStatusLabelKey[status])} value={String(tasks.filter((task) => task.status === status).length)} />
      ))}
      <Separator />
      <SectionLabel icon={Bot} label={t("section.agents")} />
      <AgentList agents={agents} />
    </div>
  );
}

function LlmModelSelect({
  disabled,
  onChange,
  options,
  triggerClassName,
  value
}: {
  disabled?: boolean;
  onChange: (value: string) => void;
  options: HermesModelOption[];
  triggerClassName?: string;
  value: string;
}) {
  const { t } = useI18n();
  return (
    <Select disabled={disabled || !options.length} onValueChange={onChange} value={value}>
      <SelectTrigger className={triggerClassName ?? "w-full"}>
        <Zap className="size-3.5" />
        <SelectValue placeholder={t("cron.llmModel")} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CronSubNav({
  agents,
  busy,
  jobs,
  llmOptions,
  onCreate,
  onSelectLlm,
  schedule,
  selectedAgentId,
  selectedLlmValue,
  selectedProfile,
  setSchedule,
  setSelectedAgentId,
  setTaskType,
  taskType,
  taskTypes
}: {
  agents: string[];
  busy: string | null;
  jobs: SocialCronJob[];
  llmOptions: HermesModelOption[];
  onCreate: () => void;
  onSelectLlm: (value: string) => void;
  schedule: string;
  selectedAgentId: string;
  selectedLlmValue: string;
  selectedProfile: WorkspaceProfile | null;
  setSchedule: (value: string) => void;
  setSelectedAgentId: (value: string) => void;
  setTaskType: (value: SocialCronTaskType) => void;
  taskType: SocialCronTaskType;
  taskTypes: SocialCronTaskType[];
}) {
  const { t } = useI18n();
  return (
    <div className="sub-nav-body">
      <SectionLabel icon={CalendarClock} label={t("section.newSchedule")} />
      <div className="space-y-2">
        <Select onValueChange={setSelectedAgentId} value={selectedAgentId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("common.agent")} />
          </SelectTrigger>
          <SelectContent>
            {agents.map((agentId) => (
              <SelectItem key={agentId} value={agentId}>
                {agentId}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select disabled={!taskTypes.length} onValueChange={(value) => setTaskType(value as SocialCronTaskType)} value={taskType}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Task" />
          </SelectTrigger>
          <SelectContent>
            {taskTypes.map((nextTaskType) => (
              <SelectItem key={nextTaskType} value={nextTaskType}>
                {t(socialCronTaskLabelKey[nextTaskType])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <LlmModelSelect
          disabled={!llmOptions.length}
          onChange={onSelectLlm}
          options={llmOptions}
          value={selectedLlmValue}
        />
        <Input onChange={(event) => setSchedule(event.target.value)} placeholder="daily 09:00" value={schedule} />
        <Button className="w-full" disabled={!selectedProfile || !taskTypes.length || busy === "social-cron-create"} onClick={onCreate} type="button">
          {busy === "social-cron-create" ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-4" />}
          {t("common.schedule")}
        </Button>
        {!taskTypes.length ? <EmptyCompact label={t("empty.noCliTasks")} /> : null}
      </div>
      <Separator />
      <SectionLabel icon={RefreshCcw} label={t("section.jobs")} />
      {jobs.map((job) => (
        <button className="sub-nav-row" key={job.id} title={job.name} type="button">
          <span className="truncate">{job.name}</span>
          <StatusBadge state={job.enabled ? "ok" : "warn"} label={job.llm?.model ?? (job.enabled ? "on" : "off")} />
        </button>
      ))}
      {!jobs.length ? <EmptyCompact label={t("empty.noCronJobs")} /> : null}
    </div>
  );
}

function ChatSubNav({
  activeRunId,
  activeSession,
  agents,
  onDeleteSession,
  onHandoffChat,
  onNewChat,
  onSelectAgent,
  onSelectSession,
  selectedAgent,
  sessions
}: {
  activeRunId: string | null;
  activeSession?: ChatSession;
  agents: SocialAgent[];
  onDeleteSession: (sessionId: string) => void;
  onHandoffChat: () => void;
  onNewChat: () => void;
  onSelectAgent: (agentId: string) => void;
  onSelectSession: (sessionId: string) => void;
  selectedAgent?: SocialAgent;
  sessions: ChatSession[];
}) {
  const { t } = useI18n();
  return (
    <div className="sub-nav-body">
      <ChatSessionsPanel
        activeRunId={activeRunId}
        activeSession={activeSession}
        agents={agents}
        onDeleteSession={onDeleteSession}
        onHandoffChat={onHandoffChat}
        onNewChat={onNewChat}
        onSelectAgent={onSelectAgent}
        onSelectSession={onSelectSession}
        selectedAgent={selectedAgent}
        sessions={sessions}
      />
    </div>
  );
}

function ChatSessionsPanel({
  activeRunId,
  activeSession,
  agents,
  onDeleteSession,
  onHandoffChat,
  onNewChat,
  onSelectAgent,
  onSelectSession,
  selectedAgent,
  sessions
}: {
  activeRunId: string | null;
  activeSession?: ChatSession;
  agents: SocialAgent[];
  onDeleteSession: (sessionId: string) => void;
  onHandoffChat: () => void;
  onNewChat: () => void;
  onSelectAgent: (agentId: string) => void;
  onSelectSession: (sessionId: string) => void;
  selectedAgent?: SocialAgent;
  sessions: ChatSession[];
}) {
  const { t } = useI18n();
  return (
    <>
      <Button className="w-full justify-start" disabled={Boolean(activeRunId)} onClick={onNewChat} type="button" variant="outline">
        <Plus className="size-3.5" />
        {t("common.newSession")}
      </Button>
      <Button
        className="w-full justify-start"
        disabled={Boolean(activeRunId) || !activeSession || countChatSessionMessages(activeSession) === 0}
        onClick={onHandoffChat}
        type="button"
        variant="outline"
      >
        <Copy className="size-3.5" />
        {t("chat.handoff")}
      </Button>

      {agents.length > 1 ? (
        <div className="chat-session-agent">
          <span>{t("common.agent")}</span>
          <Select disabled={Boolean(activeRunId)} onValueChange={onSelectAgent} value={selectedAgent?.id}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("common.selectAgent")} />
            </SelectTrigger>
            <SelectContent>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <SectionLabel icon={Archive} label={t("section.sessions")} />
      <div className="chat-session-list">
        {sessions.map((session) => {
          const isActive = activeSession?.id === session.id;
          return (
            <div className={cn("chat-session-row", isActive && "sub-nav-row-active")} key={session.id}>
              <button
                aria-current={isActive ? "page" : undefined}
                className="chat-session-select"
                disabled={Boolean(activeRunId) && !isActive}
                onClick={() => onSelectSession(session.id)}
                type="button"
              >
                <span>{displayChatSessionTitle(session, t)}</span>
              </button>
              <Button
                aria-label={`${t("common.delete")} ${displayChatSessionTitle(session, t)}`}
                className="chat-session-delete"
                disabled={Boolean(activeRunId)}
                onClick={() => onDeleteSession(session.id)}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          );
        })}
      </div>
      {!sessions.length ? <EmptyCompact label={t("empty.noSessions")} /> : null}
    </>
  );
}

function HermesContextSubNav({
  context,
  onSelectSession
}: {
  context: HermesContextSnapshot | null;
  onSelectSession: (sessionId: string) => void;
}) {
  const { locale, t } = useI18n();
  return (
    <div className="sub-nav-body">
      <SectionLabel icon={Activity} label={t("section.hermesSessions")} />
      <MetricRow label={t("hermes.stateDb")} value={context?.available.stateDb ? t("common.ready") : t("common.missing")} />
      <MetricRow label={t("hermes.gatewayLog")} value={context?.available.gatewayLog ? t("common.ready") : t("common.missing")} />
      <Separator />
      {context?.sessions.length ? (
        context.sessions.map((session) => (
          <button
            className={cn("sub-nav-row", context.selectedSessionId === session.id && "sub-nav-row-active")}
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            title={session.id}
            type="button"
          >
            <span className="truncate">{session.id}</span>
            <StatusBadge state={session.endReason ? "warn" : "ok"} label={session.source} />
          </button>
        ))
      ) : (
        <EmptyCompact label={t("empty.noHermesContext")} />
      )}
      {context?.generatedAt ? <MetricRow label={t("section.latest")} value={formatDateTime(context.generatedAt, locale)} /> : null}
    </div>
  );
}

function SkillsSubNav({
  agents,
  onSelectAgent,
  selectedAgent,
  skills
}: {
  agents: SocialAgent[];
  onSelectAgent: (agentId: string) => void;
  selectedAgent?: SocialAgent;
  skills: HermesSkillInfo[];
}) {
  const { t } = useI18n();
  const enabled = skills.filter((skill) => skill.enabled).length;
  const categories = new Set(skills.map((skill) => skill.category || "uncategorized")).size;
  return (
    <div className="sub-nav-body">
      <SectionLabel icon={Bot} label={t("section.agents")} />
      <AgentList agents={agents} onSelectAgent={onSelectAgent} selectedAgent={selectedAgent} />
      <Separator />
      <SectionLabel icon={Gauge} label={t("section.inventory")} />
      <MetricRow label={t("common.enabled")} value={String(enabled)} />
      <MetricRow label={t("common.disabled")} value={String(skills.length - enabled)} />
      <MetricRow label={t("common.categories")} value={String(categories)} />
    </div>
  );
}

function SetupSubNav({ auth, hermes, openclaw }: { auth: XhsAuthStatus | null; hermes?: RuntimeStatus; openclaw?: RuntimeStatus }) {
  const { t } = useI18n();
  return (
    <div className="sub-nav-body">
      <SectionLabel icon={Activity} label={t("section.runtimes")} />
      <RuntimeLine runtime={hermes} label="Hermes" />
      <RuntimeLine runtime={openclaw} label="OpenClaw" />
      <Separator />
      <SectionLabel icon={KeyRound} label="XHS CLI" />
      <MetricRow label={t("setup.installed")} value={auth?.installed ? t("common.yes") : t("common.no")} />
      <MetricRow label={t("setup.scope")} value={auth?.scope ?? t("common.global")} />
      <MetricRow label={t("setup.state")} value={xhsAuthStateValue(auth, t)} />
      <MetricRow label={t("setup.signedIn")} value={xhsSignedInValue(auth, t)} />
      <MetricRow label={t("setup.account")} value={xhsAccountValue(auth, t)} />
    </div>
  );
}

function KnowledgeView({
  activeRunId,
  attachments,
  composerMode,
  composerNotice,
  draft,
  events,
  model,
  modelOptions,
  modelValue,
  onApprove,
  onAttachFiles,
  onComposerModeChange,
  onDraftChange,
  onModelChange,
  onPermissionModeChange,
  onReasoningEffortChange,
  onReferenceCurrent,
  onRemoveAttachment,
  onSend,
  onStop,
  permissionMode,
  queuedSteerCount,
  reasoningEffort,
  runPending,
  selectedAgent,
  selectedArtifact,
  skills,
  status
}: {
  activeRunId: string | null;
  attachments: ChatAttachment[];
  composerMode: ChatComposerMode;
  composerNotice: string | null;
  draft: string;
  events: HermesChatEvent[];
  model: string;
  modelOptions: HermesModelOption[];
  modelValue: string;
  onApprove: (runId: string, choice: string) => void;
  onAttachFiles: (files: FileList | null) => void;
  onComposerModeChange: (mode: ChatComposerMode) => void;
  onDraftChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onPermissionModeChange: (value: ChatPermissionMode) => void;
  onReasoningEffortChange: (value: ChatReasoningEffort) => void;
  onReferenceCurrent: () => void;
  onRemoveAttachment: (id: string) => void;
  onSend: () => void;
  onStop: () => void;
  permissionMode: ChatPermissionMode;
  queuedSteerCount: number;
  reasoningEffort: ChatReasoningEffort;
  runPending: boolean;
  selectedAgent?: SocialAgent;
  selectedArtifact: ArtifactContent | null;
  skills: HermesSkillInfo[];
  status: HermesChatStatus | null;
}) {
  const { t } = useI18n();
  return (
    <div className="knowledge-workbench">
      <section className="knowledge-chat-pane" aria-label={t("knowledge.vaultAgentChat")}>
        <ChatView
          activeRunId={activeRunId}
          attachments={attachments}
          composerMode={composerMode}
          composerNotice={composerNotice}
          draft={draft}
          events={events}
          model={model}
          modelOptions={modelOptions}
          modelValue={modelValue}
          onApprove={onApprove}
          onAttachFiles={onAttachFiles}
          onComposerModeChange={onComposerModeChange}
          onDraftChange={onDraftChange}
          onModelChange={onModelChange}
          onPermissionModeChange={onPermissionModeChange}
          onReasoningEffortChange={onReasoningEffortChange}
          onRemoveAttachment={onRemoveAttachment}
          onSend={onSend}
          onStop={onStop}
          permissionMode={permissionMode}
          queuedSteerCount={queuedSteerCount}
          reasoningEffort={reasoningEffort}
          runPending={runPending}
          selectedAgent={selectedAgent}
          skills={skills}
          status={status}
        />
      </section>
      <section className="knowledge-preview-pane" aria-label={t("knowledge.vaultMarkdownPreview")}>
        <Card className="knowledge-preview-card">
          <CardHeader className="knowledge-preview-header">
            <div className="min-w-0">
              <CardTitle>{selectedArtifact?.artifact.path ?? t("knowledge.vaultPreview")}</CardTitle>
              <CardDescription>
                {selectedArtifact
                  ? `${selectedArtifact.artifact.mime} / ${formatBytes(selectedArtifact.artifact.size)}`
                  : t("empty.selectVaultNote")}
              </CardDescription>
            </div>
            <Button disabled={!selectedArtifact?.content} onClick={onReferenceCurrent} size="sm" type="button" variant="outline">
              <FileText className="size-3.5" />
              {t("knowledge.reference")}
            </Button>
          </CardHeader>
          <CardContent className="knowledge-preview-content">
            {selectedArtifact ? (
              selectedArtifact.artifact.mime === "markdown" ? (
                <MarkdownPreview artifact={selectedArtifact.artifact} content={selectedArtifact.content ?? ""} />
              ) : selectedArtifact.artifact.mime === "image" ? (
                <div className="artifact-preview">
                  <img alt={selectedArtifact.artifact.name} src={artifactPreviewUrl(selectedArtifact.artifact)} />
                </div>
              ) : selectedArtifact.artifact.mime === "video" ? (
                <div className="artifact-preview">
                  <video controls key={selectedArtifact.artifact.path} preload="metadata" src={artifactPreviewUrl(selectedArtifact.artifact)} />
                </div>
              ) : selectedArtifact.binary ? (
                <div className="empty-state">{t("empty.previewUnavailable")}</div>
              ) : (
                <pre>{selectedArtifact.content}</pre>
              )
            ) : (
              <div className="empty-state">{t("empty.noVaultNoteSelected")}</div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function YoutubeVideoWorkbench({
  activeRunId,
  busy,
  draft,
  newProfileName,
  notice,
  onCreateProfile,
  onDraftChange,
  onGenerate,
  onNewProfileNameChange,
  onStop,
  selectedProfile
}: {
  activeRunId: string | null;
  busy: string | null;
  draft: YoutubeVideoDraft;
  newProfileName: string;
  notice: string | null;
  onCreateProfile: () => void;
  onDraftChange: (value: YoutubeVideoDraft) => void;
  onGenerate: () => void;
  onNewProfileNameChange: (value: string) => void;
  onStop: () => void;
  selectedProfile: WorkspaceProfile | null;
}) {
  const { t } = useI18n();
  const runActive = Boolean(activeRunId) || busy === "youtube-video-run";
  const profileReady = selectedProfile?.platform === "youtube";
  return (
    <Card className="youtube-video-panel">
      <CardHeader className="youtube-video-header">
        <div className="min-w-0">
          <CardTitle>{t("youtube.videoStudio")}</CardTitle>
          <CardDescription>{profileReady ? `youtube/${selectedProfile.profile}` : t("youtube.noProfile")}</CardDescription>
        </div>
        {runActive ? <StatusBadge state="warn" label={activeRunId ?? "running"} /> : <StatusBadge state="ok" label={t("common.ready")} />}
      </CardHeader>
      <CardContent className="youtube-video-body">
        {!profileReady ? (
          <div className="youtube-profile-create">
            <Input
              aria-label={t("youtube.profileName")}
              onChange={(event) => onNewProfileNameChange(event.target.value)}
              placeholder="astrozi"
              value={newProfileName}
            />
            <Button disabled={busy === "workspace-profile-create" || !newProfileName.trim()} onClick={onCreateProfile} type="button">
              {busy === "workspace-profile-create" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {t("youtube.createProfile")}
            </Button>
          </div>
        ) : (
          <div className="youtube-video-form">
            <Input
              aria-label={t("youtube.title")}
              onChange={(event) => onDraftChange({ ...draft, title: event.target.value })}
              placeholder={t("youtube.titlePlaceholder")}
              value={draft.title}
            />
            <Textarea
              aria-label={t("youtube.prompt")}
              className="youtube-video-prompt"
              onChange={(event) => onDraftChange({ ...draft, prompt: event.target.value })}
              placeholder={t("youtube.promptPlaceholder")}
              value={draft.prompt}
            />
            <div className="youtube-video-controls">
              <Select onValueChange={(value) => onDraftChange({ ...draft, aspectRatio: value as YoutubeVideoDraft["aspectRatio"] })} value={draft.aspectRatio}>
                <SelectTrigger>
                  <Video className="size-3.5" />
                  <SelectValue placeholder={t("youtube.aspectRatio")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="16:9">16:9</SelectItem>
                  <SelectItem value="9:16">9:16</SelectItem>
                  <SelectItem value="1:1">1:1</SelectItem>
                </SelectContent>
              </Select>
              <Input
                aria-label={t("youtube.duration")}
                max={30}
                min={3}
                onChange={(event) => onDraftChange({ ...draft, duration: Number(event.target.value) })}
                type="number"
                value={draft.duration}
              />
              <Select onValueChange={(value) => onDraftChange({ ...draft, resolution: value as YoutubeVideoDraft["resolution"] })} value={draft.resolution}>
                <SelectTrigger>
                  <SelectValue placeholder={t("youtube.resolution")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="720p">720p</SelectItem>
                  <SelectItem value="1080p">1080p</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input
              aria-label={t("youtube.imageUrl")}
              onChange={(event) => onDraftChange({ ...draft, imageUrl: event.target.value })}
              placeholder={t("youtube.imageUrlPlaceholder")}
              value={draft.imageUrl}
            />
            <div className="youtube-video-actions">
              <Button disabled={runActive || !draft.prompt.trim()} onClick={onGenerate} type="button">
                {runActive ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                {t("youtube.generate")}
              </Button>
              <Button disabled={!activeRunId} onClick={onStop} type="button" variant="outline">
                <Square className="size-4" />
                {t("chat.stopRun")}
              </Button>
              {notice ? <span className="youtube-video-notice">{notice}</span> : null}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WorkspaceView({
  activePlatform,
  activeRunId,
  busy,
  newProfileName,
  notice,
  onCreateProfile,
  onGenerateVideo,
  onNewProfileNameChange,
  onStopVideo,
  onVideoDraftChange,
  selectedArtifact,
  selectedProfile,
  videoDraft
}: {
  activePlatform: PlatformId;
  activeRunId: string | null;
  busy: string | null;
  newProfileName: string;
  notice: string | null;
  onCreateProfile: () => void;
  onGenerateVideo: () => void;
  onNewProfileNameChange: (value: string) => void;
  onStopVideo: () => void;
  onVideoDraftChange: (value: YoutubeVideoDraft) => void;
  selectedArtifact: ArtifactContent | null;
  selectedProfile: WorkspaceProfile | null;
  videoDraft: YoutubeVideoDraft;
}) {
  const { t } = useI18n();
  return (
    <div className="workspace-view workspace-stack">
      {activePlatform === "youtube" ? (
        <YoutubeVideoWorkbench
          activeRunId={activeRunId}
          busy={busy}
          draft={videoDraft}
          newProfileName={newProfileName}
          notice={notice}
          onCreateProfile={onCreateProfile}
          onDraftChange={onVideoDraftChange}
          onGenerate={onGenerateVideo}
          onNewProfileNameChange={onNewProfileNameChange}
          onStop={onStopVideo}
          selectedProfile={selectedProfile}
        />
      ) : null}
      <Card className="workspace-card">
        <CardHeader className="border-b">
          <CardTitle>{selectedArtifact?.artifact.path ?? selectedProfile?.profile ?? t("workspace.title")}</CardTitle>
          <CardDescription>
            {selectedArtifact ? `${selectedArtifact.artifact.mime} / ${formatBytes(selectedArtifact.artifact.size)}` : t("empty.selectArtifactFromSubNav")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {selectedArtifact ? (
            selectedArtifact.artifact.mime === "markdown" ? (
              <MarkdownPreview artifact={selectedArtifact.artifact} content={selectedArtifact.content ?? ""} />
            ) : selectedArtifact.artifact.mime === "image" ? (
              <div className="artifact-preview">
                <img alt={selectedArtifact.artifact.name} src={artifactPreviewUrl(selectedArtifact.artifact)} />
              </div>
            ) : selectedArtifact.artifact.mime === "video" ? (
              <div className="artifact-preview">
                <video controls key={selectedArtifact.artifact.path} preload="metadata" src={artifactPreviewUrl(selectedArtifact.artifact)} />
              </div>
            ) : selectedArtifact.binary ? (
              <div className="empty-state">{t("empty.previewUnavailable")}</div>
            ) : (
              <pre>{selectedArtifact.content}</pre>
            )
          ) : (
            <div className="empty-state">{t("empty.noArtifactSelected")}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MarkdownPreview({ artifact, content }: { artifact: ArtifactInfo; content: string }) {
  const components = useMemo<Components>(
    () => ({
      a({ children, href, ...props }) {
        const isExternal = href ? /^[a-z][a-z0-9+.-]*:/i.test(href) : false;
        return (
          <a href={href} rel={isExternal ? "noreferrer" : undefined} target={isExternal ? "_blank" : undefined} {...props}>
            {children}
          </a>
        );
      },
      img({ alt, src, ...props }) {
        return <img alt={alt ?? ""} loading="lazy" src={resolveMarkdownAssetUrl(artifact, src)} {...props} />;
      }
    }),
    [artifact.path, artifact.platform, artifact.profile]
  );

  return (
    <div className="markdown-preview">
      <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

function PublishedPostsView({
  busy,
  notice,
  onSearchChange,
  onStatusFilterChange,
  onSync,
  onUpdate,
  posts,
  search,
  selectedProfile,
  statusFilter
}: {
  busy: string | null;
  notice: string | null;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: XhsPublishedPostStatus | "all") => void;
  onSync: () => void;
  onUpdate: (post: XhsPublishedPost, patch: { status?: XhsPublishedPostStatus; statusNote?: string; keyword?: string }) => void;
  posts: XhsPublishedPost[];
  search: string;
  selectedProfile: WorkspaceProfile | null;
  statusFilter: XhsPublishedPostStatus | "all";
}) {
  const { t } = useI18n();
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = posts.filter((post) => {
    const matchesStatus = statusFilter === "all" || post.status === statusFilter;
    if (!matchesStatus) return false;
    if (!normalizedSearch) return true;
    return [post.title, post.description, post.keyword, post.statusNote]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedSearch));
  });
  const visible = filtered.filter((post) => post.status !== "archived" || statusFilter === "archived");

  return (
    <section className="published-shell" aria-label={t("nav.published")}>
      <div className="published-toolbar">
        <div className="published-toolbar-title">
          <p>{selectedProfile ? `xiaohongshu/${selectedProfile.profile}` : t("published.noProfile")}</p>
          <h3>{t("published.title")}</h3>
        </div>
        <div className="published-toolbar-actions">
          <div className="published-search">
            <Search className="size-3.5" />
            <Input onChange={(event) => onSearchChange(event.target.value)} placeholder={t("published.searchPlaceholder")} value={search} />
          </div>
          <Select onValueChange={(value) => onStatusFilterChange(value as XhsPublishedPostStatus | "all")} value={statusFilter}>
            <SelectTrigger aria-label={t("aria.statusFilter")} className="published-status-filter" size="sm">
              <SlidersHorizontal className="size-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {publishedPostStatusOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option === "all" ? t("published.allStatus") : t(publishedPostStatusLabelKey[option])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button disabled={!selectedProfile || busy === "published-sync"} onClick={onSync} size="sm" type="button" variant="outline">
            {busy === "published-sync" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCcw className="size-3.5" />}
            {t("published.sync")}
          </Button>
        </div>
      </div>

      {notice ? <div className="published-notice">{notice}</div> : null}

      {visible.length ? (
        <div className="published-masonry">
          {visible.map((post, index) => (
            <PublishedPostCard busy={busy} index={index} key={post.id} onUpdate={onUpdate} post={post} />
          ))}
        </div>
      ) : (
        <div className="published-empty">
          <ImageIcon className="size-6" />
          <span>{posts.length ? t("published.noMatches") : t("published.noRecords")}</span>
        </div>
      )}
    </section>
  );
}

function PublishedPostCard({
  busy,
  index,
  onUpdate,
  post
}: {
  busy: string | null;
  index: number;
  onUpdate: (post: XhsPublishedPost, patch: { status?: XhsPublishedPostStatus; statusNote?: string; keyword?: string }) => void;
  post: XhsPublishedPost;
}) {
  const { locale, t } = useI18n();
  const engagement = (post.stats.likes ?? 0) + (post.stats.collects ?? 0) + (post.stats.comments ?? 0);
  return (
    <article className={cn("published-note-card", post.status === "archived" && "published-note-card-muted")}>
      <div className="published-note-cover" style={{ aspectRatio: publishedCardAspect(index, post) }}>
        {post.coverUrl ? (
          <img alt={post.title} loading="lazy" src={post.coverUrl} />
        ) : (
          <div className={cn("published-note-cover-fallback", `published-tone-${index % 6}`)}>
            <span>{post.title}</span>
          </div>
        )}
        <div className="published-note-cover-top">
          <StatusBadge state={publishedStatusState(post.status)} label={t(publishedPostStatusLabelKey[post.status])} />
          {post.contentType === "video" ? <Badge variant="secondary">{t("published.video")}</Badge> : null}
        </div>
      </div>

      <div className="published-note-body">
        <div className="published-note-title-row">
          <h4 title={post.title}>{post.title}</h4>
          {post.url ? (
            <a aria-label={t("published.openPost")} className="published-note-link" href={post.url} rel="noreferrer" target="_blank">
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>
        <div className="published-note-meta">
          <span className="published-author">
            {post.authorAvatarUrl ? <img alt="" src={post.authorAvatarUrl} /> : <span className="published-author-dot" />}
            <span>{post.authorName ?? post.profile}</span>
          </span>
          <span>{formatPublishedDate(post.publishedAt ?? post.syncedAt ?? post.updatedAt, locale)}</span>
        </div>
        <div className="published-note-stats">
          <span title={t("published.stat.views")}>
            <Eye className="size-3.5" />
            {formatCompactNumber(post.stats.views)}
          </span>
          <span title={t("published.stat.likes")}>
            <Heart className="size-3.5" />
            {formatCompactNumber(post.stats.likes)}
          </span>
          <span title={t("published.stat.collects")}>
            <Bookmark className="size-3.5" />
            {formatCompactNumber(post.stats.collects)}
          </span>
          <span title={t("published.stat.comments")}>
            <MessageSquare className="size-3.5" />
            {formatCompactNumber(post.stats.comments)}
          </span>
          <span title={t("published.stat.shares")}>
            <Share2 className="size-3.5" />
            {formatCompactNumber(post.stats.shares)}
          </span>
        </div>
        <div className="published-note-controls">
          <Select onValueChange={(value) => onUpdate(post, { status: value as XhsPublishedPostStatus })} value={post.status}>
            <SelectTrigger aria-label={t("published.postStatus")} className="published-note-status-select" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {publishedPostStatusOptions
                .filter((option): option is XhsPublishedPostStatus => option !== "all")
                .map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(publishedPostStatusLabelKey[option])}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button
            aria-label={t("published.archivePost")}
            disabled={busy === `published-update-${post.id}` || post.status === "archived"}
            onClick={() => onUpdate(post, { status: "archived" })}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            {busy === `published-update-${post.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <Archive className="size-3.5" />}
          </Button>
        </div>
        <Input
          className="published-note-input"
          defaultValue={post.statusNote ?? ""}
          key={`${post.id}-${post.statusNote ?? ""}`}
          onBlur={(event) => {
            if (event.currentTarget.value.trim() !== (post.statusNote ?? "")) {
              onUpdate(post, { statusNote: event.currentTarget.value });
            }
          }}
          placeholder={engagement ? t("published.engagementPrefix", { value: formatCompactNumber(engagement) }) : t("published.notePlaceholder")}
        />
      </div>
    </article>
  );
}

function AutoRepliesView({
  agents,
  busy,
  items,
  llmOptions,
  notice,
  onRun,
  onSaveSettings,
  onSelectAgent,
  onSelectLlm,
  onSettingsChange,
  onSync,
  onUpdateItem,
  selectedAgentId,
  selectedLlmValue,
  selectedProfile,
  settings
}: {
  agents: string[];
  busy: string | null;
  items: XhsAutoReplyItem[];
  llmOptions: HermesModelOption[];
  notice: string | null;
  onRun: () => void;
  onSaveSettings: () => void;
  onSelectAgent: (agentId: string) => void;
  onSelectLlm: (value: string) => void;
  onSettingsChange: (settings: XhsAutoReplySettings) => void;
  onSync: () => void;
  onUpdateItem: (item: XhsAutoReplyItem, patch: { status?: XhsAutoReplyItemStatus; replyContent?: string }) => void;
  selectedAgentId: string;
  selectedLlmValue: string;
  selectedProfile: WorkspaceProfile | null;
  settings: XhsAutoReplySettings;
}) {
  const { t } = useI18n();
  const runnable = Boolean(selectedProfile && settings.stylePrompt.trim());
  const activeItems = items.filter((item) => item.status !== "already-replied" && item.status !== "skipped");
  return (
    <section className="auto-reply-shell" aria-label={t("nav.replies")}>
      <div className="published-toolbar">
        <div className="published-toolbar-title">
          <p>{selectedProfile ? `xiaohongshu/${selectedProfile.profile}` : t("published.noProfile")}</p>
          <h3>{t("autoReply.title")}</h3>
        </div>
        <div className="published-toolbar-actions">
          <Select disabled={!agents.length} onValueChange={onSelectAgent} value={selectedAgentId}>
            <SelectTrigger aria-label={t("common.agent")} className="auto-reply-agent-select" size="sm">
              <Bot className="size-3.5" />
              <SelectValue placeholder={t("common.agent")} />
            </SelectTrigger>
            <SelectContent>
              {agents.map((agent) => (
                <SelectItem key={agent} value={agent}>
                  {agent}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <LlmModelSelect
            disabled={!llmOptions.length}
            onChange={onSelectLlm}
            options={llmOptions}
            triggerClassName="auto-reply-model-select"
            value={selectedLlmValue}
          />
          <Button disabled={!selectedProfile || busy === "auto-reply-sync"} onClick={onSync} size="sm" type="button" variant="outline">
            {busy === "auto-reply-sync" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCcw className="size-3.5" />}
            {t("autoReply.syncComments")}
          </Button>
          <Button disabled={!runnable || busy === "auto-reply-run"} onClick={onRun} size="sm" type="button">
            {busy === "auto-reply-run" ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            {t("common.start")}
          </Button>
        </div>
      </div>

      {notice ? <div className="published-notice">{notice}</div> : null}

      <div className="auto-reply-settings">
        <Card size="sm">
          <CardHeader>
            <CardTitle>{t("autoReply.promptTitle")}</CardTitle>
            <CardDescription>{t("autoReply.promptDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              className="auto-reply-style-input"
              onChange={(event) => onSettingsChange({ ...settings, stylePrompt: event.target.value })}
              placeholder={t("autoReply.promptPlaceholder")}
              value={settings.stylePrompt}
            />
            <div className="auto-reply-style-presets" aria-label={t("autoReply.presetAria")}>
              {autoReplyStylePresets.map((preset) => {
                const active = settings.stylePrompt.trim() === preset.prompt;
                return (
                  <button
                    className={cn("auto-reply-style-preset", active && "auto-reply-style-preset-active")}
                    key={preset.id}
                    onClick={() => onSettingsChange({ ...settings, stylePrompt: preset.prompt })}
                    title={preset.prompt}
                    type="button"
                  >
                    <span>
                      <Zap className="size-3.5" />
                      {t(preset.labelKey)}
                    </span>
                    <small>{t(preset.descriptionKey)}</small>
                  </button>
                );
              })}
            </div>
            <div className="auto-reply-controls">
              <label className="auto-reply-control-field">
                <span className="auto-reply-control-label">{t("autoReply.locale")}</span>
                <Select
                  onValueChange={(value) => onSettingsChange({ ...settings, locale: value as XhsAutoReplyLocale })}
                  value={settings.locale}
                >
                  <SelectTrigger aria-label={t("autoReply.localeAria")} size="sm">
                    <SlidersHorizontal className="size-3.5" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {autoReplyLocaleOptions.map((locale) => (
                      <SelectItem key={locale} value={locale}>
                        {t(autoReplyLocaleLabelKey[locale])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="auto-reply-control-field">
                <span className="auto-reply-control-label">{t("autoReply.dryRunMode")}</span>
                <Select
                  onValueChange={(value) => onSettingsChange({ ...settings, dryRun: value === "true" })}
                  value={String(settings.dryRun)}
                >
                  <SelectTrigger aria-label={t("autoReply.dryRunAria")} size="sm">
                    <ShieldCheck className="size-3.5" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">{t("autoReply.draftOnly")}</SelectItem>
                    <SelectItem value="false">{t("autoReply.sendReply")}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="auto-reply-control-field">
                <span className="auto-reply-control-label">{t("autoReply.maxReplies")}</span>
                <Input
                  aria-label={t("autoReply.maxRepliesAria")}
                  min={1}
                  max={50}
                  onChange={(event) =>
                    onSettingsChange({ ...settings, maxRepliesPerRun: clampNumber(event.target.valueAsNumber, 1, 50, settings.maxRepliesPerRun) })
                  }
                  type="number"
                  value={settings.maxRepliesPerRun}
                />
              </label>
              <label className="auto-reply-control-field">
                <span className="auto-reply-control-label">{t("autoReply.delaySeconds")}</span>
                <Input
                  aria-label={t("autoReply.delaySecondsAria")}
                  min={0}
                  max={120}
                  onChange={(event) =>
                    onSettingsChange({ ...settings, delaySeconds: clampNumber(event.target.valueAsNumber, 0, 120, settings.delaySeconds) })
                  }
                  type="number"
                  value={settings.delaySeconds}
                />
              </label>
              <Button disabled={!selectedProfile || busy === "auto-reply-settings"} onClick={onSaveSettings} size="sm" type="button" variant="outline">
                {busy === "auto-reply-settings" ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                {t("common.save")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {activeItems.length ? (
        <div className="auto-reply-list">
          {activeItems.map((item) => (
            <AutoReplyItemCard busy={busy} item={item} key={item.id} onUpdate={onUpdateItem} />
          ))}
        </div>
      ) : (
        <div className="published-empty">
          <Reply className="size-6" />
          <span>{t("autoReply.noPending")}</span>
        </div>
      )}
    </section>
  );
}

function AutoReplyItemCard({
  busy,
  item,
  onUpdate
}: {
  busy: string | null;
  item: XhsAutoReplyItem;
  onUpdate: (item: XhsAutoReplyItem, patch: { status?: XhsAutoReplyItemStatus; replyContent?: string }) => void;
}) {
  const { t } = useI18n();
  return (
    <Card className="auto-reply-card" size="sm">
      <CardHeader>
        <CardTitle className="auto-reply-card-title">
          <span>{item.commentAuthorName ?? t("autoReply.unknownUser")}</span>
          <StatusBadge state={autoReplyStatusState(item.status)} label={t(autoReplyStatusLabelKey[item.status])} />
        </CardTitle>
        <CardDescription>{item.noteTitle ?? item.noteId}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <blockquote className="auto-reply-comment">{item.commentContent}</blockquote>
        {item.replyContent ? (
          <Textarea
            className="auto-reply-draft"
            defaultValue={item.replyContent}
            key={`${item.id}-${item.replyContent}`}
            onBlur={(event) => {
              if (event.currentTarget.value.trim() !== (item.replyContent ?? "")) {
                onUpdate(item, { replyContent: event.currentTarget.value });
              }
            }}
          />
        ) : null}
        {item.decisionReason ? <p className="auto-reply-reason">{item.decisionReason}</p> : null}
        {item.error ? <p className="auto-reply-error">{item.error}</p> : null}
        <div className="auto-reply-card-actions">
          <Button
            disabled={busy === `auto-reply-item-${item.id}` || item.status === "skipped"}
            onClick={() => onUpdate(item, { status: "skipped" })}
            size="sm"
            type="button"
            variant="outline"
          >
            <Archive className="size-3.5" />
            {t("common.skip")}
          </Button>
          <Button
            disabled={busy === `auto-reply-item-${item.id}` || item.status === "pending"}
            onClick={() => onUpdate(item, { status: "pending" })}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCcw className="size-3.5" />
            {t("common.requeue")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CalendarScheduleView({
  busy,
  items,
  jobs,
  onDelete,
  onRun,
  onNextWeek,
  onPreviousWeek,
  onThisWeek,
  onToggle,
  weekStart
}: {
  busy: string | null;
  items: SocialTaskCalendarItem[];
  jobs: SocialCronJob[];
  onDelete: (job: SocialCronJob) => void;
  onRun: (job: SocialCronJob) => void;
  onNextWeek: () => void;
  onPreviousWeek: () => void;
  onThisWeek: () => void;
  onToggle: (job: SocialCronJob) => void;
  weekStart: Date;
}) {
  const { t } = useI18n();
  return (
    <div className="calendar-schedule-view">
      <CalendarView items={items} jobs={jobs} onNextWeek={onNextWeek} onPreviousWeek={onPreviousWeek} onThisWeek={onThisWeek} weekStart={weekStart} />
      <section className="calendar-cron-section" aria-label={t("calendar.socialCron")}>
        <div className="calendar-cron-section-header">
          <div>
            <h3>{t("calendar.socialCron")}</h3>
            <p>{jobs.length ? t("calendar.schedulesAttached", { count: jobs.length }) : t("calendar.noRecurring")}</p>
          </div>
          <Badge variant="outline">{t("calendar.enabledCount", { count: jobs.filter((job) => job.enabled).length })}</Badge>
        </div>
        <CronView busy={busy} jobs={jobs} onDelete={onDelete} onRun={onRun} onToggle={onToggle} />
      </section>
    </div>
  );
}

function CalendarView({
  items,
  jobs,
  onNextWeek,
  onPreviousWeek,
  onThisWeek,
  weekStart
}: {
  items: SocialTaskCalendarItem[];
  jobs: SocialCronJob[];
  onNextWeek: () => void;
  onPreviousWeek: () => void;
  onThisWeek: () => void;
  weekStart: Date;
}) {
  const { locale, t } = useI18n();
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const weekItems = buildCalendarWeekItems(items, jobs, weekStart);
  const itemsByDay = days.map((day) =>
    weekItems
      .filter((item) => sameLocalDate(new Date(item.startsAt), day))
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  );

  return (
    <Card className="calendar-week-card">
      <CardHeader className="calendar-week-header border-b">
        <div className="calendar-week-title">
          <CardTitle>{t("calendar.weekOf", { date: formatCalendarDay(weekStart, locale) })}</CardTitle>
          <CardDescription>
            {t("calendar.rangeTasks", { start: formatCalendarDay(days[0], locale), end: formatCalendarDay(days[6], locale), count: weekItems.length })}
          </CardDescription>
        </div>
        <div className="calendar-week-actions">
          <Button onClick={onPreviousWeek} size="sm" type="button" variant="outline">
            <ChevronLeft className="size-3.5" />
            {t("calendar.previousWeek")}
          </Button>
          <Button onClick={onThisWeek} size="sm" type="button" variant="outline">
            <CalendarClock className="size-3.5" />
            {t("calendar.thisWeek")}
          </Button>
          <Button onClick={onNextWeek} size="sm" type="button" variant="outline">
            {t("calendar.nextWeek")}
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="calendar-week-wrapper">
          <table className="calendar-week-table">
            <thead>
              <tr>
                {days.map((day) => (
                  <th key={day.toISOString()}>
                    <span>{formatWeekday(day, locale)}</span>
                    <strong>{formatCalendarDay(day, locale)}</strong>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {days.map((day, index) => (
                  <td key={day.toISOString()}>
                    <div className="calendar-day-stack">
                      {itemsByDay[index].length ? (
                        itemsByDay[index].map((item) => (
                          <article className="calendar-task" key={`${item.source}/${item.id}`}>
                            <div className="calendar-task-head">
                              <time>{formatTime(item.startsAt, locale)}</time>
                              <StatusBadge state={calendarState(item.status)} label={calendarStatusLabel(item.status, t)} />
                            </div>
                            <strong>{item.title}</strong>
                            <small>
                              {item.profile} / {item.agentId} / {item.llm?.model ?? item.runner}
                            </small>
                          </article>
                        ))
                      ) : (
                        <div className="calendar-empty-day">{t("calendar.noTasks")}</div>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function BoardView({
  busy,
  onOpenSession,
  onRun,
  selectedJob,
  tasks
}: {
  busy: string | null;
  onOpenSession: (task: SocialBoardTask) => void;
  onRun: (task: SocialBoardTask) => void;
  selectedJob: JobSnapshot | null;
  tasks: SocialBoardTask[];
}) {
  const { t } = useI18n();
  return (
    <div className="board-grid">
      {(["ready", "running", "done", "failed"] as const).map((status) => {
        const laneTasks = tasks.filter((task) => task.status === status);
        return (
          <section className="board-lane" key={status}>
            <div className="board-lane-header">
              <span>{t(boardStatusLabelKey[status])}</span>
              <Badge variant="outline">{laneTasks.length}</Badge>
            </div>
            <div className="space-y-2">
              {laneTasks.length ? (
                laneTasks.map((task) => {
                  const job = selectedJob?.id === task.lastJobId ? selectedJob : null;
                  return (
                    <Card key={task.id} size="sm">
                      <CardHeader>
                        <CardTitle className="truncate">{task.title}</CardTitle>
                        <CardDescription>
                          {task.profile} / {task.llm?.model ?? task.runner} / {task.source}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="board-task-content">
                        <div className="board-task-meta">
                          <MetricRow label={t("common.agent")} value={task.agentId} />
                          <MetricRow label={t("common.type")} value={t(socialCronTaskLabelKey[task.taskType])} />
                          {task.lastJobId ? <MetricRow label="Job" value={task.lastJobId} /> : null}
                        </div>
                        {task.error ? <p className="board-task-error">{task.error}</p> : null}
                        {!task.error && task.result ? <pre className="board-task-result">{task.result}</pre> : null}
                        {job ? <JobLogPanel compact job={job} /> : null}
                        {task.hermesSessionId && (task.status === "done" || task.status === "failed") ? (
                          <Button
                            className="w-full"
                            disabled={busy === `social-board-session-${task.id}`}
                            onClick={() => onOpenSession(task)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            {busy === `social-board-session-${task.id}` ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <MessageSquare className="size-3.5" />
                            )}
                            {t("common.resume")}
                          </Button>
                        ) : null}
                        {!task.readOnly && (task.status === "ready" || task.status === "failed") ? (
                          <Button
                            className="w-full"
                            disabled={busy === `social-board-run-${task.id}`}
                            onClick={() => onRun(task)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            {busy === `social-board-run-${task.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                            {t("common.run")}
                          </Button>
                        ) : null}
                      </CardContent>
                    </Card>
                  );
                })
              ) : (
                <EmptyCompact label={t("empty.emptyLane")} />
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CronView({
  busy,
  jobs,
  onDelete,
  onRun,
  onToggle
}: {
  busy: string | null;
  jobs: SocialCronJob[];
  onDelete: (job: SocialCronJob) => void;
  onRun: (job: SocialCronJob) => void;
  onToggle: (job: SocialCronJob) => void;
}) {
  const { locale, t } = useI18n();
  return (
    <div className="content-grid">
      {jobs.length ? (
        jobs.map((job) => (
          <Card key={job.id} size="sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span className="truncate">{job.name}</span>
                <StatusBadge state={job.enabled ? "ok" : "warn"} label={job.enabled ? t("cron.status.enabled") : t("cron.status.paused")} />
              </CardTitle>
              <CardDescription>{job.schedule.display}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <MetricRow label={t("common.agent")} value={job.agentId} />
                {job.llm ? <MetricRow label="LLM" value={`${job.llm.provider}/${job.llm.model}`} /> : null}
                <MetricRow label={t("common.profile")} value={job.profile} />
                <MetricRow label={t("common.type")} value={t(socialCronTaskLabelKey[job.taskType])} />
                <MetricRow label={t("common.source")} value={job.source === "hermes" ? "Hermes cron" : "Growth Hacker"} />
                <MetricRow label={t("common.next")} value={formatDateTime(job.nextRunAt, locale)} />
                <MetricRow label={t("common.last")} value={job.lastStatus ?? job.state} />
              </div>
              {job.readOnly ? (
                <Button className="w-full" disabled size="sm" type="button" variant="outline">
                  <ShieldCheck className="size-3.5" />
                  {t("cron.managedByHermes")}
                </Button>
              ) : (
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Button disabled={busy === `social-cron-run-${job.id}`} onClick={() => onRun(job)} size="sm" type="button" variant="outline">
                    {busy === `social-cron-run-${job.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                    {t("common.run")}
                  </Button>
                  <Button onClick={() => onToggle(job)} size="sm" type="button" variant="outline">
                    {job.enabled ? t("common.pause") : t("common.resume")}
                  </Button>
                  <Button aria-label={t("cron.deleteJob")} onClick={() => onDelete(job)} size="icon-sm" type="button" variant="destructive">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      ) : (
        <EmptyWide label={t("cron.noJobs")} />
      )}
    </div>
  );
}

function ChatView({
  activeRunId,
  attachments,
  composerMode,
  composerNotice,
  draft,
  events,
  model,
  modelOptions,
  modelValue,
  onAttachFiles,
  onApprove,
  onComposerModeChange,
  onDraftChange,
  onModelChange,
  onPermissionModeChange,
  onReasoningEffortChange,
  onRemoveAttachment,
  onSend,
  onStop,
  permissionMode,
  queuedSteerCount,
  reasoningEffort,
  runPending,
  selectedAgent,
  skills,
  status
}: {
  activeRunId: string | null;
  attachments: ChatAttachment[];
  composerMode: ChatComposerMode;
  composerNotice: string | null;
  draft: string;
  events: HermesChatEvent[];
  model: string;
  modelOptions: HermesModelOption[];
  modelValue: string;
  onAttachFiles: (files: FileList | null) => void;
  onApprove: (runId: string, choice: string) => void;
  onComposerModeChange: (mode: ChatComposerMode) => void;
  onDraftChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onPermissionModeChange: (value: ChatPermissionMode) => void;
  onReasoningEffortChange: (value: ChatReasoningEffort) => void;
  onRemoveAttachment: (id: string) => void;
  onSend: () => void;
  onStop: () => void;
  permissionMode: ChatPermissionMode;
  queuedSteerCount: number;
  reasoningEffort: ChatReasoningEffort;
  runPending: boolean;
  selectedAgent?: SocialAgent;
  skills: HermesSkillInfo[];
  status: HermesChatStatus | null;
}) {
  const { locale, t } = useI18n();
  const transcript = buildChatTranscript(events, t, { thinkingId: activeRunId ?? (runPending ? "pending" : null) });
  const contextBalance = getChatContextBalance(model, events, t);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const [listening, setListening] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const speechAvailable = Boolean(getSpeechRecognitionConstructor());
  const mentionQuery = activeRunId ? null : activeSkillMentionQuery(draft);
  const enabledSkills = useMemo(
    () => uniqueHermesSkillsByName(skills).filter((skill) => skill.enabled).sort(sortHermesSkills),
    [skills]
  );
  const mentionMatches =
    mentionQuery === null
      ? []
      : enabledSkills
          .filter((skill) => skill.name.toLowerCase().includes(mentionQuery.toLowerCase()))
          .sort(sortHermesSkills)
          .slice(0, 8);
  const mentionedSkills = resolveSkillMentions(draft, skills).skills;
  const mentionedSkillNames = new Set(mentionedSkills.map((skill) => skill.name.toLowerCase()));
  const visibleDraft = removeSelectedSkillMentions(draft, mentionedSkills);
  useEffect(() => {
    if (!actionMenuOpen) return;
    const closeOnOutsidePointer = (event: MouseEvent) => {
      if (actionMenuRef.current?.contains(event.target as Node)) return;
      setActionMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActionMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [actionMenuOpen]);

  return (
    <div className="chat-shell">
      <div className="chat-transcript">
        {transcript.length ? (
          transcript.map((item) => (
            <ChatTranscriptItem key={item.id} item={item} onApprove={onApprove} />
          ))
        ) : (
          <div className="chat-empty">
            <MessageSquare className="size-5" />
            <span>{selectedAgent ? `${selectedAgent.id} / Hermes API` : t("chat.noAgentSelected")}</span>
          </div>
        )}
      </div>
      <div className="chat-dock">
        {activeRunId ? (
          <div className="chat-runtime-bar">
            <Badge variant="outline">{activeRunId}</Badge>
            {queuedSteerCount ? <Badge variant="outline">{t("chat.queuedSteers", { count: queuedSteerCount })}</Badge> : null}
          </div>
        ) : null}
        <div className="chat-composer">
          <div className="chat-composer-input">
            {mentionQuery !== null ? (
              <div className="skill-mention-menu">
                {mentionMatches.length ? (
                  mentionMatches.map((skill) => (
                    <button key={skill.path} onClick={() => onDraftChange(insertSkillMention(draft, skill.name))} type="button">
                      <span>${skill.name}</span>
                      <small>{skill.category || t("chat.uncategorized")}</small>
                    </button>
                  ))
                ) : (
                  <div className="skill-mention-empty">{t("chat.noMatchingSkills")}</div>
                )}
              </div>
            ) : null}
            {mentionedSkills.length ? (
              <div className="chat-selected-skills">
                {mentionedSkills.map((skill) => (
                  <button
                    aria-label={t("chat.removeSkill", { name: skill.name })}
                    className="chat-selected-skill"
                    key={skill.name}
                    onClick={() => onDraftChange(setSkillMention(draft, skill.name, false))}
                    type="button"
                  >
                    <Gauge className="size-3.5" />
                    <span>${skill.name}</span>
                    <X className="size-3" />
                  </button>
                ))}
              </div>
            ) : null}
            <Textarea
              onChange={(event) => onDraftChange(mergeSelectedSkillMentions(event.target.value, mentionedSkills))}
              onKeyDown={(event) => {
                if (shouldSendChatOnKeyDown({ key: event.key, isComposing: event.nativeEvent.isComposing, shiftKey: event.shiftKey })) {
                  event.preventDefault();
                  onSend();
                }
              }}
              onPaste={(event) => {
                const clipboardFiles = event.clipboardData.files;
                if (activeRunId || !Array.from(clipboardFiles).some(isSupportedChatAttachmentFile)) return;
                event.preventDefault();
                onAttachFiles(clipboardFiles);
              }}
              placeholder={composerMode === "image" ? t("chat.placeholderImage") : t("chat.placeholderMessage")}
              value={visibleDraft}
            />
            {attachments.length ? (
              <div className="chat-attachments">
                {attachments.map((attachment) => (
                  <span className="chat-attachment-pill" key={attachment.id}>
                    {attachment.kind === "image" && attachment.previewUrl ? (
                      <img alt="" className="chat-attachment-thumb" src={attachment.previewUrl} />
                    ) : attachment.kind === "image" ? (
                      <ImageIcon className="size-3.5" />
                    ) : (
                      <FileText className="size-3.5" />
                    )}
                    <span>{attachment.name}</span>
                    <button aria-label={t("chat.removeAttachment", { name: attachment.name })} onClick={() => onRemoveAttachment(attachment.id)} type="button">
                      <Trash2 className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            {composerNotice ? <div className="chat-composer-notice">{composerNotice}</div> : null}
          </div>
          <div className="chat-composer-controls">
            <input
              accept=".txt,.md,.markdown,.json,.csv,.png,.jpg,.jpeg,.gif,.webp,text/*,application/json,image/png,image/jpeg,image/gif,image/webp"
              className="sr-only"
              multiple
              onChange={(event) => {
                onAttachFiles(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
              ref={fileInputRef}
              type="file"
            />
            <div className="chat-action-menu" ref={actionMenuRef}>
              <Button
                aria-expanded={actionMenuOpen}
                aria-haspopup="menu"
                aria-label={t("chat.openComposerActions")}
                disabled={Boolean(activeRunId)}
                onClick={() => setActionMenuOpen((current) => !current)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Plus className="size-4" />
              </Button>
              {actionMenuOpen ? (
                <div className="chat-action-popover" role="menu">
                  <button
                    className="chat-action-menu-item"
                    onClick={() => {
                      setActionMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                    role="menuitem"
                    type="button"
                  >
                    <span className="chat-action-menu-icon">
                      <FileText className="size-4" />
                    </span>
                    <span>
                      <strong>{t("chat.addFiles")}</strong>
                      <small>{t("chat.attachContext")}</small>
                    </span>
                  </button>
                  <button
                    className="chat-action-menu-item"
                    onClick={() => {
                      onComposerModeChange("image");
                      setActionMenuOpen(false);
                    }}
                    role="menuitem"
                    type="button"
                  >
                    <span className="chat-action-menu-icon">
                      <ImageIcon className="size-4" />
                    </span>
                    <span>
                      <strong>{t("chat.createImage")}</strong>
                      <small>{t("chat.useImageGenerate")}</small>
                    </span>
                  </button>
                </div>
              ) : null}
            </div>
            {composerMode === "image" ? (
              <button className="chat-composer-mode-chip" onClick={() => onComposerModeChange(null)} type="button">
                <ImageIcon className="size-3.5" />
                <span>{t("chat.createImage")}</span>
                <X className="size-3" />
              </button>
            ) : null}
            <Select onValueChange={(value) => onPermissionModeChange(value as ChatPermissionMode)} value={permissionMode}>
              <SelectTrigger aria-label={t("chat.permissionMode")} className="chat-control-select" size="sm">
                <ShieldCheck className="size-3.5 text-orange-600" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" className="chat-select-content chat-permission-menu" position="popper" sideOffset={8}>
                <SelectItem className="chat-select-item" value="full_access">
                  {t(chatPermissionLabelKey.full_access)}
                </SelectItem>
                <SelectItem className="chat-select-item" value="ask">
                  {t(chatPermissionLabelKey.ask)}
                </SelectItem>
                <SelectItem className="chat-select-item" value="read_only">
                  {t(chatPermissionLabelKey.read_only)}
                </SelectItem>
              </SelectContent>
            </Select>
            <Select disabled={!modelOptions.length} onValueChange={onModelChange} value={modelValue}>
              <SelectTrigger aria-label={t("chat.model")} className="chat-model-select" size="sm">
                <Zap className="size-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" className="chat-select-content chat-model-menu" position="popper" sideOffset={8}>
                {modelOptions.map((option) => (
                  <SelectItem className="chat-select-item" key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ChatContextBalanceHint balance={contextBalance} />
            <DropdownMenuPrimitive.Root>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuPrimitive.Trigger asChild>
                    <Button
                      aria-label={t("chat.selectSkills")}
                      className={cn("chat-skill-select", mentionedSkills.length && "chat-skill-select-active")}
                      disabled={Boolean(activeRunId) || !enabledSkills.length}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <Gauge className="size-3.5" />
                      <span>{skillPickerLabel(mentionedSkills, t)}</span>
                      <ChevronDown className="size-3" />
                    </Button>
                  </DropdownMenuPrimitive.Trigger>
                </TooltipTrigger>
                <TooltipContent>{t("chat.selectSkills")}</TooltipContent>
              </Tooltip>
              <DropdownMenuPrimitive.Portal>
                <DropdownMenuPrimitive.Content
                  align="center"
                  avoidCollisions
                  className="chat-select-content chat-skill-menu"
                  collisionPadding={18}
                  side="top"
                  sideOffset={104}
                >
                  {enabledSkills.length ? (
                    enabledSkills.map((skill) => {
                      const checked = mentionedSkillNames.has(skill.name.toLowerCase());
                      return (
                        <DropdownMenuPrimitive.CheckboxItem
                          checked={checked}
                          className="chat-skill-menu-item"
                          key={skill.path}
                          onCheckedChange={(nextChecked) => onDraftChange(setSkillMention(draft, skill.name, nextChecked === true))}
                          onSelect={(event) => event.preventDefault()}
                          textValue={skill.name}
                        >
                          <span className="chat-skill-menu-check">{checked ? <CheckCircle2 className="size-3.5" /> : null}</span>
                          <span className="chat-skill-menu-copy">
                            <strong>${skill.name}</strong>
                            <small>{skill.description || skill.category || t("skills.noDescription")}</small>
                          </span>
                        </DropdownMenuPrimitive.CheckboxItem>
                      );
                    })
                  ) : (
                    <DropdownMenuPrimitive.Item className="chat-skill-menu-empty" disabled>
                      {t("chat.skillMenuEmpty")}
                    </DropdownMenuPrimitive.Item>
                  )}
                </DropdownMenuPrimitive.Content>
              </DropdownMenuPrimitive.Portal>
            </DropdownMenuPrimitive.Root>
            <Select onValueChange={(value) => onReasoningEffortChange(value as ChatReasoningEffort)} value={reasoningEffort}>
              <SelectTrigger aria-label={t("chat.reasoningEffort")} className="chat-effort-select" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" className="chat-select-content chat-effort-menu" position="popper" sideOffset={8}>
                <SelectItem className="chat-select-item" value="low">
                  {t(chatReasoningLabelKey.low)}
                </SelectItem>
                <SelectItem className="chat-select-item" value="medium">
                  {t(chatReasoningLabelKey.medium)}
                </SelectItem>
                <SelectItem className="chat-select-item" value="high">
                  {t(chatReasoningLabelKey.high)}
                </SelectItem>
                <SelectItem className="chat-select-item" value="xhigh">
                  {t(chatReasoningLabelKey.xhigh)}
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              aria-label={t("chat.voiceInput")}
              className={cn(listening && "chat-control-active")}
              disabled={Boolean(activeRunId) || !speechAvailable}
              onClick={() => {
                const recognition = createSpeechRecognition({
                  onEnd: () => setListening(false),
                  onResult: (text) => onDraftChange([draft, text].filter(Boolean).join(draft ? "\n" : "")),
                  locale
                });
                if (!recognition) return;
                setListening(true);
                recognition.start();
              }}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Mic className="size-4" />
            </Button>
            <Button
              aria-label={activeRunId ? t("chat.queueSteer") : t("chat.sendMessage")}
              disabled={(!draft.trim() && !attachments.length) || !status?.available}
              onClick={onSend}
              size="icon"
              type="button"
            >
              <Send className="size-4" />
            </Button>
            {activeRunId ? (
              <Button aria-label={t("chat.stopRun")} onClick={onStop} size="icon" type="button" variant="destructive">
                <Square className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ChatContextBalance {
  detail: string;
  remainingRatio: number;
  usedRatio: number;
  tone: "ok" | "warn" | "bad" | "unknown";
}

function ChatContextBalanceHint({ balance }: { balance: ChatContextBalance }) {
  const style = {
    "--chat-context-used": `${Math.round(balance.usedRatio * 100)}%`
  } as CSSProperties;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={balance.detail}
          className={cn("chat-context-balance", `chat-context-balance-${balance.tone}`)}
          role="status"
          style={style}
          tabIndex={0}
        >
          <span className="chat-context-balance-ring" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{balance.detail}</TooltipContent>
    </Tooltip>
  );
}

function ChatConnectionStatus({ className, status }: { className?: string; status: HermesChatStatus | null }) {
  const { t } = useI18n();
  const available = Boolean(status?.available);
  const label = available ? t("chat.hermesOnline") : t("chat.hermesOffline");
  const detail = available ? status?.baseUrl : status?.error ?? "api_server unavailable";
  return (
    <span className={cn("chat-connection-status", className, available ? "chat-connection-status-ok" : "chat-connection-status-bad")} title={detail}>
      <span className="chat-connection-dot" />
      <span className="chat-connection-label">{label}</span>
      <span className="chat-connection-detail">{detail}</span>
    </span>
  );
}

interface ChatTranscriptItemModel {
  id: string;
  kind: "user" | "assistant" | "tool" | "system" | "notice" | "approval" | "thinking";
  text: string;
  agentText?: string;
  runId?: string;
  tool?: string;
  label?: string;
  toolCallId?: string;
  state?: "running" | "done" | "failed";
  choices?: string[];
  tools?: ChatTranscriptToolModel[];
}

interface ChatTranscriptToolModel {
  id: string;
  text: string;
  tool?: string;
  label?: string;
  toolCallId?: string;
  state?: "running" | "done" | "failed";
}

interface ChatTranscriptBuildOptions {
  thinkingId?: string | null;
}

const chatMarkdownComponents: Components = {
  img({ alt, src, ...props }) {
    return <img alt={alt ?? ""} loading="lazy" src={resolveChatMarkdownImageUrl(src)} {...props} />;
  }
};

function ChatTranscriptItem({
  item,
  onApprove
}: {
  item: ChatTranscriptItemModel;
  onApprove: (runId: string, choice: string) => void;
}) {
  const { t } = useI18n();
  const [toolDetailsExpanded, setToolDetailsExpanded] = useState(item.kind === "tool" && item.state !== "done");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (item.kind === "tool") setToolDetailsExpanded(item.state !== "done");
  }, [item.id, item.kind, item.state]);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timeout);
  }, [copied, item.id]);

  if (item.kind === "approval" && item.runId) {
    return (
      <div className="chat-line chat-line-system">
        <CircleAlert className="size-4" />
        <div className="chat-line-body">
          <span>{item.text}</span>
          <div className="chat-approval-actions">
            {(item.choices ?? ["once", "session", "always", "deny"]).map((choice) => (
              <Button key={choice} onClick={() => onApprove(item.runId ?? "", choice)} size="xs" type="button" variant="outline">
                {choice}
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (item.kind === "tool") {
    const tools = item.tools?.length
      ? item.tools
      : [
          {
            id: item.id,
            label: item.label,
            state: item.state,
            text: item.text,
            tool: item.tool,
            toolCallId: item.toolCallId
          }
        ];
    return (
      <div className={cn("chat-line chat-line-tool", item.state === "failed" && "chat-line-tool-failed")}>
        {item.state === "running" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : item.state === "failed" ? (
          <CircleAlert className="size-4" />
        ) : (
          <CheckCircle2 className="size-4" />
        )}
        <details
          className="chat-line-body chat-tool-details"
          onToggle={(event) => setToolDetailsExpanded(event.currentTarget.open)}
          open={toolDetailsExpanded}
        >
          <summary className="chat-tool-summary">
            <strong>{toolTranscriptSummary(item, tools, t)}</strong>
          </summary>
          <div className="chat-tool-list">
            {tools.map((tool) => (
              <div className="chat-tool-row" key={tool.id}>
                <strong>{tool.label ?? tool.tool}</strong>
                <span>{tool.text}</span>
              </div>
            ))}
          </div>
        </details>
      </div>
    );
  }

  if (item.kind === "thinking") {
    return (
      <div className="chat-line chat-line-thinking" aria-live="polite">
        <span className="chat-thinking-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <div className="chat-line-body">
          <span>{item.text}</span>
        </div>
      </div>
    );
  }

  const copyText = item.text.trim();
  const copyLabel = copied ? t("chat.copied") : t("chat.copyMessage");

  return (
    <div className={cn("chat-message", `chat-message-${item.kind}`)}>
      <div className="chat-message-role">{item.kind}</div>
      {copyText ? (
        <div className="chat-message-actions">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={copyLabel}
                className="chat-message-copy"
                data-copied={copied ? "true" : "false"}
                onClick={() => {
                  void copyChatMessageText(copyText)
                    .then(() => setCopied(true))
                    .catch(() => setCopied(false));
                }}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                {copied ? <CheckCircle2 className="size-3.5" /> : <Copy className="size-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copyLabel}</TooltipContent>
          </Tooltip>
        </div>
      ) : null}
      <div className="chat-message-text">
        {item.kind === "assistant" ? (
          <ReactMarkdown components={chatMarkdownComponents} remarkPlugins={[remarkGfm]}>
            {item.text}
          </ReactMarkdown>
        ) : (
          item.text
        )}
      </div>
    </div>
  );
}

async function copyChatMessageText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

function buildChatTranscript(events: HermesChatEvent[], t?: TFunction, options: ChatTranscriptBuildOptions = {}): ChatTranscriptItemModel[] {
  const items: ChatTranscriptItemModel[] = [];
  let assistant: ChatTranscriptItemModel | undefined;

  const closeAssistant = () => {
    assistant = undefined;
  };

  for (const [index, event] of events.entries()) {
    const name = event.event || event.type || "";

    if (name === "message.user") {
      closeAssistant();
      items.push({
        id: `user-${index}`,
        kind: "user",
        text: String(event.message ?? ""),
        agentText: typeof event.agentMessage === "string" ? event.agentMessage : undefined
      });
      continue;
    }

    if ((name === "message.delta" || name === "response.output_text.delta") && event.delta) {
      if (!assistant) {
        assistant = { id: `assistant-${index}`, kind: "assistant", text: "" };
        items.push(assistant);
      }
      assistant.text += event.delta;
      continue;
    }

    if (isRuntimeEvent(event)) {
      continue;
    }

    if (isToolStartedEvent(event)) {
      closeAssistant();
      appendToolTranscriptItem(items, createToolTranscriptItem(event, index, "running", t));
      continue;
    }

    if (isToolCompletedEvent(event)) {
      closeAssistant();
      const callId = toolEventCallId(event);
      const toolName = toolEventName(event);
      const tool = findRunningToolTranscriptItem(items, callId, toolName);
      const state = toolEventFailed(event) ? "failed" : "done";
      if (tool) {
        tool.state = state;
        tool.label = toolEventLabel(event, state, t);
        tool.text = toolEventText(event, state);
      } else {
        appendToolTranscriptItem(items, createToolTranscriptItem(event, index, state, t));
      }
      refreshToolTranscriptGroups(items);
      continue;
    }

    if (name === "approval.request") {
      closeAssistant();
      items.push({
        id: `approval-${index}`,
        kind: "approval",
        runId: event.run_id,
        text: String(event.preview ?? event.command ?? t?.("chat.approvalRequired") ?? "Approval required"),
        choices: event.choices
      });
      continue;
    }

    if (name === "approval.responded") {
      closeAssistant();
      items.push({
        id: `approval-response-${index}`,
        kind: "system",
        text: t?.("chat.approvalSent", { choice: String(event.choice ?? "sent") }) ?? `approval: ${event.choice ?? "sent"}`
      });
      continue;
    }

    if (name === "run.completed" || name === "response.completed") {
      const finalOutput = formatAssistantOutput(event.output);
      if (finalOutput && !assistantOutputAlreadyRendered(items, finalOutput)) {
        items.push({ id: `assistant-final-${index}`, kind: "assistant", text: finalOutput });
      }
      closeAssistant();
      continue;
    }

    if (isStatusPollTimeoutEvent(event)) {
      closeAssistant();
      items.push({
        id: `notice-${index}`,
        kind: "notice",
        text: String(event.error ?? "Hermes run is still running; waiting for final status.")
      });
      continue;
    }

    if (name === "run.failed" || name === "run.cancelled" || name === "approval.error" || name === "response.failed") {
      closeAssistant();
      items.push({
        id: `system-${index}`,
        kind: "system",
        text: String(event.error ?? event.event)
      });
    }
  }

  if (options.thinkingId && shouldShowThinkingIndicator(items)) {
    items.push({
      id: `thinking-${options.thinkingId}`,
      kind: "thinking",
      text: t?.("chat.thinking") ?? "Thinking"
    });
  }

  return items.filter((item) => item.text.trim() || item.kind === "tool" || item.kind === "approval" || item.kind === "thinking");
}

function shouldShowThinkingIndicator(items: ChatTranscriptItemModel[]): boolean {
  const lastVisible = [...items].reverse().find((item) => item.text.trim() || item.kind === "tool" || item.kind === "approval");
  if (!lastVisible) return true;
  if (lastVisible.kind === "approval") return false;
  if (lastVisible.kind === "tool") return lastVisible.state !== "running";
  if (lastVisible.kind === "system" || lastVisible.kind === "assistant") return false;
  return true;
}

function getChatContextBalance(model: string, events: HermesChatEvent[], t: TFunction): ChatContextBalance {
  const contextWindow = chatContextWindowTokens(model);
  if (!contextWindow) {
    return {
      detail: t("chat.contextUnconfigured", { model }),
      remainingRatio: 1,
      usedRatio: 0,
      tone: "unknown"
    };
  }
  const usedTokens = latestChatUsageTokens(events);
  const remainingTokens = Math.max(contextWindow - (usedTokens ?? 0), 0);
  const remainingRatio = remainingTokens / contextWindow;
  const usedRatio = Math.min(Math.max((usedTokens ?? 0) / contextWindow, 0), 1);
  const tone = remainingRatio < 0.1 ? "bad" : remainingRatio < 0.25 ? "warn" : "ok";
  return {
    detail:
      usedTokens === undefined
        ? t("chat.contextFull", { remaining: formatTokenBudget(contextWindow), total: formatTokenBudget(contextWindow) })
        : t("chat.contextRemaining", {
            remaining: formatTokenBudget(remainingTokens),
            total: formatTokenBudget(contextWindow),
            used: formatTokenBudget(usedTokens)
          }),
    remainingRatio,
    usedRatio,
    tone
  };
}

function chatContextWindowTokens(model: string): number | undefined {
  const normalized = model.replace(/^openai\//, "");
  return chatModelContextWindows[normalized] ?? chatModelContextWindows[model];
}

function latestChatUsageTokens(events: HermesChatEvent[]): number | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const usage = events[index].usage;
    const total = usageNumber(usage?.total_tokens);
    if (total !== undefined) return total;
    const input = usageNumber(usage?.input_tokens) ?? usageNumber(usage?.prompt_tokens);
    const output = usageNumber(usage?.output_tokens) ?? usageNumber(usage?.completion_tokens);
    if (input !== undefined || output !== undefined) return (input ?? 0) + (output ?? 0);
  }
  return undefined;
}

function usageNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function createToolTranscriptItem(
  event: HermesChatEvent,
  index: number,
  state: ChatTranscriptToolModel["state"],
  t?: TFunction
): ChatTranscriptToolModel {
  return {
    id: `tool-${index}`,
    state,
    label: toolEventLabel(event, state, t),
    text: toolEventText(event, state),
    tool: toolEventName(event),
    toolCallId: toolEventCallId(event)
  };
}

function appendToolTranscriptItem(items: ChatTranscriptItemModel[], tool: ChatTranscriptToolModel): void {
  const group = latestToolTranscriptGroup(items);
  if (group?.tools) {
    group.tools.push(tool);
  } else {
    items.push({
      id: `tool-group-${tool.id}`,
      kind: "tool",
      text: "",
      tools: [tool]
    });
  }
  refreshToolTranscriptGroups(items);
}

function latestToolTranscriptGroup(items: ChatTranscriptItemModel[]): ChatTranscriptItemModel | undefined {
  const item = items.at(-1);
  return item?.kind === "tool" ? item : undefined;
}

function findRunningToolTranscriptItem(
  items: ChatTranscriptItemModel[],
  callId: string | undefined,
  toolName: string
): ChatTranscriptToolModel | undefined {
  for (const item of [...items].reverse()) {
    if (item.kind !== "tool") continue;
    const tools = item.tools ?? [];
    const tool = [...tools]
      .reverse()
      .find(
        (candidate) =>
          candidate.state === "running" &&
          ((callId && candidate.toolCallId === callId) || (!callId && candidate.tool === toolName))
      );
    if (tool) return tool;
  }
  return undefined;
}

function refreshToolTranscriptGroups(items: ChatTranscriptItemModel[]): void {
  for (const group of items) {
    refreshToolTranscriptGroup(group);
  }
}

function refreshToolTranscriptGroup(group: ChatTranscriptItemModel): void {
  if (!group?.tools?.length) return;
  group.text = group.tools.map((tool) => [tool.label ?? tool.tool, tool.text].filter(Boolean).join(" ")).join("\n");
  group.state = group.tools.some((tool) => tool.state === "failed")
    ? "failed"
    : group.tools.some((tool) => tool.state === "running")
      ? "running"
      : "done";
  group.label = group.tools.length === 1 ? group.tools[0].label : "tool calls";
  group.tool = group.tools.length === 1 ? group.tools[0].tool : undefined;
  group.toolCallId = group.tools.length === 1 ? group.tools[0].toolCallId : undefined;
}

function assistantOutputAlreadyRendered(items: ChatTranscriptItemModel[], output: string): boolean {
  const normalizedOutput = output.trim();
  if (!normalizedOutput) return true;
  return items.some((item) => item.kind === "assistant" && item.text.trim().includes(normalizedOutput));
}

function formatAssistantOutput(output?: string): string {
  if (!output) return "";
  return output.replace(/^MEDIA:(\S+\.(?:png|jpe?g|gif|webp))$/gim, (_match, source: string) => {
    return `![generated image](${source})`;
  });
}

function isRuntimeEvent(event: HermesChatEvent): boolean {
  const name = event.event || event.type || "";
  return name === "agent-runtime" || name === "agent.runtime" || name === "runtime.resolved" || name === "run.started";
}

function buildAgentRuntimeEvent(
  run: HermesChatRunResponse,
  options: Pick<HermesChatRunOptions, "agentId" | "model" | "provider" | "permissionMode" | "reasoningEffort">
): HermesChatEvent {
  return {
    event: "agent-runtime",
    run_id: run.runId,
    timestamp: Date.now() / 1000,
    agentId: options.agentId,
    model: options.model,
    provider: options.provider,
    permissionMode: options.permissionMode,
    reasoningEffort: options.reasoningEffort,
    sessionId: run.sessionId,
    hermesSessionId: run.hermesSessionId,
    status: run.status
  };
}

function isToolStartedEvent(event: HermesChatEvent): boolean {
  const name = event.event || event.type || "";
  if (name === "tool.started") return true;
  if (name === "hermes.tool.progress") return event.status === "running" || event.status === "started";
  if (name === "response.output_item.added") return event.item?.type === "function_call";
  return false;
}

function isToolCompletedEvent(event: HermesChatEvent): boolean {
  const name = event.event || event.type || "";
  if (name === "tool.completed") return true;
  if (name === "hermes.tool.progress") return event.status === "completed" || event.status === "failed" || event.status === "error";
  if (name === "response.output_item.done") return event.item?.type === "function_call";
  if (name === "response.output_item.added") return event.item?.type === "function_call_output";
  return false;
}

function toolEventName(event: HermesChatEvent): string {
  return event.tool ?? event.name ?? event.item?.name ?? "tool";
}

function toolEventCallId(event: HermesChatEvent): string | undefined {
  return event.toolCallId ?? event.call_id ?? (typeof event.item?.call_id === "string" ? event.item.call_id : undefined);
}

function toolEventFailed(event: HermesChatEvent): boolean {
  return Boolean(event.error) || event.status === "failed" || event.status === "error" || event.item?.status === "failed";
}

function toolEventLabel(event: HermesChatEvent, state: ChatTranscriptItemModel["state"], t?: TFunction): string {
  const prefix =
    state === "running" ? (t?.("chat.toolUse") ?? "tool use") : state === "failed" ? (t?.("chat.toolFailed") ?? "tool failed") : (t?.("chat.toolCompleted") ?? "tool completed");
  return `${prefix}: ${toolEventName(event)}`;
}

function toolEventText(event: HermesChatEvent, state: ChatTranscriptItemModel["state"]): string {
  if (event.label) return event.label;
  if (event.preview) return event.preview;
  if (event.duration && state !== "running") return `duration=${event.duration}s`;
  if (event.error) return typeof event.error === "string" ? event.error : compactJson(event.error);
  if (event.item?.output !== undefined) return compactJson(event.item.output);
  if (event.item?.arguments !== undefined) return compactToolArguments(event.item.arguments);
  if (event.arguments !== undefined) return compactToolArguments(event.arguments);
  if (event.args !== undefined) return compactToolArguments(event.args);
  if (event.command) return event.command;
  if (event.status) return `status=${event.status}`;
  return state === "running" ? "running" : "completed";
}

function compactToolArguments(value: unknown): string {
  const text = compactJson(value);
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

function compactJson(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function SkillsView({
  agent,
  busy,
  onRefresh,
  onSearchChange,
  onToggle,
  search,
  skills
}: {
  agent?: SocialAgent;
  busy: string | null;
  onRefresh: () => void;
  onSearchChange: (value: string) => void;
  onToggle: (skill: HermesSkillInfo) => void;
  search: string;
  skills: HermesSkillInfo[];
}) {
  const { t } = useI18n();
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = skills.filter((skill) => {
    if (!normalizedSearch) return true;
    return [skill.name, skill.category, skill.description].some((value) => value.toLowerCase().includes(normalizedSearch));
  }).sort(sortHermesSkills);
  const enabled = skills.filter((skill) => skill.enabled).length;
  return (
    <div className="skills-shell">
      <div className="skills-toolbar">
        <div>
          <p>{agent ? `${agent.id} / ${agent.runner}` : t("chat.noAgentSelected")}</p>
          <h3>{t("skills.enabledSkills", { count: enabled })}</h3>
        </div>
        <div className="skills-toolbar-actions">
          <Input onChange={(event) => onSearchChange(event.target.value)} placeholder={t("skills.search")} value={search} />
          <Button onClick={onRefresh} size="sm" type="button" variant="outline">
            <RefreshCcw className="size-3.5" />
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      <div className="skills-list">
        {filtered.map((skill) => (
          <article className={cn("skill-card", !skill.enabled && "skill-card-disabled")} key={skill.path}>
            <div className="skill-card-main">
              <div className="skill-card-title">
                <h4>${skill.name}</h4>
                <Badge variant={skill.enabled ? "secondary" : "outline"}>{skill.status}</Badge>
              </div>
              <p>{skill.description || t("skills.noDescription")}</p>
              <span>{skill.category || t("chat.uncategorized")}</span>
            </div>
            <Button
              disabled={busy === `skill-${skill.name}`}
              onClick={() => onToggle(skill)}
              size="sm"
              type="button"
              variant={skill.enabled ? "outline" : "secondary"}
            >
              {busy === `skill-${skill.name}` ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {skill.enabled ? t("skills.disable") : t("skills.enable")}
            </Button>
          </article>
        ))}
        {!filtered.length ? <EmptyWide label={t("skills.noMatching")} /> : null}
      </div>
    </div>
  );
}

function HermesContextView({
  context,
  onRefresh,
  onReference,
  onSelectSession
}: {
  context: HermesContextSnapshot | null;
  onRefresh: () => void;
  onReference: () => void;
  onSelectSession: (sessionId: string) => void;
}) {
  const { locale, t } = useI18n();
  const selectedSession = context?.sessions.find((session) => session.id === context.selectedSessionId) ?? context?.sessions[0];
  return (
    <div className="hermes-context-shell">
      <div className="skills-toolbar">
        <div>
          <p>{context?.sourcePaths.stateDb ?? "~/.hermes/state.db"}</p>
          <h3>{t("hermes.contextTitle")}</h3>
        </div>
        <div className="skills-toolbar-actions">
          <Button disabled={!context} onClick={onReference} size="sm" type="button" variant="outline">
            <FileText className="size-3.5" />
            {t("hermes.referenceContext")}
          </Button>
          <Button onClick={onRefresh} size="sm" type="button" variant="outline">
            <RefreshCcw className="size-3.5" />
            {t("common.refresh")}
          </Button>
        </div>
      </div>

      {context ? (
        <>
          <div className="content-grid hermes-context-metrics">
            <Card size="sm">
              <CardHeader>
                <CardTitle>{t("hermes.selectedSession")}</CardTitle>
                <CardDescription>{selectedSession?.id ?? t("common.unknown")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <MetricRow label={t("common.source")} value={selectedSession?.source ?? t("common.unknown")} />
                <MetricRow label={t("chat.model")} value={selectedSession?.model ?? t("common.unknown")} />
                <MetricRow label={t("hermes.started")} value={formatDateTime(selectedSession?.startedAt, locale)} />
                <MetricRow label={t("hermes.ended")} value={selectedSession?.endedAt ? formatDateTime(selectedSession.endedAt, locale) : t("hermes.noEnd")} />
              </CardContent>
            </Card>
            <Card size="sm">
              <CardHeader>
                <CardTitle>{t("section.inventory")}</CardTitle>
                <CardDescription>{t("hermes.contextDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <MetricRow label={t("section.sessions")} value={String(context.sessions.length)} />
                <MetricRow label={t("hermes.messages")} value={String(context.messages.length)} />
                <MetricRow label={t("section.gatewayEvents")} value={String(context.gatewayEvents.length)} />
                <MetricRow label={t("hermes.tokens")} value={formatHermesTokens(selectedSession)} />
              </CardContent>
            </Card>
          </div>

          <div className="hermes-context-grid">
            <section className="hermes-context-panel">
              <div className="hermes-context-panel-header">
                <SectionLabel icon={Archive} label={t("section.hermesSessions")} />
              </div>
              <div className="hermes-session-list">
                {context.sessions.map((session) => (
                  <button
                    className={cn("hermes-session-row", context.selectedSessionId === session.id && "hermes-session-row-active")}
                    key={session.id}
                    onClick={() => onSelectSession(session.id)}
                    type="button"
                  >
                    <span>
                      <strong>{session.id}</strong>
                      <small>{[session.source, session.model, formatDateTime(session.startedAt, locale)].filter(Boolean).join(" / ")}</small>
                    </span>
                    <span className="hermes-session-meta">
                      {session.messageCount}m / {session.toolCallCount}t
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="hermes-context-panel">
              <div className="hermes-context-panel-header">
                <SectionLabel icon={MessageSquare} label={t("section.hermesMessages")} />
              </div>
              <div className="hermes-message-list">
                {context.messages.length ? (
                  context.messages.map((message) => <HermesMessageRow key={message.id} message={message} />)
                ) : (
                  <EmptyWide label={t("empty.noHermesMessages")} />
                )}
              </div>
            </section>

            <section className="hermes-context-panel">
              <div className="hermes-context-panel-header">
                <SectionLabel icon={Terminal} label={t("section.gatewayEvents")} />
              </div>
              <div className="hermes-event-list">
                {context.gatewayEvents.length ? (
                  context.gatewayEvents.map((event) => <HermesGatewayEventRow event={event} key={event.id} locale={locale} />)
                ) : (
                  <EmptyWide label={t("empty.noGatewayEvents")} />
                )}
              </div>
            </section>
          </div>
        </>
      ) : (
        <EmptyWide label={t("empty.noHermesContext")} />
      )}
    </div>
  );
}

function HermesMessageRow({ message }: { message: HermesMessageSummary }) {
  const text = message.contentPreview || message.toolCalls.map((tool) => `${tool.name} ${tool.argumentsPreview ?? ""}`).join("\n");
  return (
    <article className="hermes-message-row">
      <div className="hermes-message-role">{message.role}</div>
      <div className="hermes-message-body">
        <strong>{message.toolName ?? message.finishReason ?? message.sessionId}</strong>
        <p>{text || "empty"}</p>
      </div>
    </article>
  );
}

function HermesGatewayEventRow({ event, locale }: { event: HermesGatewayEvent; locale: I18nLocale }) {
  return (
    <article className="hermes-event-row">
      <div className="hermes-event-kind">{event.kind}</div>
      <div className="hermes-event-body">
        <strong>{[event.platform, event.chat, event.context].filter(Boolean).join(" / ") || event.logger || event.level}</strong>
        <p>{event.message}</p>
        <small>{formatDateTime(event.timestamp, locale)}</small>
      </div>
    </article>
  );
}

function JobLogPanel({
  compact,
  description,
  emptyLabel,
  job
}: {
  compact?: boolean;
  description?: string;
  emptyLabel?: string;
  job: JobSnapshot | null;
}) {
  const { t } = useI18n();
  const body = job?.logs.join("\n") || job?.command.join(" ");
  return (
    <div className={cn("job-log-panel", compact && "job-log-panel-compact")}>
      <div className="job-log-header">
        <div>
          <strong>{job?.type ?? t("jobs.noActive")}</strong>
          <span>{job ? job.command.join(" ") : description ?? t("jobs.description")}</span>
        </div>
        {job ? (
          <StatusBadge state={job.status === "succeeded" ? "ok" : job.status === "failed" ? "bad" : "warn"} label={job.status} />
        ) : null}
      </div>
      {job ? <pre className="job-log-output">{body}</pre> : <div className="empty-state">{emptyLabel ?? t("empty.noJobOutput")}</div>}
    </div>
  );
}

function extractOAuthUrlFromJob(job: JobSnapshot): string | null {
  const match = job.logs.join("\n").match(/https?:\/\/[^\s<>"']+/);
  return match?.[0]?.replace(/[),.;]+$/, "") ?? null;
}

function SetupView({
  auth,
  busy,
  hermes,
  hermesVideoAuth,
  hermesVideoAuthUrl,
  job,
  migration,
  onActivateHermesVideoAuth,
  onBootstrap,
  onLogin,
  onOpenHermesVideoAuthUrl,
  onRunMigration,
  openclaw
}: {
  auth: XhsAuthStatus | null;
  busy: string | null;
  hermes?: RuntimeStatus;
  hermesVideoAuth: HermesVideoAuthStatus | null;
  hermesVideoAuthUrl: string | null;
  job: JobSnapshot | null;
  migration: MigrationPlan | null;
  onActivateHermesVideoAuth: () => void;
  onBootstrap: () => void;
  onLogin: (mode: "qrcode" | "browser") => void;
  onOpenHermesVideoAuthUrl: () => void;
  onRunMigration: () => void;
  openclaw?: RuntimeStatus;
}) {
  const { t } = useI18n();
  return (
    <div className="content-grid">
      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("setup.growthAgent")}</CardTitle>
          <CardDescription>{t("setup.hermesRuntimeSurface")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <RuntimeLine runtime={hermes} label="Hermes" />
          <RuntimeLine runtime={openclaw} label="OpenClaw" />
          <MetricRow label={t("common.profile")} value={hermes?.profileExists ? t("common.ready") : t("common.missing")} />
          <MetricRow label="XHS skill" value={hermes?.skillInstalled ? t("common.installed") : t("common.missing")} />
          <Button className="w-full" disabled={busy === "bootstrap"} onClick={onBootstrap} type="button">
            {busy === "bootstrap" ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            Bootstrap
          </Button>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("setup.grokVideo")}</CardTitle>
          <CardDescription>{t("setup.grokVideoDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="metric-row">
            <span>{t("setup.state")}</span>
            <StatusBadge
              state={hermesVideoAuth?.configured ? "ok" : hermesVideoAuth?.installed === false ? "bad" : "warn"}
              label={hermesVideoAuth?.configured ? t("common.ready") : t("common.missing")}
            />
          </div>
          <MetricRow label="Hermes" value={hermesVideoAuth?.installed ? t("common.installed") : t("common.missing")} />
          <MetricRow label={t("setup.xaiOauth")} value={hermesVideoAuth?.authenticated ? t("common.ready") : t("common.missing")} />
          <MetricRow
            label={t("setup.apiServerTool")}
            value={hermesVideoAuth?.apiServerToolEnabled ? t("common.enabled") : t("common.missing")}
          />
          <MetricRow
            label={t("setup.providerModel")}
            value={[hermesVideoAuth?.provider, hermesVideoAuth?.model].filter(Boolean).join(" / ") || t("common.missing")}
          />
          {hermesVideoAuth?.message ? <p className="text-xs leading-relaxed text-muted-foreground">{hermesVideoAuth.message}</p> : null}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              disabled={busy === "hermes-video-auth" || hermesVideoAuth?.installed === false}
              onClick={onActivateHermesVideoAuth}
              type="button"
            >
              {busy === "hermes-video-auth" ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              {hermesVideoAuth?.configured ? t("setup.refreshGrokAuth") : t("setup.activateGrokVideo")}
            </Button>
            <Button disabled={!hermesVideoAuthUrl} onClick={onOpenHermesVideoAuthUrl} type="button" variant="outline">
              <ExternalLink className="size-4" />
              {t("setup.openAuthUrl")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("setup.legacyMigration")}</CardTitle>
          <CardDescription>{t("setup.xhsWorkspaceSync")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <MetricRow label={t("common.profiles")} value={String(migration?.profiles.length ?? 0)} />
          <MetricRow label={t("setup.toCopy")} value={String(migration?.copyCount ?? 0)} />
          <MetricRow label={t("setup.conflicts")} value={String(migration?.conflictCount ?? 0)} />
          <Button className="w-full" disabled={!migration?.copyCount || busy === "migration"} onClick={onRunMigration} type="button">
            {busy === "migration" ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
            {t("setup.runMigration")}
          </Button>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>{t("setup.xhsCli")}</CardTitle>
          <CardDescription>{t("setup.localAuthState")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <MetricRow label={t("setup.installed")} value={auth?.installed ? t("common.yes") : t("common.no")} />
          <MetricRow label={t("setup.scope")} value={auth?.scope ?? t("common.global")} />
          <MetricRow label={t("setup.state")} value={xhsAuthStateValue(auth, t)} />
          <MetricRow label={t("setup.signedIn")} value={xhsSignedInValue(auth, t)} />
          <MetricRow label={t("setup.account")} value={xhsAccountValue(auth, t)} />
          {auth?.message ? <p className="text-xs leading-relaxed text-muted-foreground">{auth.message}</p> : null}
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={busy?.startsWith("login")} onClick={() => onLogin("qrcode")} type="button" variant="outline">
              QR
            </Button>
            <Button disabled={busy?.startsWith("login")} onClick={() => onLogin("browser")} type="button" variant="outline">
              Browser
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="setup-job-card" size="sm">
        <CardHeader>
          <CardTitle>{t("jobs.latest")}</CardTitle>
          <CardDescription>{t("jobs.runtimeDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <JobLogPanel description={t("jobs.runtimeDescription")} emptyLabel={t("jobs.noRuntimeJob")} job={job} />
        </CardContent>
      </Card>
    </div>
  );
}

function SectionLabel({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="section-label">
      <Icon className="size-3.5" />
      <span>{label}</span>
    </div>
  );
}

function RuntimeLine({ runtime, label }: { runtime?: RuntimeStatus; label: string }) {
  const state = runtime?.state === "available" ? "ok" : runtime?.state === "degraded" ? "warn" : "bad";
  return (
    <div className="metric-row">
      <span className="flex min-w-0 items-center gap-2">
        {state === "ok" ? <CheckCircle2 className="size-3.5 text-teal-700" /> : <CircleAlert className="size-3.5 text-amber-700" />}
        <span className="truncate">{label}</span>
      </span>
      <StatusBadge state={state} label={runtime?.state ?? "unknown"} />
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-row">
      <span>{label}</span>
      <strong title={value}>{value}</strong>
    </div>
  );
}

function platformCliBadgeState(platform: SocialPlatformInfo): "ok" | "warn" | "bad" {
  if (platform.cli.state === "available" && platform.cli.authenticated !== false) return "ok";
  if (platform.cli.state === "missing") return "bad";
  return "warn";
}

function platformCliBadgeLabel(platform: SocialPlatformInfo, t: TFunction): string {
  if (platform.cli.state === "not-configured") return t("platform.cliNotConfigured", { platform: platform.shortLabel });
  if (platform.cli.state === "missing") return t("platform.cliMissing", { platform: platform.shortLabel });
  if (platform.cli.state === "degraded") return t("platform.cliUnknown", { platform: platform.shortLabel });
  if (platform.cli.authenticated === true) return t("platform.cliSignedIn", { platform: platform.shortLabel });
  if (platform.cli.authenticated === false) return t("platform.cliLoginNeeded", { platform: platform.shortLabel });
  return t("platform.cliAvailable", { platform: platform.shortLabel });
}

function platformCliDetail(platform: SocialPlatformInfo, t: TFunction): string {
  if (platform.cli.message) return platform.cli.message;
  if (platform.cli.path) return platform.cli.path;
  return platformCliBadgeLabel(platform, t);
}

function xhsAuthBadgeState(auth: XhsAuthStatus | null): "ok" | "warn" | "bad" {
  if (!auth) return "warn";
  if (!auth.installed) return "bad";
  return auth.authenticated ? "ok" : "warn";
}

function xhsAuthBadgeLabel(auth: XhsAuthStatus | null, t: TFunction): string {
  if (!auth) return "XHS CLI unknown";
  if (!auth.installed) return "XHS CLI missing";
  if (auth.authenticated) return "XHS CLI signed in";
  if (auth.guest || auth.state === "guest") return "XHS CLI partial";
  return "XHS CLI login needed";
}

function xhsAuthStateValue(auth: XhsAuthStatus | null, t: TFunction): string {
  if (!auth) return t("xhsAuth.unknown");
  if (!auth.installed) return t("xhsAuth.missingCli");
  if (auth.state === "guest") return t("xhsAuth.partial");
  return auth.state ?? (auth.authenticated ? t("xhsAuth.signedIn") : t("xhsAuth.missing"));
}

function xhsSignedInValue(auth: XhsAuthStatus | null, t: TFunction): string {
  if (!auth) return t("common.unknown");
  if (auth.authenticated) return t("common.yes");
  if (auth.guest || auth.state === "guest") return t("common.partial");
  return t("common.no");
}

function xhsAccountValue(auth: XhsAuthStatus | null, t: TFunction): string {
  if (!auth) return t("common.unknown");
  if (auth.authenticated) return auth.nickname ?? auth.redId ?? t("xhsAuth.signedIn");
  if (auth.guest || auth.state === "guest") return t("xhsAuth.guestPartial");
  return auth.nickname ?? t("common.unknown");
}

function AgentList({
  agents,
  onSelectAgent,
  selectedAgent
}: {
  agents: SocialAgent[];
  onSelectAgent?: (agentId: string) => void;
  selectedAgent?: SocialAgent;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-1">
      {agents.map((agent) => {
        const row = (
          <>
            <span className="truncate">{agent.id}</span>
            <Badge variant="outline">{agent.runner}</Badge>
          </>
        );
        const className = cn("sub-nav-row", selectedAgent?.id === agent.id && "sub-nav-row-active");
        return onSelectAgent ? (
          <button className={className} key={agent.id} onClick={() => onSelectAgent(agent.id)} type="button">
            {row}
          </button>
        ) : (
          <div className={className} key={agent.id}>
            {row}
          </div>
        );
      })}
      {!agents.length ? <EmptyCompact label={t("empty.noAgents")} /> : null}
    </div>
  );
}

function StatusBadge({ state, label }: { state: "ok" | "warn" | "bad"; label: string }) {
  const variant = state === "bad" ? "destructive" : state === "ok" ? "secondary" : "outline";
  return (
    <Badge className={cn(state === "ok" && "bg-teal-50 text-teal-700", state === "warn" && "border-amber-200 text-amber-700")} variant={variant}>
      {label}
    </Badge>
  );
}

function EmptyCompact({ label }: { label: string }) {
  return <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">{label}</div>;
}

function EmptyWide({ label }: { label: string }) {
  return <div className="empty-state col-span-full">{label}</div>;
}

function loadChatSessionState(): ChatSessionState {
  const sessions = readStoredChatSessions();
  const activeId = localStorage.getItem(activeChatSessionStorageKey);
  const activeSession = sessions.find((session) => session.id === activeId) ?? sessions[0];
  if (activeSession) return { sessions, activeId: activeSession.id };

  const session = createChatSession();
  return { sessions: [session], activeId: session.id };
}

function normalizeChatSessionState(value: unknown): ChatSessionState {
  const payload = isRecord(value) ? value : {};
  const rawSessions = Array.isArray(payload.sessions)
    ? payload.sessions
    : payload.session === undefined
      ? []
      : [payload.session];
  const sessions = sortChatSessions(rawSessions.map(normalizeStoredChatSession).filter((session): session is ChatSession => Boolean(session))).slice(
    0,
    chatSessionLimit
  );
  const activeId = typeof payload.activeId === "string" && sessions.some((session) => session.id === payload.activeId) ? payload.activeId : sessions[0]?.id;
  return { sessions, activeId: activeId ?? "" };
}

function withActiveChatSession(state: ChatSessionState, sessionId: string): ChatSessionState {
  return state.sessions.some((session) => session.id === sessionId) ? { ...state, activeId: sessionId } : state;
}

function saveChatSession(session: ChatSession): Promise<void> {
  const nextVersion = (chatSessionSaveVersions.get(session.id) ?? 0) + 1;
  chatSessionSaveVersions.set(session.id, nextVersion);
  const previous = chatSessionSaveQueues.get(session.id) ?? Promise.resolve();
  const queued = previous
    .catch(() => undefined)
    .then(async () => {
      if (chatSessionSaveVersions.get(session.id) !== nextVersion) return;
      await updateChatSessionApi(session);
    })
    .catch(() => undefined)
    .finally(() => {
      if (chatSessionSaveQueues.get(session.id) === queued) {
        chatSessionSaveQueues.delete(session.id);
        chatSessionSaveVersions.delete(session.id);
      }
    });
  chatSessionSaveQueues.set(session.id, queued);
  return queued;
}

function readStoredChatSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(chatSessionsStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return sortChatSessions(parsed.map(normalizeStoredChatSession).filter((session): session is ChatSession => Boolean(session))).slice(
      0,
      chatSessionLimit
    );
  } catch {
    return [];
  }
}

function normalizeStoredChatSession(value: unknown): ChatSession | null {
  if (!isRecord(value)) return null;
  const now = Date.now();
  const id = typeof value.id === "string" && value.id.trim() ? value.id : createChatSessionId();
  const events = Array.isArray(value.events) ? value.events.filter(isHermesChatEvent) : [];
  const title =
    typeof value.title === "string" && value.title.trim()
      ? value.title.slice(0, 80)
      : deriveChatSessionTitle(String(events.find((event) => event.event === "message.user")?.message ?? ""));
  const createdAt = typeof value.createdAt === "number" && Number.isFinite(value.createdAt) ? value.createdAt : now;
  const updatedAt = typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt) ? value.updatedAt : createdAt;
  return {
    id,
    title,
    createdAt,
    updatedAt,
    agentId: typeof value.agentId === "string" && value.agentId.trim() ? value.agentId : undefined,
    parentSessionId: typeof value.parentSessionId === "string" && value.parentSessionId.trim() ? value.parentSessionId : undefined,
    hermesSessionId: typeof value.hermesSessionId === "string" && value.hermesSessionId.trim() ? value.hermesSessionId : undefined,
    handoffSummary: typeof value.handoffSummary === "string" && value.handoffSummary.trim() ? value.handoffSummary : undefined,
    events
  };
}

function createChatSession(agentId?: string): ChatSession {
  const now = Date.now();
  return {
    id: createChatSessionId(),
    title: chatDefaultSessionTitle,
    createdAt: now,
    updatedAt: now,
    agentId,
    events: []
  };
}

function createChatSessionFromSocialBoardTask(task: SocialBoardTask): ChatSession {
  const now = Date.now();
  const session = createChatSession(task.agentId);
  const output = task.error ?? task.result ?? "Cron job completed.";
  return {
    ...session,
    title: deriveSocialBoardTaskSessionTitle(task),
    hermesSessionId: task.hermesSessionId,
    createdAt: now,
    updatedAt: now,
    events: [
      {
        event: "agent-runtime",
        timestamp: now / 1000,
        agentId: task.agentId,
        model: task.llm?.model,
        provider: task.llm?.provider,
        sessionId: session.id,
        hermesSessionId: task.hermesSessionId,
        status: "completed"
      },
      {
        event: task.error ? "run.failed" : "run.completed",
        timestamp: now / 1000,
        output: task.error ? undefined : output,
        error: task.error,
        hermesSessionId: task.hermesSessionId
      }
    ]
  };
}

function deriveSocialBoardTaskSessionTitle(task: SocialBoardTask): string {
  const title = task.title.replace(/\s+/g, " ").trim();
  return `Cron: ${title || task.lastJobId || task.id}`.slice(0, 80);
}

function createChatSessionId(): string {
  return `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sortChatSessions(sessions: ChatSession[]): ChatSession[] {
  return [...sessions].sort((left, right) => right.updatedAt - left.updatedAt);
}

function deriveChatSessionTitle(message: string): string {
  const title = message.replace(/\s+/g, " ").trim();
  if (!title) return chatDefaultSessionTitle;
  return title.length > 46 ? `${title.slice(0, 43)}...` : title;
}

function displayChatSessionTitle(session: ChatSession, t?: TFunction): string {
  const title = session.title.trim();
  if (!title || title === chatDefaultSessionTitle) return t?.("common.newSession") ?? chatDefaultSessionTitle;
  return title;
}

function displayHermesSessionTitle(session: HermesSessionSummary): string {
  return session.title?.trim() || session.model || session.id;
}

function countChatSessionMessages(session: ChatSession): number {
  return buildChatTranscript(session.events).filter((item) => item.kind === "user" || item.kind === "assistant").length;
}

function formatChatSessionSummary(session: ChatSession): string {
  const messages = countChatSessionMessages(session);
  return `${messages} messages / ${formatChatSessionTime(session.updatedAt)}`;
}

function formatChatSessionTime(value: number): string {
  if (!Number.isFinite(value)) return "never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isHermesChatEvent(value: unknown): value is HermesChatEvent {
  return isRecord(value) && typeof value.event === "string";
}

function topbarContext(activeView: DashboardView, selectedProfile: WorkspaceProfile | null, activePlatform: PlatformId, t: TFunction): string {
  if (activeView === "workspace") {
    return selectedProfile ? `~/.growth/${selectedProfile.profile}/${selectedProfile.platform}` : `~/.growth/${activePlatform}`;
  }
  if (activeView === "knowledge") return vaultWorkspaceRoot;
  if (activeView === "published") return selectedProfile ? `${t("topbar.publishedNotes")} / ${selectedProfile.profile}` : t("topbar.publishedNotes");
  if (activeView === "replies") return selectedProfile ? `${t("topbar.autoReplies")} / ${selectedProfile.profile}` : t("topbar.autoReplies");
  if (activeView === "chat") return t("topbar.agentConversation");
  if (activeView === "hermes") return t("topbar.hermesContext");
  if (activeView === "skills") return t("topbar.profileSkills");
  if (activeView === "setup") return t("topbar.runtimeAuth");
  return selectedProfile ? `${selectedProfile.platform}/${selectedProfile.profile}` : t("topbar.socialOps");
}

function calendarState(status: SocialTaskCalendarItem["status"]): "ok" | "warn" | "bad" {
  if (status === "failed") return "bad";
  if (status === "done" || status === "scheduled") return "ok";
  return "warn";
}

function calendarStatusLabel(status: SocialTaskCalendarItem["status"], t: TFunction): string {
  if (status === "scheduled") return t("section.scheduled");
  if (status === "paused") return t("cron.status.paused");
  if (status === "running") return t("board.status.running");
  return t(boardStatusLabelKey[status]);
}

function groupByPlatform(profiles: WorkspaceProfile[]) {
  return profiles.reduce<Record<string, WorkspaceProfile[]>>((acc, profile) => {
    acc[profile.platform] = acc[profile.platform] ?? [];
    acc[profile.platform].push(profile);
    return acc;
  }, {});
}

function isSelectedWorkspace(selected: WorkspaceProfile | null, profile: WorkspaceProfile): boolean {
  return selected?.profile === profile.profile && selected.platform === profile.platform;
}

interface ArtifactTreeNode {
  artifact: ArtifactInfo;
  children: ArtifactTreeNode[];
}

interface ArtifactTreeRow {
  node: ArtifactTreeNode;
  depth: number;
}

function buildArtifactTree(artifacts: ArtifactInfo[]): ArtifactTreeNode[] {
  const nodes = new Map<string, ArtifactTreeNode>();
  const roots: ArtifactTreeNode[] = [];

  function ensureNode(path: string, seed: ArtifactInfo, artifact?: ArtifactInfo): ArtifactTreeNode {
    const existing = nodes.get(path);
    if (existing) {
      if (artifact) existing.artifact = artifact;
      return existing;
    }

    const node: ArtifactTreeNode = {
      artifact: artifact ?? syntheticDirectory(path, seed),
      children: []
    };
    nodes.set(path, node);

    const parent = parentPath(path);
    if (parent) {
      ensureNode(parent, seed).children.push(node);
    } else {
      roots.push(node);
    }

    return node;
  }

  for (const artifact of artifacts) {
    ensureNode(artifact.path, artifact, artifact);
  }

  sortArtifactNodes(roots);
  return roots;
}

function flattenArtifactTree(nodes: ArtifactTreeNode[], expandedDirectories: Set<string>, depth = 0): ArtifactTreeRow[] {
  const rows: ArtifactTreeRow[] = [];
  for (const node of nodes) {
    rows.push({ node, depth });
    if (node.artifact.kind === "directory" && expandedDirectories.has(node.artifact.path)) {
      rows.push(...flattenArtifactTree(node.children, expandedDirectories, depth + 1));
    }
  }
  return rows;
}

function sortArtifactNodes(nodes: ArtifactTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.artifact.kind !== b.artifact.kind) return a.artifact.kind === "directory" ? -1 : 1;
    return a.artifact.name.localeCompare(b.artifact.name) || a.artifact.path.localeCompare(b.artifact.path);
  });
  for (const node of nodes) sortArtifactNodes(node.children);
}

function parentPath(path: string): string | undefined {
  const index = path.lastIndexOf("/");
  return index > 0 ? path.slice(0, index) : undefined;
}

function syntheticDirectory(path: string, seed: ArtifactInfo): ArtifactInfo {
  return {
    platform: seed.platform,
    profile: seed.profile,
    path,
    name: path.split("/").at(-1) ?? path,
    kind: "directory",
    mime: "directory",
    size: 0
  };
}

function sortHermesSkills(a: HermesSkillInfo, b: HermesSkillInfo): number {
  if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
  return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
}

function uniqueHermesSkillsByName(skills: HermesSkillInfo[]): HermesSkillInfo[] {
  const byName = new Map<string, HermesSkillInfo>();
  for (const skill of skills) {
    const key = skill.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, skill);
  }
  return [...byName.values()];
}

function activeSkillMentionQuery(value: string): string | null {
  const match = /(?:^|\s)\$([a-zA-Z0-9_.:-]*)$/.exec(value);
  return match ? (match[1] ?? "") : null;
}

function insertSkillMention(value: string, skillName: string): string {
  const replacement = `$${skillName} `;
  return value.replace(/(^|\s)\$([a-zA-Z0-9_.:-]*)$/, (_match, prefix: string) => `${prefix}${replacement}`);
}

function setSkillMention(value: string, skillName: string, selected: boolean): string {
  const mentionPattern = new RegExp(`(^|\\s)\\$${escapeRegExp(skillName)}(?=\\s|$)`, "gi");
  const hasMention = mentionPattern.test(value);
  if (selected) {
    if (hasMention) return value;
    const trimmed = value.trimStart();
    return trimmed ? `$${skillName} ${trimmed}` : `$${skillName} `;
  }
  return value
    .replace(mentionPattern, (_match, prefix: string) => prefix)
    .replace(/[ \t]{2,}/g, " ")
    .trimStart();
}

function removeSelectedSkillMentions(value: string, skills: HermesSkillInfo[]): string {
  return skills
    .reduce((next, skill) => next.replace(new RegExp(`(^|\\s)\\$${escapeRegExp(skill.name)}(?=\\s|$)`, "gi"), "$1"), value)
    .replace(/[ \t]{2,}/g, " ")
    .trimStart();
}

function mergeSelectedSkillMentions(value: string, skills: HermesSkillInfo[]): string {
  const skillTokens = skills.map((skill) => `$${skill.name}`).join(" ");
  const body = value.trimStart();
  return [skillTokens, body].filter(Boolean).join(body && skillTokens ? " " : "");
}

function skillPickerLabel(skills: HermesSkillInfo[], t: TFunction): string {
  if (!skills.length) return t("chat.selectSkillsShort");
  if (skills.length === 1) return `$${skills[0].name}`;
  return t("chat.selectedSkills", { count: skills.length });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSkillMentionNames(value: string): string[] {
  const names = new Set<string>();
  for (const match of value.matchAll(/(?:^|\s)\$([a-zA-Z0-9_.:-]+)/g)) {
    names.add(match[1]);
  }
  return [...names];
}

function resolveSkillMentions(value: string, skills: HermesSkillInfo[]): { skills: HermesSkillInfo[]; error?: string } {
  const byName = new Map(skills.map((skill) => [skill.name.toLowerCase(), skill]));
  const names = extractSkillMentionNames(value);
  const resolved: HermesSkillInfo[] = [];
  for (const name of names) {
    const skill = byName.get(name.toLowerCase());
    if (!skill) return { skills: resolved, error: `skill_not_found:${name}` };
    if (!skill.enabled) return { skills: resolved, error: `skill_disabled:${name}` };
    resolved.push(skill);
  }
  return { skills: resolved.sort(sortHermesSkills) };
}

async function getHermesChatStatus(): Promise<HermesChatStatus> {
  try {
    return await api<HermesChatStatus>("/api/chat/hermes/status");
  } catch (error) {
    return {
      available: false,
      baseUrl: "/api/chat",
      error: error instanceof Error ? error.message : "chat_api_unavailable"
    };
  }
}

async function getChatSessions(): Promise<ChatSessionsResponse> {
  return await api<ChatSessionsResponse>("/api/chat/sessions");
}

async function createChatSessionApi(session: ChatSession): Promise<ChatSessionsResponse> {
  return await api<ChatSessionsResponse>("/api/chat/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(session)
  });
}

async function importChatSessions(state: ChatSessionState): Promise<ChatSessionsResponse> {
  return await api<ChatSessionsResponse>("/api/chat/sessions/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state)
  });
}

async function updateChatSessionApi(session: ChatSession): Promise<ChatSessionResponse> {
  return await api<ChatSessionResponse>(`/api/chat/sessions/${encodeURIComponent(session.id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: session.title,
      agentId: session.agentId,
      parentSessionId: session.parentSessionId,
      hermesSessionId: session.hermesSessionId,
      handoffSummary: session.handoffSummary,
      events: session.events
    })
  });
}

async function activateChatSessionApi(sessionId: string): Promise<ChatSessionsResponse> {
  return await api<ChatSessionsResponse>(`/api/chat/sessions/${encodeURIComponent(sessionId)}/activate`, { method: "POST" });
}

async function handoffChatSessionApi(sessionId: string, agentId: string): Promise<ChatSessionsResponse> {
  return await api<ChatSessionsResponse>(`/api/chat/sessions/${encodeURIComponent(sessionId)}/handoff`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId })
  });
}

async function deleteChatSessionApi(sessionId: string): Promise<ChatSessionsResponse> {
  return await api<ChatSessionsResponse>(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
}

async function createHermesChatRun(
  input: string | HermesChatMessage[],
  sessionId: string,
  options: HermesChatRunOptions
): Promise<HermesChatRunResponse> {
  return await api<HermesChatRunResponse>("/api/chat/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentId: options.agentId,
      input,
      sessionId,
      hermesSessionId: options.hermesSessionId,
      instructions: options.instructions,
      model: options.model,
      provider: options.provider,
      permissionMode: options.permissionMode,
      reasoningEffort: options.reasoningEffort
    })
  });
}

async function getHermesRunStatus(runId: string): Promise<HermesChatRunStatus> {
  return await api<HermesChatRunStatus>(`/api/chat/runs/${encodeURIComponent(runId)}`);
}

async function consumeHermesRunEvents(runId: string, signal: AbortSignal, onEvent: (event: HermesChatEvent) => void): Promise<void> {
  const response = await fetch(`/api/chat/runs/${encodeURIComponent(runId)}/events`, { signal });
  if (!response.ok) throw new Error(await hermesErrorMessage(response));
  if (!response.body) throw new Error("hermes_event_stream_unavailable");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const event = parseHermesSseEvent(part);
      if (event) onEvent(event);
    }
  }

  const event = parseHermesSseEvent(buffer);
  if (event) onEvent(event);
}

async function waitForHermesRunTerminal(
  runId: string,
  signal: AbortSignal,
  onStatusEvent?: (event: HermesChatEvent) => void
): Promise<HermesChatEvent | null> {
  const deadline = Date.now() + 480000;
  let timeoutReported = false;
  while (!signal.aborted) {
    const lastStatus = await getHermesRunStatus(runId);
    const event = runStatusToTerminalEvent(lastStatus);
    if (event) return event;
    if (!timeoutReported && Date.now() >= deadline && lastStatus.status === "running") {
      timeoutReported = true;
      onStatusEvent?.({
        event: "run.status_poll_timeout",
        run_id: runId,
        timestamp: Date.now() / 1000,
        error: `run_status_poll_timeout:last_event=${lastStatus.lastEvent ?? "unknown"}`
      });
    }
    await sleep(3000, signal);
  }
  return null;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}

async function approveHermesRun(runId: string, choice: string): Promise<void> {
  await api(`/api/chat/runs/${encodeURIComponent(runId)}/approval`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ choice })
  });
}

async function stopHermesRun(runId: string): Promise<void> {
  await api(`/api/chat/runs/${encodeURIComponent(runId)}/stop`, { method: "POST" });
}

function parseHermesSseEvent(raw: string): HermesChatEvent | null {
  let sseEvent: string | undefined;
  const data = raw
    .split(/\r?\n/)
    .flatMap((line) => {
      if (line.startsWith("event:")) {
        const value = line.slice(6).trim();
        if (value) sseEvent = value;
        return [];
      }
      if (!line.startsWith("data:")) return [];
      return [line.slice(5).trimStart()];
    })
    .join("\n")
    .trim();
  if (!data || data === "[DONE]") return null;

  const parsed = JSON.parse(data) as unknown;
  if (!isRecord(parsed)) {
    return { event: sseEvent ?? "sse.message", message: String(parsed) };
  }
  const payloadEvent = typeof parsed.event === "string" ? parsed.event : undefined;
  const payloadType = typeof parsed.type === "string" ? parsed.type : undefined;
  return {
    ...parsed,
    event: payloadEvent ?? sseEvent ?? payloadType ?? "sse.message",
    type: payloadType ?? sseEvent
  } as HermesChatEvent;
}

function buildHermesChatInput(events: HermesChatEvent[], nextUserMessage: string): HermesChatMessage[] {
  return buildHermesChatInputFromTranscript(buildChatTranscript(events), nextUserMessage);
}

function runStatusToTerminalEvent(status: HermesChatRunStatus): HermesChatEvent | null {
  if (status.status === "completed") {
    return {
      event: "run.completed",
      run_id: status.runId,
      timestamp: status.updatedAt,
      output: status.output,
      usage: status.usage
    };
  }
  if (status.status === "failed") {
    return {
      event: "run.failed",
      run_id: status.runId,
      timestamp: status.updatedAt,
      error: status.error ?? status.output ?? "run_failed"
    };
  }
  if (status.status === "cancelled" || status.status === "canceled") {
    return {
      event: "run.cancelled",
      run_id: status.runId,
      timestamp: status.updatedAt,
      error: status.error
    };
  }
  return null;
}

function eventErrorMessage(event: HermesChatEvent, fallback: string): string {
  if (typeof event.error === "string") return event.error;
  if (isRecord(event.error) && typeof event.error.message === "string") return event.error.message;
  if (typeof event.output === "string" && event.output.trim()) return event.output.trim();
  return fallback;
}

function hermesLlmValue(selection: HermesLlmSelection): string {
  return `${selection.provider}::${selection.model}`;
}

function hermesLlmFromValue(value: string): HermesLlmSelection | undefined {
  const [provider, model] = value.split("::");
  if (!provider || !model) return undefined;
  return { provider, model };
}

function isRecoverableRunProgressEvent(event: HermesChatEvent): boolean {
  return isRuntimeEvent(event) || isToolStartedEvent(event) || isToolCompletedEvent(event) || isStatusPollTimeoutEvent(event);
}

async function hermesErrorMessage(response: Response): Promise<string> {
  const fallback = `${response.status} ${response.statusText}`.trim();
  try {
    const payload = (await response.json()) as { error?: string | { message?: string }; message?: string };
    if (typeof payload.error === "string") return payload.error;
    return payload.error?.message ?? payload.message ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeChatReasoningEffort(value: string): ChatReasoningEffort {
  return value === "low" || value === "medium" || value === "high" || value === "xhigh" ? value : "xhigh";
}

function normalizeChatPermissionMode(value: string): ChatPermissionMode {
  return value === "full_access" || value === "ask" || value === "read_only" ? value : "ask";
}

async function buildChatAttachment(file: File, workspace: WorkspaceProfile | null): Promise<ChatAttachment> {
  if (isImageChatAttachmentFile(file)) return await uploadChatImageAttachment(file, workspace);
  const content = truncateAttachmentContent(await file.text());
  return {
    id: chatAttachmentId(file),
    name: file.name,
    mime: file.type || "text/plain",
    size: file.size,
    content,
    kind: "text"
  };
}

async function uploadChatImageAttachment(file: File, workspace: WorkspaceProfile | null): Promise<ChatAttachment> {
  const form = new FormData();
  form.append("file", file);
  if (workspace) {
    form.append("platform", workspace.platform);
    form.append("profile", workspace.profile);
  }
  const payload = await api<ChatAttachmentUploadResponse>("/api/chat/attachments", {
    method: "POST",
    body: form
  });
  const artifact = payload.attachment.artifact;
  const previewUrl = artifactRawUrl(artifact.platform, artifact.profile, artifact.path);
  return {
    id: chatAttachmentId(file, artifact.path),
    name: file.name || artifact.name,
    mime: file.type || "image/*",
    size: artifact.size || file.size,
    content: imageAttachmentPromptContent({
      absolutePath: payload.attachment.absolutePath,
      mime: file.type || "image/*",
      path: artifact.path,
      previewUrl,
      size: artifact.size || file.size
    }),
    kind: "image",
    path: artifact.path,
    absolutePath: payload.attachment.absolutePath,
    previewUrl
  };
}

function chatAttachmentId(file: File, seed = ""): string {
  return `${file.name}-${file.size}-${file.lastModified}-${seed}-${Math.random().toString(36).slice(2)}`;
}

function truncateAttachmentContent(content: string): string {
  if (content.length <= chatAttachmentMaxChars) return content;
  return `${content.slice(0, chatAttachmentMaxChars)}\n\n[truncated:${content.length - chatAttachmentMaxChars} chars]`;
}

function buildHermesContextAttachmentContent(context: HermesContextSnapshot): string {
  return JSON.stringify(
    {
      generatedAt: context.generatedAt,
      selectedSessionId: context.selectedSessionId,
      sourcePaths: context.sourcePaths,
      sessions: context.sessions,
      messages: context.messages,
      gatewayEvents: context.gatewayEvents
    },
    null,
    2
  );
}

function summarizeAttachments(attachments: ChatAttachment[]): string {
  return attachments.map((attachment) => `[${attachment.kind === "image" ? "image" : "attachment"}] ${attachment.name}`).join("\n");
}

function buildChatMessageWithAttachments(message: string, attachments: ChatAttachment[]): string {
  if (!attachments.length) return message;
  const rendered = attachments.map(renderChatAttachment).join("\n\n");
  return [message, "Attached local context:", rendered].filter(Boolean).join("\n\n");
}

function renderChatAttachment(attachment: ChatAttachment): string {
  return [`### ${attachment.name}`, "", `- MIME: ${attachment.mime || "text/plain"}`, `- Size: ${formatBytes(attachment.size)}`, "", attachment.content]
    .filter(Boolean)
    .join("\n");
}

function imageAttachmentPromptContent(attachment: { absolutePath: string; mime: string; path: string; previewUrl: string; size: number }): string {
  return [
    "- Type: pasted image",
    `- Local path: ${attachment.absolutePath}`,
    `- Workspace path: ${attachment.path}`,
    `- Preview URL: ${attachment.previewUrl}`,
    "",
    "Use this pasted image as the user-provided visual input. If inspection is needed, read the local path above."
  ].join("\n");
}

function buildImageGenerationChatMessage(message: string, attachments: ChatAttachment[]): string {
  const prompt = buildChatMessageWithAttachments(message, attachments).trim() || summarizeAttachments(attachments);
  return [
    "GUI action: Create image.",
    "For Xiaohongshu/social visual work, information graphics, covers, posters, or dense visual summaries, use the `baoyu-infographic` skill when available.",
    "Call `skill_view(\"baoyu-infographic\")` before execution when that skill is available.",
    "Use Hermes' built-in `image_generate` only when `baoyu-infographic` is unavailable or the user explicitly asks for raw image_generate.",
    "Create exactly one image unless the user explicitly asks for multiple images.",
    "Use aspect_ratio `square` unless the prompt clearly asks for `landscape` or `portrait`.",
    "After the skill/tool returns, show the generated or reused result in chat as Markdown image syntax and include the concrete URL/path returned by the skill/tool.",
    "For generic image runs, the dashboard persists returned Hermes image files into the selected workspace under `artifacts/images/`; do not invent that generic artifact path.",
    "For Xiaohongshu publish covers, follow the profile SOP when present and copy/save the final selected image to `assets/<YYYY-MM-DD-topic-slug>/cover.png`.",
    "",
    "Prompt:",
    prompt
  ].join("\n");
}

function joinRunInstructions(...sections: Array<string | undefined>): string | undefined {
  const joined = sections.map((section) => section?.trim()).filter(Boolean).join("\n\n");
  return joined || undefined;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  start: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  const candidate = globalThis as typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

function createSpeechRecognition({
  locale,
  onEnd,
  onResult
}: {
  locale: I18nLocale;
  onEnd: () => void;
  onResult: (text: string) => void;
}): SpeechRecognitionInstance | null {
  const Constructor = getSpeechRecognitionConstructor();
  if (!Constructor) return null;
  const recognition = new Constructor();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = speechLocale(locale);
  recognition.onend = onEnd;
  recognition.onerror = onEnd;
  recognition.onresult = (event) => {
    const text = Array.from(event.results)
      .map((result) => result[0]?.transcript ?? "")
      .join("")
      .trim();
    if (text) onResult(text);
  };
  return recognition;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    throw new Error(await hermesErrorMessage(response));
  }
  return (await response.json()) as T;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function artifactPreviewUrl(artifact: ArtifactInfo): string {
  return artifactRawUrl(artifact.platform, artifact.profile, artifact.path);
}

function artifactRawUrl(platform: string, profile: string, path: string): string {
  if (platform === vaultWorkspacePlatform && profile === vaultWorkspaceProfile) {
    return `/api/vault/artifact/raw?path=${encodeURIComponent(path)}`;
  }
  return `/api/platforms/${encodeURIComponent(platform)}/profiles/${encodeURIComponent(profile)}/artifact/raw?path=${encodeURIComponent(path)}`;
}

function resolveMarkdownAssetUrl(artifact: ArtifactInfo, source?: string): string {
  if (!source || source.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(source)) return source ?? "";
  const base = parentPath(artifact.path);
  const path = normalizeArtifactPath(source.startsWith("/") ? source.slice(1) : [base, source].filter(Boolean).join("/"));
  return artifactRawUrl(artifact.platform, artifact.profile, path);
}

function normalizeArtifactPath(path: string): string {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/");
}

function formatDateTime(value: string | undefined, locale: I18nLocale): string {
  if (!value) return locale === "en" ? "not scheduled" : locale === "zh-Hant" ? "未排程" : "未排期";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatPublishedDate(value: string | undefined, locale: I18nLocale): string {
  if (!value) return locale === "en" ? "No timestamp" : locale === "zh-Hant" ? "未記錄時間" : "未记录时间";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatCompactNumber(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "0";
  if (value >= 10000) return `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}w`;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(value);
}

function formatTokenBudget(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
  return String(Math.round(value));
}

function formatHermesTokens(session: HermesSessionSummary | undefined): string {
  if (!session) return "0";
  return formatTokenBudget(session.tokens.input + session.tokens.output + session.tokens.cacheRead + session.tokens.cacheWrite + session.tokens.reasoning);
}

function publishedStatusState(status: XhsPublishedPostStatus): "ok" | "warn" | "bad" {
  if (status === "needs-review") return "bad";
  if (status === "monitoring" || status === "archived") return "warn";
  return "ok";
}

function autoReplyStatusState(status: XhsAutoReplyItemStatus): "ok" | "warn" | "bad" {
  if (status === "failed" || status === "needs-review") return "bad";
  if (status === "pending" || status === "drafted") return "warn";
  return "ok";
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function publishedCardAspect(index: number, post: XhsPublishedPost): string {
  if (post.contentType === "video") return "3 / 4";
  if (!post.coverUrl) return index % 3 === 0 ? "4 / 5" : "1 / 1";
  return index % 5 === 0 ? "4 / 5" : index % 4 === 0 ? "1 / 1" : "3 / 4";
}

function formatCalendarDay(value: Date, locale: I18nLocale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    day: "2-digit"
  }).format(value);
}

function formatWeekday(value: Date, locale: I18nLocale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { weekday: "short" }).format(value);
}

function formatTime(value: string, locale: I18nLocale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function resolveDefaultCalendarWeekStart(items: SocialTaskCalendarItem[], jobs: SocialCronJob[]): Date {
  const currentWeekStart = startOfWeek(new Date());
  const currentWeekEnd = addDays(currentWeekStart, 7);
  const candidateDates = [
    ...items.map((item) => new Date(item.startsAt)),
    ...jobs.filter((job) => job.enabled && job.nextRunAt).map((job) => new Date(job.nextRunAt as string))
  ].filter((date) => !Number.isNaN(date.getTime()));
  const hasCurrentWeekItems = candidateDates.some((date) => isDateInRange(date, currentWeekStart, currentWeekEnd));
  if (hasCurrentWeekItems || !candidateDates.length) return currentWeekStart;

  const firstDate = candidateDates.sort((a, b) => a.getTime() - b.getTime())[0];
  return startOfWeek(firstDate);
}

function isDateInRange(value: Date, start: Date, end: Date): boolean {
  return value >= start && value < end;
}

function startOfWeek(value: Date): Date {
  const day = startOfLocalDay(value);
  const dayIndex = day.getDay() || 7;
  return addDays(day, 1 - dayIndex);
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function sameLocalDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
