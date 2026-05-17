import {
  Activity,
  Archive,
  Bookmark,
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
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
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import type {
  ArtifactContent,
  ArtifactInfo,
  HermesLlmSelection,
  HermesModelOptions,
  HermesModelOption,
  HermesSkillInfo,
  JobSnapshot,
  MigrationPlan,
  RuntimeStatus,
  SocialAgent,
  SocialBoardTask,
  SocialBoardTaskStatus,
  SocialCronJob,
  SocialCronTaskType,
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
import { resolveChatMarkdownImageUrl } from "@/chatMarkdown";
import { cn } from "@/lib/utils";

interface WorkspacesResponse {
  profiles: WorkspaceProfile[];
}

interface RuntimeResponse {
  runtimes: RuntimeStatus[];
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

interface PersistHermesRunArtifactsResponse {
  artifacts: Array<{
    path: string;
    size: number;
    contentType: string;
  }>;
}

interface HermesChatRunOptions {
  agentId: string;
  instructions?: string;
  model: string;
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
  model?: string;
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
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  agentId?: string;
  events: HermesChatEvent[];
}

interface ChatSessionState {
  sessions: ChatSession[];
  activeId: string;
}

type ChatEventsUpdate = HermesChatEvent[] | ((current: HermesChatEvent[]) => HermesChatEvent[]);

const platformLabel: Record<string, string> = {
  xiaohongshu: "Xiaohongshu",
  youtube: "YouTube",
  facebook: "Facebook",
  x: "X",
  instagram: "Instagram"
};

const socialCronTaskLabel: Record<SocialCronTaskType, string> = {
  "workspace-diagnosis": "Diagnosis",
  "daily-ops-refresh": "Daily Ops",
  "health-report": "Health",
  "auto-reply": "Auto Replies"
};

const publishedPostStatusLabel: Record<XhsPublishedPostStatus, string> = {
  published: "已发布",
  monitoring: "监测中",
  "needs-review": "需复盘",
  archived: "已归档"
};

const publishedPostStatusOptions: Array<XhsPublishedPostStatus | "all"> = ["all", "published", "monitoring", "needs-review", "archived"];
const autoReplyStatusLabel: Record<XhsAutoReplyItemStatus, string> = {
  pending: "待回复",
  drafted: "已起草",
  sent: "已发送",
  skipped: "已跳过",
  "needs-review": "需复核",
  failed: "失败",
  "already-replied": "已回复"
};
const autoReplyLocaleLabel: Record<XhsAutoReplyLocale, string> = {
  "zh-CN": "中国简中",
  "zh-HK": "香港繁中",
  "zh-TW": "台湾繁中",
  en: "英语",
  "zh-SG-MY": "新马简中"
};
const autoReplyLocaleOptions = Object.keys(autoReplyLocaleLabel) as XhsAutoReplyLocale[];
const defaultAutoReplySettings: XhsAutoReplySettings = {
  stylePrompt: "",
  locale: "zh-CN",
  dryRun: true,
  maxRepliesPerRun: 10,
  delaySeconds: 12
};
const defaultSocialCronTaskTypes: SocialCronTaskType[] = ["workspace-diagnosis", "daily-ops-refresh", "health-report", "auto-reply"];
const boardStatuses: SocialBoardTaskStatus[] = ["todo", "ready", "running", "blocked", "done", "failed", "archived"];
const chatPermissionLabels: Record<ChatPermissionMode, string> = {
  full_access: "完全访问权限",
  ask: "询问权限",
  read_only: "只读模式"
};
const chatReasoningLabels: Record<ChatReasoningEffort, string> = {
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "超高"
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

type DashboardView = "workspace" | "published" | "replies" | "calendar" | "board" | "chat" | "skills" | "jobs" | "setup";

const dashboardNav: Array<{ id: DashboardView; label: string; icon: LucideIcon }> = [
  { id: "workspace", label: "Workspace", icon: LayoutDashboard },
  { id: "published", label: "Published Posts", icon: ImageIcon },
  { id: "replies", label: "Auto Replies", icon: Reply },
  { id: "calendar", label: "Task Calendar", icon: CalendarClock },
  { id: "board", label: "Social Board", icon: Bot },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "skills", label: "Skills", icon: Gauge },
  { id: "jobs", label: "Job Log", icon: Terminal },
  { id: "setup", label: "Setup", icon: KeyRound }
];

const defaultChatModel = localStorage.getItem("growth-hacker.chatModel") ?? "gpt-5.5";
const defaultChatReasoningEffort = normalizeChatReasoningEffort(localStorage.getItem("growth-hacker.chatReasoningEffort") ?? "xhigh");
const defaultChatPermissionMode = normalizeChatPermissionMode(localStorage.getItem("growth-hacker.chatPermissionMode") ?? "ask");

export function App() {
  const [profiles, setProfiles] = useState<WorkspaceProfile[]>([]);
  const [runtimes, setRuntimes] = useState<RuntimeStatus[]>([]);
  const [migration, setMigration] = useState<MigrationPlan | null>(null);
  const [auth, setAuth] = useState<XhsAuthStatus | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactInfo[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<WorkspaceProfile | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<ArtifactContent | null>(null);
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
  const [hermesModelOptions, setHermesModelOptions] = useState<HermesModelOptions>(fallbackHermesModelOptions);
  const [hermesSkills, setHermesSkills] = useState<HermesSkillInfo[]>([]);
  const [chatSessionState, setChatSessionState] = useState<ChatSessionState>(() => loadChatSessionState());
  const [activeChatRunId, setActiveChatRunId] = useState<string | null>(null);
  const [chatPermissionMode, setChatPermissionMode] = useState<ChatPermissionMode>(defaultChatPermissionMode);
  const [chatModel, setChatModel] = useState(defaultChatModel);
  const [chatReasoningEffort, setChatReasoningEffort] = useState<ChatReasoningEffort>(defaultChatReasoningEffort);
  const [chatAttachments, setChatAttachments] = useState<ChatAttachment[]>([]);
  const [chatComposerNotice, setChatComposerNotice] = useState<string | null>(null);
  const [chatComposerMode, setChatComposerMode] = useState<ChatComposerMode>(null);
  const [socialCronTaskTypes, setSocialCronTaskTypes] = useState<SocialCronTaskType[]>(defaultSocialCronTaskTypes);
  const [socialCronTaskType, setSocialCronTaskType] = useState<SocialCronTaskType>("workspace-diagnosis");
  const [socialCronSchedule, setSocialCronSchedule] = useState("daily 09:00");
  const [socialCronAgentId, setSocialCronAgentId] = useState("growth-agent");
  const [selectedLlmValue, setSelectedLlmValue] = useState(localStorage.getItem("growth-hacker.socialLlm") ?? "");
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(() => new Set());
  const [activeView, setActiveView] = useState<DashboardView>("workspace");
  const [chatDraft, setChatDraft] = useState("");
  const [skillSearch, setSkillSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const recoveringRunIdsRef = useRef<Set<string>>(new Set());

  const refresh = async () => {
    const [
      workspacePayload,
      runtimePayload,
      migrationPayload,
      authPayload,
      socialCronPayload,
      socialBoardPayload,
      socialCalendarPayload,
      hermesModelsPayload,
      chatStatusPayload
    ] = await Promise.all([
      api<WorkspacesResponse>("/api/workspaces"),
      api<RuntimeResponse>("/api/runtimes"),
      api<MigrationPlan>("/api/migrations/xiaohongshu-legacy/plan", { method: "POST" }),
      api<XhsAuthStatus>("/api/platforms/xiaohongshu/auth"),
      api<SocialCronResponse>("/api/social-cron/jobs").catch(() => ({
        jobs: [],
        agents: ["growth-agent"],
        socialAgents: [{ id: "growth-agent", runner: "local" as const }],
        taskTypes: defaultSocialCronTaskTypes
      })),
      api<SocialBoardResponse>("/api/social-board/tasks").catch(() => ({ tasks: [], agents: [], taskTypes: defaultSocialCronTaskTypes })),
      api<SocialCalendarResponse>("/api/social-calendar/items").catch(() => ({ items: [] })),
      api<HermesModelOptions>("/api/hermes/models").catch(() => fallbackHermesModelOptions),
      getHermesChatStatus()
    ]);
    setProfiles(workspacePayload.profiles);
    setRuntimes(runtimePayload.runtimes);
    setMigration(migrationPayload);
    setAuth(authPayload);
    setSocialCronJobs(socialCronPayload.jobs);
    setSocialCronAgents(socialCronPayload.agents);
    setSocialAgents(socialCronPayload.socialAgents ?? socialBoardPayload.agents);
    setSocialBoardTasks(socialBoardPayload.tasks);
    setSocialCalendarItems(socialCalendarPayload.items);
    setHermesModelOptions(hermesModelsPayload.models.length ? hermesModelsPayload : fallbackHermesModelOptions);
    setHermesChatStatus(chatStatusPayload);
    setSocialCronTaskTypes(socialCronPayload.taskTypes.length ? socialCronPayload.taskTypes : defaultSocialCronTaskTypes);
    if (!selectedProfile && workspacePayload.profiles[0]) setSelectedProfile(workspacePayload.profiles[0]);
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
    if (!selectedProfile) return;
    setExpandedDirectories(new Set());
    setPublishedSyncNotice(null);
    setAutoReplyNotice(null);
    void api<{ artifacts: ArtifactInfo[] }>(
      `/api/platforms/${encodeURIComponent(selectedProfile.platform)}/profiles/${encodeURIComponent(selectedProfile.profile)}/artifacts`
    ).then((payload) => {
      setArtifacts(payload.artifacts);
      const first =
        payload.artifacts.find((item) => item.kind === "file" && item.path === "01-client-brief.md") ??
        payload.artifacts.find((item) => item.kind === "file" && !item.path.includes("/")) ??
        payload.artifacts.find((item) => item.kind === "file");
      if (first) void openArtifact(first);
    });
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
    localStorage.setItem("growth-hacker.chatPermissionMode", chatPermissionMode);
  }, [chatPermissionMode]);

  useEffect(() => {
    localStorage.setItem("growth-hacker.chatModel", chatModel);
  }, [chatModel]);

  useEffect(() => {
    localStorage.setItem("growth-hacker.chatReasoningEffort", chatReasoningEffort);
  }, [chatReasoningEffort]);

  useEffect(() => {
    if (selectedLlmValue) localStorage.setItem("growth-hacker.socialLlm", selectedLlmValue);
  }, [selectedLlmValue]);

  useEffect(() => {
    localStorage.setItem(chatSessionsStorageKey, JSON.stringify(chatSessionState.sessions));
    localStorage.setItem(activeChatSessionStorageKey, chatSessionState.activeId);
  }, [chatSessionState]);

  const hermes = runtimes.find((runtime) => runtime.kind === "hermes");
  const openclaw = runtimes.find((runtime) => runtime.kind === "openclaw");
  const profileGroups = useMemo(() => groupByPlatform(profiles), [profiles]);
  const artifactTree = useMemo(() => buildArtifactTree(artifacts), [artifacts]);
  const visibleArtifacts = useMemo(() => flattenArtifactTree(artifactTree, expandedDirectories), [artifactTree, expandedDirectories]);
  const activeChatSession = chatSessionState.sessions.find((session) => session.id === chatSessionState.activeId) ?? chatSessionState.sessions[0];
  const chatEvents = activeChatSession?.events ?? [];

  useEffect(() => {
    if (!activeChatSession) return;
    const runId = findRunMissingTerminalEvent(activeChatSession.events);
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

  const selectedChatAgentId = activeView === "chat" ? activeChatSession?.agentId : undefined;
  const selectedSocialAgent =
    socialAgents.find((agent) => agent.id === selectedChatAgentId) ??
    socialAgents.find((agent) => agent.id === socialCronAgentId) ??
    socialAgents[0];
  const selectedLlm = hermesLlmFromValue(selectedLlmValue) ?? hermesModelOptions.current;
  const activeNavItem = dashboardNav.find((item) => item.id === activeView) ?? dashboardNav[0];
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

  async function openArtifact(artifact: ArtifactInfo) {
    if (!selectedProfile || artifact.kind !== "file") return;
    const payload = await api<ArtifactContent>(
      `/api/platforms/${encodeURIComponent(artifact.platform)}/profiles/${encodeURIComponent(
        artifact.profile
      )}/artifact?path=${encodeURIComponent(artifact.path)}`
    );
    setSelectedArtifact(payload);
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
      setPublishedSyncNotice(`同步完成：新增 ${payload.imported}，更新 ${payload.updated}，归档 ${payload.archived}`);
    } catch (error) {
      setPublishedSyncNotice(error instanceof Error ? error.message : "同步失败");
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
      setAutoReplyNotice("回复风格已保存。");
    } catch (error) {
      setAutoReplyNotice(error instanceof Error ? error.message : "保存失败");
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
      const errorText = payload.errors.length ? `；错误 ${payload.errors.length}` : "";
      setAutoReplyNotice(`同步完成：新增 ${payload.imported}，更新 ${payload.updated}，已回复 ${payload.alreadyReplied}${errorText}`);
    } catch (error) {
      setAutoReplyNotice(error instanceof Error ? error.message : "同步失败");
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
      setActiveView("jobs");
    } catch (error) {
      setAutoReplyNotice(error instanceof Error ? error.message : "启动失败");
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

  async function reloadHermesSkills(agentId = selectedSocialAgent?.id): Promise<HermesSkillInfo[]> {
    if (!agentId) {
      setHermesSkills([]);
      return [];
    }
    const payload = await api<HermesSkillsResponse>(`/api/agents/${encodeURIComponent(agentId)}/skills`).catch(() => ({ skills: [] }));
    setHermesSkills(payload.skills);
    return payload.skills;
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
      setActiveView("jobs");
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
      setActiveView("jobs");
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

  function watchJob(job: JobSnapshot, onDone?: () => void) {
    setSelectedJob(job);
    const source = new EventSource(`/api/jobs/${job.id}/events`);
    source.onmessage = (event) => {
      const next = JSON.parse(event.data) as JobSnapshot;
      setSelectedJob(next);
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
    const accepted = candidates.filter(isSupportedChatAttachment);
    const rejected = candidates.filter((file) => !isSupportedChatAttachment(file));
    if (rejected.length) {
      setChatComposerNotice(`已忽略 ${rejected.length} 个非文本附件`);
    } else {
      setChatComposerNotice(null);
    }
    const nextAttachments = await Promise.all(
      accepted.map(async (file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        mime: file.type || "text/plain",
        size: file.size,
        content: truncateAttachmentContent(await file.text())
      }))
    );
    setChatAttachments((current) => [...current, ...nextAttachments]);
  }

  function removeChatAttachment(id: string) {
    setChatAttachments((current) => current.filter((attachment) => attachment.id !== id));
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
        return {
          ...session,
          events,
          title: shouldNameSession ? titleHint : session.title,
          updatedAt: now
        };
      });
      if (!touched) return current;
      return { ...current, sessions: sortChatSessions(sessions).slice(0, chatSessionLimit) };
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
  }

  function selectChatSession(sessionId: string) {
    if (activeChatRunId) return;
    const next = chatSessionState.sessions.find((session) => session.id === sessionId);
    if (!next) return;
    setChatSessionState((current) => ({ ...current, activeId: sessionId }));
    if (next.agentId) setSocialCronAgentId(next.agentId);
    setChatDraft("");
    setChatAttachments([]);
    setChatComposerNotice(null);
    setChatComposerMode(null);
  }

  function renameChatSession(sessionId: string, title: string) {
    setChatSessionState((current) => ({
      ...current,
      sessions: current.sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              title: title.slice(0, 80),
              updatedAt: Date.now()
            }
          : session
      )
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
      sessions: current.sessions.map((session) =>
        session.id === activeChatSession.id
          ? {
              ...session,
              agentId,
              updatedAt: Date.now()
            }
          : session
      )
    }));
  }

  async function sendChatMessage() {
    const message = chatDraft.trim();
    if ((!message && !chatAttachments.length) || activeChatRunId || !activeChatSession) return;
    const agentId = selectedSocialAgent?.id ?? socialCronAgentId;
    const runComposerMode = chatComposerMode;
    const skillMentions = resolveSkillMentions(message, hermesSkills);
    if (skillMentions.error) {
      updateChatSessionEvents(activeChatSession.id, (current) => [
        ...current,
        { event: "run.failed", error: skillMentions.error, timestamp: Date.now() / 1000 }
      ]);
      return;
    }
    const runPermissionMode = chatPermissionMode;
    const runProfile = selectedProfile;
    const outgoingMessage =
      runComposerMode === "image" ? buildImageGenerationChatMessage(message, chatAttachments) : buildChatMessageWithAttachments(message, chatAttachments);
    const clientSessionId = activeChatSession.id;
    const priorChatEvents = activeChatSession.events;
    const visibleUserMessage =
      runComposerMode === "image" ? `Create image: ${message || summarizeAttachments(chatAttachments)}` : message || summarizeAttachments(chatAttachments);
    setChatDraft("");
    setChatAttachments([]);
    setChatComposerNotice(null);
    setChatComposerMode(null);
    updateChatSessionEvents(
      clientSessionId,
      (current) => [
        ...current,
        { event: "message.user", message: visibleUserMessage, timestamp: Date.now() / 1000 }
      ],
      deriveChatSessionTitle(visibleUserMessage)
    );
    setBusy("chat-run");
    let runId: string | null = null;
    let receivedTerminalEvent = false;
    try {
      const run = await createHermesChatRun(
        buildHermesChatInput(priorChatEvents, outgoingMessage),
        clientSessionId,
        {
          agentId,
          instructions: buildSkillInstructions(skillMentions.skills),
          model: chatModel,
          permissionMode: runPermissionMode,
          reasoningEffort: chatReasoningEffort
        }
      );
      runId = run.runId;
      setActiveChatRunId(run.runId);
      updateChatSessionEvents(clientSessionId, (current) => [
        ...current,
        buildAgentRuntimeEvent(run, {
          agentId,
          model: chatModel,
          permissionMode: runPermissionMode,
          reasoningEffort: chatReasoningEffort
        })
      ]);
      const controller = new AbortController();
      chatAbortRef.current = controller;
      const finishWithTerminalEvent = async (next: HermesChatEvent) => {
        if (receivedTerminalEvent) return;
        receivedTerminalEvent = true;
        if (next.event === "run.completed") await persistChatRunArtifacts(next.run_id, runProfile);
        updateChatSessionEvents(clientSessionId, (current) =>
          next.run_id && hasTerminalEventForRun(current, next.run_id) ? current : [...current, next]
        );
        setActiveChatRunId(null);
        setBusy(null);
        controller.abort();
        void refresh();
      };
      let statusPollError: unknown;
      const statusPoll = waitForHermesRunTerminal(run.runId, controller.signal)
        .then(async (terminalEvent) => {
          if (terminalEvent) await finishWithTerminalEvent(terminalEvent);
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          statusPollError = error;
        });
      await consumeHermesRunEvents(run.runId, controller.signal, (next) => {
        if (isTerminalRunEvent(next)) {
          void finishWithTerminalEvent(next);
          return;
        }
        updateChatSessionEvents(clientSessionId, (current) => [...current, next]);
        if (next.event === "approval.request" && next.run_id) {
          if (runPermissionMode === "full_access") void approveHermesRun(next.run_id, "session");
          if (runPermissionMode === "read_only") void approveHermesRun(next.run_id, "deny");
        }
      }).catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError" && receivedTerminalEvent) return;
        throw error;
      });
      if (!receivedTerminalEvent && !controller.signal.aborted) {
        await statusPoll;
        if (statusPollError) throw statusPollError;
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
      chatAbortRef.current = null;
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

  return (
    <TooltipProvider delayDuration={120}>
      <div className="app-shell">
        <aside className="icon-rail" aria-label="Primary navigation">
          <div className="rail-logo" aria-label="Growth Hacker">
            GH
          </div>

          <nav className="rail-nav">
            {dashboardNav.map((item) => {
              const Icon = item.icon;
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>
                    <Button
                      aria-label={item.label}
                      className={cn("rail-button", activeView === item.id && "rail-button-active")}
                      onClick={() => setActiveView(item.id)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Icon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </nav>

          <div className="rail-footer">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button aria-label="Refresh" className="rail-button" onClick={() => void refresh()} size="icon" type="button" variant="ghost">
                  <RefreshCcw className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Refresh</TooltipContent>
            </Tooltip>
          </div>
        </aside>

        <aside className="sub-nav" aria-label={`${activeNavItem.label} navigation`}>
          <div className="sub-nav-header">
            <p>{activeNavItem.label}</p>
            <h1>Growth Hacker</h1>
          </div>
          <Separator />
          <ScrollArea className="sub-nav-scroll">
            {activeView === "workspace" ? (
              <WorkspaceSubNav
                artifacts={visibleArtifacts}
                expandedDirectories={expandedDirectories}
                onOpenArtifact={(artifact) => void openArtifact(artifact)}
                onSelectProfile={(profile) => {
                  setSelectedProfile(profile);
                  setActiveView("workspace");
                }}
                onToggleDirectory={toggleDirectory}
                profileGroups={profileGroups}
                selectedArtifact={selectedArtifact}
                selectedProfile={selectedProfile}
              />
            ) : null}
            {activeView === "published" ? (
              <PublishedPostsSubNav
                onSelectProfile={(profile) => {
                  setSelectedProfile(profile);
                  setActiveView("published");
                }}
                posts={publishedPosts}
                profileGroups={profileGroups}
                selectedProfile={selectedProfile}
              />
            ) : null}
            {activeView === "replies" ? (
              <AutoRepliesSubNav
                agents={socialCronAgents}
                items={autoReplyItems}
                onSelectAgent={setSocialCronAgentId}
                onSelectProfile={(profile) => {
                  setSelectedProfile(profile);
                  setActiveView("replies");
                }}
                profileGroups={profileGroups}
                selectedAgentId={socialCronAgentId}
                selectedProfile={selectedProfile}
              />
            ) : null}
            {activeView === "calendar" ? (
              <>
                <CalendarSubNav agents={socialAgents} items={socialCalendarItems} />
                <Separator />
                <CronSubNav
                  agents={socialCronAgents}
                  busy={busy}
                  jobs={socialCronJobs}
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
                  taskTypes={socialCronTaskTypes}
                />
              </>
            ) : null}
            {activeView === "board" ? <BoardSubNav agents={socialAgents} tasks={socialBoardTasks} /> : null}
            {activeView === "chat" ? (
              <ChatSubNav
                activeRunId={activeChatRunId}
                activeSession={activeChatSession}
                agents={socialAgents}
                onDeleteSession={deleteChatSession}
                onNewChat={resetChat}
                onRenameSession={renameChatSession}
                onSelectAgent={updateChatSessionAgent}
                onSelectSession={selectChatSession}
                selectedAgent={selectedSocialAgent}
                sessions={chatSessionState.sessions}
              />
            ) : null}
            {activeView === "skills" ? (
              <SkillsSubNav
                agents={socialAgents}
                onSelectAgent={setSocialCronAgentId}
                selectedAgent={selectedSocialAgent}
                skills={hermesSkills}
              />
            ) : null}
            {activeView === "jobs" ? <JobsSubNav job={selectedJob} /> : null}
            {activeView === "setup" ? <SetupSubNav auth={auth} hermes={hermes} openclaw={openclaw} /> : null}
          </ScrollArea>
        </aside>

        <main className="main-panel">
          <header className="topbar">
            <div>
              <p className="text-xs font-medium text-muted-foreground">{topbarContext(activeView, selectedProfile)}</p>
              <h2 className="text-xl font-semibold tracking-normal">{activeNavItem.label}</h2>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge state={xhsAuthBadgeState(auth)} label={xhsAuthBadgeLabel(auth)} />
              <Button onClick={() => void refresh()} size="sm" type="button" variant="outline">
                <RefreshCcw className="size-3.5" />
                Refresh
              </Button>
            </div>
          </header>

          <ScrollArea className="main-scroll">
            <div className="main-content">
              {activeView === "workspace" ? (
                <WorkspaceView selectedArtifact={selectedArtifact} selectedProfile={selectedProfile} />
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
                  items={socialCalendarItems}
                  jobs={socialCronJobs}
                  onDelete={(job) => void deleteSocialCron(job)}
                  onRun={(job) => void runSocialCron(job)}
                  onToggle={(job) => void toggleSocialCron(job)}
                />
              ) : null}

              {activeView === "board" ? (
                <BoardView busy={busy} onRun={(task) => void runSocialBoardTask(task)} tasks={socialBoardTasks} />
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
                  onAttachFiles={(files) => void attachChatFiles(files)}
                  onApprove={(runId, choice) => void approveChatRun(runId, choice)}
                  onDraftChange={setChatDraft}
                  onComposerModeChange={setChatComposerMode}
                  onModelChange={setChatModel}
                  onPermissionModeChange={setChatPermissionMode}
                  onReasoningEffortChange={setChatReasoningEffort}
                  onRemoveAttachment={removeChatAttachment}
                  onSend={() => void sendChatMessage()}
                  onStop={() => void stopChatRun()}
                  permissionMode={chatPermissionMode}
                  reasoningEffort={chatReasoningEffort}
                  selectedAgent={selectedSocialAgent}
                  skills={hermesSkills}
                  status={hermesChatStatus}
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

              {activeView === "jobs" ? <JobsView job={selectedJob} /> : null}

              {activeView === "setup" ? (
                <SetupView
                  auth={auth}
                  busy={busy}
                  hermes={hermes}
                  migration={migration}
                  onBootstrap={() => void bootstrap()}
                  onLogin={(mode) => void login(mode)}
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
  return (
    <div className="sub-nav-body">
      <SectionLabel icon={Folder} label="Workspaces" />
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
      {!Object.keys(profileGroups).length ? <EmptyCompact label="No profiles" /> : null}

      <Separator />

      <SectionLabel icon={FileText} label="Artifacts" />
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
      {!artifacts.length ? <EmptyCompact label="No artifacts" /> : null}
    </div>
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
  const xhsProfiles = profileGroups.xiaohongshu ?? [];
  const totalEngagement = posts.reduce(
    (sum, post) => sum + (post.stats.likes ?? 0) + (post.stats.collects ?? 0) + (post.stats.comments ?? 0),
    0
  );
  return (
    <div className="sub-nav-body">
      <SectionLabel icon={ImageIcon} label="XHS profiles" />
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
      {!xhsProfiles.length ? <EmptyCompact label="No XHS profiles" /> : null}

      <Separator />

      <SectionLabel icon={Gauge} label="Published" />
      <MetricRow label="Posts" value={String(posts.length)} />
      <MetricRow label="Engagement" value={formatCompactNumber(totalEngagement)} />
      <MetricRow label="Needs review" value={String(posts.filter((post) => post.status === "needs-review").length)} />
      <MetricRow label="Archived" value={String(posts.filter((post) => post.status === "archived").length)} />
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
  const xhsProfiles = profileGroups.xiaohongshu ?? [];
  return (
    <div className="sub-nav-body">
      <SectionLabel icon={Reply} label="XHS profiles" />
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
      {!xhsProfiles.length ? <EmptyCompact label="No XHS profiles" /> : null}

      <Separator />

      <SectionLabel icon={Bot} label="Agent" />
      <Select disabled={!agents.length} onValueChange={onSelectAgent} value={selectedAgentId}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Agent" />
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

      <SectionLabel icon={Gauge} label="Queue" />
      <MetricRow label="Pending" value={String(items.filter((item) => item.status === "pending").length)} />
      <MetricRow label="Drafted" value={String(items.filter((item) => item.status === "drafted").length)} />
      <MetricRow label="Needs review" value={String(items.filter((item) => item.status === "needs-review").length)} />
      <MetricRow label="Sent" value={String(items.filter((item) => item.status === "sent").length)} />
    </div>
  );
}

function CalendarSubNav({ agents, items }: { agents: SocialAgent[]; items: SocialTaskCalendarItem[] }) {
  const scheduled = items.filter((item) => item.source === "cron").length;
  const board = items.filter((item) => item.source === "board").length;
  return (
    <div className="sub-nav-body">
      <SectionLabel icon={CalendarClock} label="Queue" />
      <MetricRow label="Scheduled" value={String(scheduled)} />
      <MetricRow label="Board" value={String(board)} />
      <Separator />
      <SectionLabel icon={Bot} label="Agents" />
      <AgentList agents={agents} />
    </div>
  );
}

function BoardSubNav({ agents, tasks }: { agents: SocialAgent[]; tasks: SocialBoardTask[] }) {
  return (
    <div className="sub-nav-body">
      <SectionLabel icon={Gauge} label="Lanes" />
      {boardStatuses.map((status) => (
        <MetricRow key={status} label={status} value={String(tasks.filter((task) => task.status === status).length)} />
      ))}
      <Separator />
      <SectionLabel icon={Bot} label="Agents" />
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
  return (
    <Select disabled={disabled || !options.length} onValueChange={onChange} value={value}>
      <SelectTrigger className={triggerClassName ?? "w-full"}>
        <Zap className="size-3.5" />
        <SelectValue placeholder="LLM model" />
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
  return (
    <div className="sub-nav-body">
      <SectionLabel icon={CalendarClock} label="New schedule" />
      <div className="space-y-2">
        <Select onValueChange={setSelectedAgentId} value={selectedAgentId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Agent" />
          </SelectTrigger>
          <SelectContent>
            {agents.map((agentId) => (
              <SelectItem key={agentId} value={agentId}>
                {agentId}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select onValueChange={(value) => setTaskType(value as SocialCronTaskType)} value={taskType}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Task" />
          </SelectTrigger>
          <SelectContent>
            {taskTypes.map((nextTaskType) => (
              <SelectItem key={nextTaskType} value={nextTaskType}>
                {socialCronTaskLabel[nextTaskType]}
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
        <Button className="w-full" disabled={!selectedProfile || busy === "social-cron-create"} onClick={onCreate} type="button">
          {busy === "social-cron-create" ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-4" />}
          Schedule
        </Button>
      </div>
      <Separator />
      <SectionLabel icon={RefreshCcw} label="Jobs" />
      {jobs.map((job) => (
        <button className="sub-nav-row" key={job.id} title={job.name} type="button">
          <span className="truncate">{job.name}</span>
          <StatusBadge state={job.enabled ? "ok" : "warn"} label={job.llm?.model ?? (job.enabled ? "on" : "off")} />
        </button>
      ))}
      {!jobs.length ? <EmptyCompact label="No cron jobs" /> : null}
    </div>
  );
}

function ChatSubNav({
  activeRunId,
  activeSession,
  agents,
  onDeleteSession,
  onNewChat,
  onRenameSession,
  onSelectAgent,
  onSelectSession,
  selectedAgent,
  sessions
}: {
  activeRunId: string | null;
  activeSession?: ChatSession;
  agents: SocialAgent[];
  onDeleteSession: (sessionId: string) => void;
  onNewChat: () => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onSelectAgent: (agentId: string) => void;
  onSelectSession: (sessionId: string) => void;
  selectedAgent?: SocialAgent;
  sessions: ChatSession[];
}) {
  const activeMessageCount = activeSession ? countChatSessionMessages(activeSession) : 0;
  return (
    <div className="sub-nav-body">
      <SectionLabel icon={MessageSquare} label="Session management" />
      <Button className="w-full justify-start" disabled={Boolean(activeRunId)} onClick={onNewChat} type="button" variant="outline">
        <Plus className="size-3.5" />
        New session
      </Button>

      {activeSession ? (
        <div className="chat-session-editor">
          <label htmlFor="chat-session-name">Session name</label>
          <Input
            id="chat-session-name"
            onChange={(event) => onRenameSession(activeSession.id, event.target.value)}
            placeholder={chatDefaultSessionTitle}
            value={activeSession.title}
          />
          <div className="chat-session-meta">
            <span title={activeSession.id}>{activeSession.id}</span>
            <Badge variant="outline">{activeRunId ? "running" : "active"}</Badge>
          </div>
        </div>
      ) : (
        <EmptyCompact label="No active session" />
      )}

      <div className="chat-session-agent">
        <span>Agent</span>
        <Select disabled={!agents.length || Boolean(activeRunId)} onValueChange={onSelectAgent} value={selectedAgent?.id}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select agent" />
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

      <MetricRow label="Sessions" value={String(sessions.length)} />
      <MetricRow label="Messages" value={String(activeMessageCount)} />
      <MetricRow label="Updated" value={activeSession ? formatChatSessionTime(activeSession.updatedAt) : "never"} />
      <Separator />
      <SectionLabel icon={Archive} label="Sessions" />
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
                <span>{displayChatSessionTitle(session)}</span>
                <small>{formatChatSessionSummary(session)}</small>
              </button>
              <Button
                aria-label={`Delete ${displayChatSessionTitle(session)}`}
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
      {!sessions.length ? <EmptyCompact label="No sessions" /> : null}
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
  const enabled = skills.filter((skill) => skill.enabled).length;
  const categories = new Set(skills.map((skill) => skill.category || "uncategorized")).size;
  return (
    <div className="sub-nav-body">
      <SectionLabel icon={Bot} label="Agents" />
      <AgentList agents={agents} onSelectAgent={onSelectAgent} selectedAgent={selectedAgent} />
      <Separator />
      <SectionLabel icon={Gauge} label="Inventory" />
      <MetricRow label="Enabled" value={String(enabled)} />
      <MetricRow label="Disabled" value={String(skills.length - enabled)} />
      <MetricRow label="Categories" value={String(categories)} />
    </div>
  );
}

function JobsSubNav({ job }: { job: JobSnapshot | null }) {
  return (
    <div className="sub-nav-body">
      <SectionLabel icon={Terminal} label="Latest" />
      {job ? (
        <>
          <MetricRow label="Status" value={job.status} />
          <MetricRow label="Type" value={job.type} />
          <MetricRow label="Logs" value={String(job.logs.length)} />
        </>
      ) : (
        <EmptyCompact label="No active job" />
      )}
    </div>
  );
}

function SetupSubNav({ auth, hermes, openclaw }: { auth: XhsAuthStatus | null; hermes?: RuntimeStatus; openclaw?: RuntimeStatus }) {
  return (
    <div className="sub-nav-body">
      <SectionLabel icon={Activity} label="Runtimes" />
      <RuntimeLine runtime={hermes} label="Hermes" />
      <RuntimeLine runtime={openclaw} label="OpenClaw" />
      <Separator />
      <SectionLabel icon={KeyRound} label="XHS CLI" />
      <MetricRow label="Installed" value={auth?.installed ? "yes" : "no"} />
      <MetricRow label="Scope" value={auth?.scope ?? "global"} />
      <MetricRow label="State" value={xhsAuthStateValue(auth)} />
      <MetricRow label="Signed in" value={xhsSignedInValue(auth)} />
      <MetricRow label="Account" value={xhsAccountValue(auth)} />
    </div>
  );
}

function WorkspaceView({ selectedArtifact, selectedProfile }: { selectedArtifact: ArtifactContent | null; selectedProfile: WorkspaceProfile | null }) {
  return (
    <div className="workspace-view">
      <Card className="workspace-card">
        <CardHeader className="border-b">
          <CardTitle>{selectedArtifact?.artifact.path ?? selectedProfile?.profile ?? "Workspace"}</CardTitle>
          <CardDescription>
            {selectedArtifact ? `${selectedArtifact.artifact.mime} / ${formatBytes(selectedArtifact.artifact.size)}` : "Select an artifact from sub-nav"}
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
              <div className="empty-state">Preview unavailable.</div>
            ) : (
              <pre>{selectedArtifact.content}</pre>
            )
          ) : (
            <div className="empty-state">No artifact selected.</div>
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
    <section className="published-shell" aria-label="Published Xiaohongshu posts">
      <div className="published-toolbar">
        <div className="published-toolbar-title">
          <p>{selectedProfile ? `xiaohongshu/${selectedProfile.profile}` : "No XHS profile selected"}</p>
          <h3>已发布推文</h3>
        </div>
        <div className="published-toolbar-actions">
          <div className="published-search">
            <Search className="size-3.5" />
            <Input onChange={(event) => onSearchChange(event.target.value)} placeholder="搜索标题、关键词、备注" value={search} />
          </div>
          <Select onValueChange={(value) => onStatusFilterChange(value as XhsPublishedPostStatus | "all")} value={statusFilter}>
            <SelectTrigger aria-label="Status filter" className="published-status-filter" size="sm">
              <SlidersHorizontal className="size-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {publishedPostStatusOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option === "all" ? "全部状态" : publishedPostStatusLabel[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button disabled={!selectedProfile || busy === "published-sync"} onClick={onSync} size="sm" type="button" variant="outline">
            {busy === "published-sync" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCcw className="size-3.5" />}
            同步
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
          <span>{posts.length ? "没有匹配的推文。" : "还没有已发布推文记录。可从 xhs my-notes 同步，或在 metrics.csv 记录数据。"}</span>
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
          <StatusBadge state={publishedStatusState(post.status)} label={publishedPostStatusLabel[post.status]} />
          {post.contentType === "video" ? <Badge variant="secondary">视频</Badge> : null}
        </div>
      </div>

      <div className="published-note-body">
        <div className="published-note-title-row">
          <h4 title={post.title}>{post.title}</h4>
          {post.url ? (
            <a aria-label="Open Xiaohongshu post" className="published-note-link" href={post.url} rel="noreferrer" target="_blank">
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>
        <div className="published-note-meta">
          <span className="published-author">
            {post.authorAvatarUrl ? <img alt="" src={post.authorAvatarUrl} /> : <span className="published-author-dot" />}
            <span>{post.authorName ?? post.profile}</span>
          </span>
          <span>{formatPublishedDate(post.publishedAt ?? post.syncedAt ?? post.updatedAt)}</span>
        </div>
        <div className="published-note-stats">
          <span title="Views">
            <Eye className="size-3.5" />
            {formatCompactNumber(post.stats.views)}
          </span>
          <span title="Likes">
            <Heart className="size-3.5" />
            {formatCompactNumber(post.stats.likes)}
          </span>
          <span title="Collects">
            <Bookmark className="size-3.5" />
            {formatCompactNumber(post.stats.collects)}
          </span>
          <span title="Comments">
            <MessageSquare className="size-3.5" />
            {formatCompactNumber(post.stats.comments)}
          </span>
          <span title="Shares">
            <Share2 className="size-3.5" />
            {formatCompactNumber(post.stats.shares)}
          </span>
        </div>
        <div className="published-note-controls">
          <Select onValueChange={(value) => onUpdate(post, { status: value as XhsPublishedPostStatus })} value={post.status}>
            <SelectTrigger aria-label="Post status" className="published-note-status-select" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {publishedPostStatusOptions
                .filter((option): option is XhsPublishedPostStatus => option !== "all")
                .map((option) => (
                  <SelectItem key={option} value={option}>
                    {publishedPostStatusLabel[option]}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button
            aria-label="Archive post"
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
          placeholder={engagement ? `互动 ${formatCompactNumber(engagement)}` : "复盘备注"}
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
  const runnable = Boolean(selectedProfile && settings.stylePrompt.trim());
  const activeItems = items.filter((item) => item.status !== "already-replied" && item.status !== "skipped");
  return (
    <section className="auto-reply-shell" aria-label="Xiaohongshu auto replies">
      <div className="published-toolbar">
        <div className="published-toolbar-title">
          <p>{selectedProfile ? `xiaohongshu/${selectedProfile.profile}` : "No XHS profile selected"}</p>
          <h3>自动回复</h3>
        </div>
        <div className="published-toolbar-actions">
          <Select disabled={!agents.length} onValueChange={onSelectAgent} value={selectedAgentId}>
            <SelectTrigger aria-label="Auto reply agent" className="auto-reply-agent-select" size="sm">
              <Bot className="size-3.5" />
              <SelectValue placeholder="Agent" />
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
            同步评论
          </Button>
          <Button disabled={!runnable || busy === "auto-reply-run"} onClick={onRun} size="sm" type="button">
            {busy === "auto-reply-run" ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            Start
          </Button>
        </div>
      </div>

      {notice ? <div className="published-notice">{notice}</div> : null}

      <div className="auto-reply-settings">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Reply Style Prompt</CardTitle>
            <CardDescription>Agent 会按这个风格生成候选回复；server 负责去重、限速、写日志。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              className="auto-reply-style-input"
              onChange={(event) => onSettingsChange({ ...settings, stylePrompt: event.target.value })}
              placeholder="例如：语气真诚、短句、像真人运营者；不承诺结果，不引导私信，不留联系方式。"
              value={settings.stylePrompt}
            />
            <div className="auto-reply-controls">
              <label className="auto-reply-control-field">
                <span className="auto-reply-control-label">语言风格</span>
                <Select
                  onValueChange={(value) => onSettingsChange({ ...settings, locale: value as XhsAutoReplyLocale })}
                  value={settings.locale}
                >
                  <SelectTrigger aria-label="Region language style" size="sm">
                    <SlidersHorizontal className="size-3.5" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {autoReplyLocaleOptions.map((locale) => (
                      <SelectItem key={locale} value={locale}>
                        {autoReplyLocaleLabel[locale]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="auto-reply-control-field">
                <span className="auto-reply-control-label">执行模式</span>
                <Select
                  onValueChange={(value) => onSettingsChange({ ...settings, dryRun: value === "true" })}
                  value={String(settings.dryRun)}
                >
                  <SelectTrigger aria-label="Dry run mode" size="sm">
                    <ShieldCheck className="size-3.5" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">只生成草稿</SelectItem>
                    <SelectItem value="false">发送回复</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="auto-reply-control-field">
                <span className="auto-reply-control-label">每次最多回复</span>
                <Input
                  aria-label="Max replies per run"
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
                <span className="auto-reply-control-label">回复间隔（秒）</span>
                <Input
                  aria-label="Delay seconds"
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
                Save
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
          <span>还没有待回复评论。先同步评论，或确认已发布笔记里有可读取的评论。</span>
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
  return (
    <Card className="auto-reply-card" size="sm">
      <CardHeader>
        <CardTitle className="auto-reply-card-title">
          <span>{item.commentAuthorName ?? "Unknown user"}</span>
          <StatusBadge state={autoReplyStatusState(item.status)} label={autoReplyStatusLabel[item.status]} />
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
            Skip
          </Button>
          <Button
            disabled={busy === `auto-reply-item-${item.id}` || item.status === "pending"}
            onClick={() => onUpdate(item, { status: "pending" })}
            size="sm"
            type="button"
            variant="outline"
          >
            <RefreshCcw className="size-3.5" />
            Requeue
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
  onToggle
}: {
  busy: string | null;
  items: SocialTaskCalendarItem[];
  jobs: SocialCronJob[];
  onDelete: (job: SocialCronJob) => void;
  onRun: (job: SocialCronJob) => void;
  onToggle: (job: SocialCronJob) => void;
}) {
  return (
    <div className="calendar-schedule-view">
      <CalendarView items={items} />
      <section className="calendar-cron-section" aria-label="Social cron jobs">
        <div className="calendar-cron-section-header">
          <div>
            <h3>Social Cron</h3>
            <p>{jobs.length ? `${jobs.length} schedules attached to this task calendar` : "No recurring schedules yet"}</p>
          </div>
          <Badge variant="outline">{jobs.filter((job) => job.enabled).length} enabled</Badge>
        </div>
        <CronView busy={busy} jobs={jobs} onDelete={onDelete} onRun={onRun} onToggle={onToggle} />
      </section>
    </div>
  );
}

function CalendarView({ items }: { items: SocialTaskCalendarItem[] }) {
  const weekStart = calendarWeekStart(items);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const itemsByDay = days.map((day) =>
    items
      .filter((item) => sameLocalDate(new Date(item.startsAt), day))
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  );

  return (
    <Card className="calendar-week-card">
      <CardHeader className="border-b">
        <CardTitle>Week of {formatCalendarDay(weekStart)}</CardTitle>
        <CardDescription>
          {formatCalendarDay(days[0])} - {formatCalendarDay(days[6])} / {items.length} tasks
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="calendar-week-wrapper">
          <table className="calendar-week-table">
            <thead>
              <tr>
                {days.map((day) => (
                  <th key={day.toISOString()}>
                    <span>{formatWeekday(day)}</span>
                    <strong>{formatCalendarDay(day)}</strong>
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
                              <time>{formatTime(item.startsAt)}</time>
                              <StatusBadge state={calendarState(item.status)} label={item.status} />
                            </div>
                            <strong>{item.title}</strong>
                            <small>
                              {item.profile} / {item.agentId} / {item.llm?.model ?? item.runner}
                            </small>
                          </article>
                        ))
                      ) : (
                        <div className="calendar-empty-day">No tasks</div>
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

function BoardView({ busy, onRun, tasks }: { busy: string | null; onRun: (task: SocialBoardTask) => void; tasks: SocialBoardTask[] }) {
  return (
    <div className="board-grid">
      {(["ready", "running", "done", "failed"] as const).map((status) => {
        const laneTasks = tasks.filter((task) => task.status === status);
        return (
          <section className="board-lane" key={status}>
            <div className="board-lane-header">
              <span>{status}</span>
              <Badge variant="outline">{laneTasks.length}</Badge>
            </div>
            <div className="space-y-2">
              {laneTasks.length ? (
                laneTasks.map((task) => (
                  <Card key={task.id} size="sm">
                    <CardHeader>
                      <CardTitle className="truncate">{task.title}</CardTitle>
                      <CardDescription>
                        {task.profile} / {task.llm?.model ?? task.runner} / {task.source}
                      </CardDescription>
                    </CardHeader>
                    {(task.status === "ready" || task.status === "failed") ? (
                      <CardContent>
                        <Button
                          className="w-full"
                          disabled={busy === `social-board-run-${task.id}`}
                          onClick={() => onRun(task)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {busy === `social-board-run-${task.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                          Run
                        </Button>
                      </CardContent>
                    ) : null}
                  </Card>
                ))
              ) : (
                <EmptyCompact label="Empty" />
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
  return (
    <div className="content-grid">
      {jobs.length ? (
        jobs.map((job) => (
          <Card key={job.id} size="sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3">
                <span className="truncate">{job.name}</span>
                <StatusBadge state={job.enabled ? "ok" : "warn"} label={job.enabled ? "enabled" : "paused"} />
              </CardTitle>
              <CardDescription>{job.schedule.display}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <MetricRow label="Agent" value={job.agentId} />
                {job.llm ? <MetricRow label="LLM" value={`${job.llm.provider}/${job.llm.model}`} /> : null}
                <MetricRow label="Profile" value={job.profile} />
                <MetricRow label="Next" value={formatDateTime(job.nextRunAt)} />
                <MetricRow label="Last" value={job.lastStatus ?? job.state} />
              </div>
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Button disabled={busy === `social-cron-run-${job.id}`} onClick={() => onRun(job)} size="sm" type="button" variant="outline">
                  {busy === `social-cron-run-${job.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                  Run
                </Button>
                <Button onClick={() => onToggle(job)} size="sm" type="button" variant="outline">
                  {job.enabled ? "Pause" : "Resume"}
                </Button>
                <Button aria-label="Delete cron job" onClick={() => onDelete(job)} size="icon-sm" type="button" variant="destructive">
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      ) : (
        <EmptyWide label="No social cron jobs." />
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
  reasoningEffort,
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
  reasoningEffort: ChatReasoningEffort;
  selectedAgent?: SocialAgent;
  skills: HermesSkillInfo[];
  status: HermesChatStatus | null;
}) {
  const transcript = buildChatTranscript(events);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const [listening, setListening] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const speechAvailable = Boolean(getSpeechRecognitionConstructor());
  const mentionQuery = activeRunId ? null : activeSkillMentionQuery(draft);
  const mentionMatches =
    mentionQuery === null
      ? []
      : uniqueHermesSkillsByName(skills)
          .filter((skill) => skill.enabled && skill.name.toLowerCase().includes(mentionQuery.toLowerCase()))
          .sort(sortHermesSkills)
          .slice(0, 8);
  const mentionedSkills = resolveSkillMentions(draft, skills).skills;
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
            <span>{selectedAgent ? `${selectedAgent.id} / Hermes API` : "No agent selected"}</span>
          </div>
        )}
      </div>
      <div className="chat-dock">
        {mentionedSkills.length || activeRunId ? (
          <div className="chat-runtime-bar">
            {mentionedSkills.map((skill) => (
              <Badge key={skill.name} variant="outline">
                ${skill.name}
              </Badge>
            ))}
            {activeRunId ? <Badge variant="outline">{activeRunId}</Badge> : null}
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
                      <small>{skill.category || "uncategorized"}</small>
                    </button>
                  ))
                ) : (
                  <div className="skill-mention-empty">No matching enabled skills</div>
                )}
              </div>
            ) : null}
            <Textarea
              disabled={Boolean(activeRunId)}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing && (event.shiftKey || event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  onSend();
                }
              }}
              placeholder={composerMode === "image" ? "Describe the image to create..." : "Message the agent... use $skill"}
              value={draft}
            />
            {attachments.length ? (
              <div className="chat-attachments">
                {attachments.map((attachment) => (
                  <span className="chat-attachment-pill" key={attachment.id}>
                    <FileText className="size-3.5" />
                    <span>{attachment.name}</span>
                    <button aria-label={`Remove ${attachment.name}`} onClick={() => onRemoveAttachment(attachment.id)} type="button">
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
              accept=".txt,.md,.markdown,.json,.csv,text/*,application/json"
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
                aria-label="Open composer actions"
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
                      <strong>Add photos & files</strong>
                      <small>Attach local text context</small>
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
                      <strong>Create image</strong>
                      <small>Use Hermes image_generate</small>
                    </span>
                  </button>
                </div>
              ) : null}
            </div>
            {composerMode === "image" ? (
              <button className="chat-composer-mode-chip" onClick={() => onComposerModeChange(null)} type="button">
                <ImageIcon className="size-3.5" />
                <span>Create image</span>
                <X className="size-3" />
              </button>
            ) : null}
            <Select onValueChange={(value) => onPermissionModeChange(value as ChatPermissionMode)} value={permissionMode}>
              <SelectTrigger aria-label="Permission mode" className="chat-control-select" size="sm">
                <ShieldCheck className="size-3.5 text-orange-600" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" className="chat-select-content chat-permission-menu" position="popper" sideOffset={8}>
                <SelectItem className="chat-select-item" value="full_access">
                  {chatPermissionLabels.full_access}
                </SelectItem>
                <SelectItem className="chat-select-item" value="ask">
                  {chatPermissionLabels.ask}
                </SelectItem>
                <SelectItem className="chat-select-item" value="read_only">
                  {chatPermissionLabels.read_only}
                </SelectItem>
              </SelectContent>
            </Select>
            <Select onValueChange={onModelChange} value={model}>
              <SelectTrigger aria-label="Model" className="chat-model-select" size="sm">
                <Zap className="size-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" className="chat-select-content chat-model-menu" position="popper" sideOffset={8}>
                {chatModelOptions.map((option) => (
                  <SelectItem className="chat-select-item" key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select onValueChange={(value) => onReasoningEffortChange(value as ChatReasoningEffort)} value={reasoningEffort}>
              <SelectTrigger aria-label="Reasoning effort" className="chat-effort-select" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" className="chat-select-content chat-effort-menu" position="popper" sideOffset={8}>
                <SelectItem className="chat-select-item" value="low">
                  {chatReasoningLabels.low}
                </SelectItem>
                <SelectItem className="chat-select-item" value="medium">
                  {chatReasoningLabels.medium}
                </SelectItem>
                <SelectItem className="chat-select-item" value="high">
                  {chatReasoningLabels.high}
                </SelectItem>
                <SelectItem className="chat-select-item" value="xhigh">
                  {chatReasoningLabels.xhigh}
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              aria-label="Voice input"
              className={cn(listening && "chat-control-active")}
              disabled={Boolean(activeRunId) || !speechAvailable}
              onClick={() => {
                const recognition = createSpeechRecognition({
                  onEnd: () => setListening(false),
                  onResult: (text) => onDraftChange([draft, text].filter(Boolean).join(draft ? "\n" : ""))
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
            <ChatConnectionStatus status={status} />
            {activeRunId ? (
              <Button aria-label="Stop run" onClick={onStop} size="icon" type="button" variant="destructive">
                <Square className="size-4" />
              </Button>
            ) : (
              <Button disabled={(!draft.trim() && !attachments.length) || !status?.available} onClick={onSend} size="icon" type="button">
                <Send className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatConnectionStatus({ status }: { status: HermesChatStatus | null }) {
  const available = Boolean(status?.available);
  const label = available ? "Hermes API online" : "Hermes API offline";
  const detail = available ? status?.baseUrl : status?.error ?? "api_server unavailable";
  return (
    <span className={cn("chat-connection-status", available ? "chat-connection-status-ok" : "chat-connection-status-bad")} title={detail}>
      <span className="chat-connection-dot" />
      <span className="chat-connection-label">{label}</span>
      <span className="chat-connection-detail">{detail}</span>
    </span>
  );
}

interface ChatTranscriptItemModel {
  id: string;
  kind: "user" | "assistant" | "tool" | "system" | "approval" | "runtime";
  text: string;
  runId?: string;
  tool?: string;
  label?: string;
  toolCallId?: string;
  state?: "running" | "done" | "failed";
  choices?: string[];
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
    return (
      <div className={cn("chat-line chat-line-tool", item.state === "failed" && "chat-line-tool-failed")}>
        {item.state === "running" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : item.state === "failed" ? (
          <CircleAlert className="size-4" />
        ) : (
          <CheckCircle2 className="size-4" />
        )}
        <div className="chat-line-body">
          <strong>{item.label ?? item.tool}</strong>
          <span>{item.text}</span>
        </div>
      </div>
    );
  }

  if (item.kind === "runtime") {
    return (
      <div className="chat-line chat-line-runtime">
        <Gauge className="size-4" />
        <div className="chat-line-body">
          <strong>{item.label ?? "agent-runtime"}</strong>
          <span>{item.text}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("chat-message", `chat-message-${item.kind}`)}>
      <div className="chat-message-role">{item.kind}</div>
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

function buildChatTranscript(events: HermesChatEvent[]): ChatTranscriptItemModel[] {
  const items: ChatTranscriptItemModel[] = [];
  let assistant: ChatTranscriptItemModel | undefined;

  const closeAssistant = () => {
    assistant = undefined;
  };

  for (const [index, event] of events.entries()) {
    const name = event.event || event.type || "";

    if (name === "message.user") {
      closeAssistant();
      items.push({ id: `user-${index}`, kind: "user", text: String(event.message ?? "") });
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
      closeAssistant();
      items.push({
        id: `runtime-${index}`,
        kind: "runtime",
        label: runtimeEventLabel(event),
        text: runtimeEventText(event)
      });
      continue;
    }

    if (isToolStartedEvent(event)) {
      closeAssistant();
      items.push({
        id: `tool-${index}`,
        kind: "tool",
        state: "running",
        label: toolEventLabel(event, "running"),
        text: toolEventText(event, "running"),
        tool: toolEventName(event),
        toolCallId: toolEventCallId(event)
      });
      continue;
    }

    if (isToolCompletedEvent(event)) {
      closeAssistant();
      const callId = toolEventCallId(event);
      const toolName = toolEventName(event);
      const tool = [...items]
        .reverse()
        .find(
          (item) =>
            item.kind === "tool" &&
            item.state === "running" &&
            ((callId && item.toolCallId === callId) || (!callId && item.tool === toolName))
        );
      const state = toolEventFailed(event) ? "failed" : "done";
      if (tool) {
        tool.state = state;
        tool.label = toolEventLabel(event, state);
        tool.text = toolEventText(event, state);
      } else {
        items.push({
          id: `tool-${index}`,
          kind: "tool",
          state,
          label: toolEventLabel(event, state),
          text: toolEventText(event, state),
          tool: toolName,
          toolCallId: callId
        });
      }
      continue;
    }

    if (name === "approval.request") {
      closeAssistant();
      items.push({
        id: `approval-${index}`,
        kind: "approval",
        runId: event.run_id,
        text: String(event.preview ?? event.command ?? "Approval required"),
        choices: event.choices
      });
      continue;
    }

    if (name === "approval.responded") {
      closeAssistant();
      items.push({ id: `approval-response-${index}`, kind: "system", text: `approval: ${event.choice ?? "sent"}` });
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

    if (name === "run.failed" || name === "run.cancelled" || name === "approval.error" || name === "response.failed") {
      closeAssistant();
      items.push({
        id: `system-${index}`,
        kind: "system",
        text: String(event.error ?? event.event)
      });
    }
  }

  return items.filter((item) => item.text.trim() || item.kind === "tool" || item.kind === "approval" || item.kind === "runtime");
}

function buildAgentRuntimeEvent(
  run: HermesChatRunResponse,
  options: Pick<HermesChatRunOptions, "agentId" | "model" | "permissionMode" | "reasoningEffort">
): HermesChatEvent {
  return {
    event: "agent-runtime",
    run_id: run.runId,
    timestamp: Date.now() / 1000,
    agentId: options.agentId,
    model: options.model,
    permissionMode: options.permissionMode,
    reasoningEffort: options.reasoningEffort,
    sessionId: run.sessionId,
    hermesSessionId: run.hermesSessionId,
    status: run.status
  };
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

function runtimeEventLabel(event: HermesChatEvent): string {
  const agent = event.agentId ?? readableRecordValue(event, "agent_id") ?? readableRecordValue(event, "profile");
  return agent ? `agent-runtime: ${agent}` : "agent-runtime";
}

function runtimeEventText(event: HermesChatEvent): string {
  const parts = [
    event.model ? `model=${event.model}` : undefined,
    event.permissionMode ? `permission=${event.permissionMode}` : undefined,
    event.reasoningEffort ? `reasoning=${event.reasoningEffort}` : undefined,
    event.status ? `status=${event.status}` : undefined,
    event.run_id ? `run=${event.run_id}` : undefined,
    event.hermesSessionId ? `session=${event.hermesSessionId}` : event.sessionId ? `session=${event.sessionId}` : undefined
  ].filter((part): part is string => Boolean(part));
  return parts.join(" / ") || event.preview || event.message || "runtime attached";
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

function toolEventLabel(event: HermesChatEvent, state: ChatTranscriptItemModel["state"]): string {
  const prefix = state === "running" ? "tool use" : state === "failed" ? "tool failed" : "tool completed";
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

function readableRecordValue(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const recordValue = value[key];
  return typeof recordValue === "string" && recordValue.trim() ? recordValue : undefined;
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
          <p>{agent ? `${agent.id} / ${agent.runner}` : "No agent selected"}</p>
          <h3>{enabled} enabled skills</h3>
        </div>
        <div className="skills-toolbar-actions">
          <Input onChange={(event) => onSearchChange(event.target.value)} placeholder="Search skills" value={search} />
          <Button onClick={onRefresh} size="sm" type="button" variant="outline">
            <RefreshCcw className="size-3.5" />
            Refresh
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
              <p>{skill.description || "No description"}</p>
              <span>{skill.category || "uncategorized"}</span>
            </div>
            <Button
              disabled={busy === `skill-${skill.name}`}
              onClick={() => onToggle(skill)}
              size="sm"
              type="button"
              variant={skill.enabled ? "outline" : "secondary"}
            >
              {busy === `skill-${skill.name}` ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {skill.enabled ? "Disable" : "Enable"}
            </Button>
          </article>
        ))}
        {!filtered.length ? <EmptyWide label="No matching skills." /> : null}
      </div>
    </div>
  );
}

function JobsView({ job }: { job: JobSnapshot | null }) {
  return (
    <Card className="h-full min-h-[520px]">
      <CardHeader className="border-b">
        <CardTitle>{job?.type ?? "No active job"}</CardTitle>
        <CardDescription>{job ? job.command.join(" ") : "Run a board or cron task to stream output here."}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {job ? (
          <pre>{job.logs.join("\n") || job.command.join(" ")}</pre>
        ) : (
          <div className="empty-state">No job output.</div>
        )}
      </CardContent>
    </Card>
  );
}

function SetupView({
  auth,
  busy,
  hermes,
  migration,
  onBootstrap,
  onLogin,
  onRunMigration,
  openclaw
}: {
  auth: XhsAuthStatus | null;
  busy: string | null;
  hermes?: RuntimeStatus;
  migration: MigrationPlan | null;
  onBootstrap: () => void;
  onLogin: (mode: "qrcode" | "browser") => void;
  onRunMigration: () => void;
  openclaw?: RuntimeStatus;
}) {
  return (
    <div className="content-grid">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Growth Agent</CardTitle>
          <CardDescription>Hermes runtime surface</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <RuntimeLine runtime={hermes} label="Hermes" />
          <RuntimeLine runtime={openclaw} label="OpenClaw" />
          <MetricRow label="Profile" value={hermes?.profileExists ? "ready" : "missing"} />
          <MetricRow label="XHS skill" value={hermes?.skillInstalled ? "installed" : "missing"} />
          <Button className="w-full" disabled={busy === "bootstrap"} onClick={onBootstrap} type="button">
            {busy === "bootstrap" ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            Bootstrap
          </Button>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Legacy Migration</CardTitle>
          <CardDescription>Xiaohongshu workspace sync</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <MetricRow label="Profiles" value={String(migration?.profiles.length ?? 0)} />
          <MetricRow label="To copy" value={String(migration?.copyCount ?? 0)} />
          <MetricRow label="Conflicts" value={String(migration?.conflictCount ?? 0)} />
          <Button className="w-full" disabled={!migration?.copyCount || busy === "migration"} onClick={onRunMigration} type="button">
            {busy === "migration" ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
            Run migration
          </Button>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>XHS CLI</CardTitle>
          <CardDescription>Local auth state</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <MetricRow label="Installed" value={auth?.installed ? "yes" : "no"} />
          <MetricRow label="Scope" value={auth?.scope ?? "global"} />
          <MetricRow label="State" value={xhsAuthStateValue(auth)} />
          <MetricRow label="Signed in" value={xhsSignedInValue(auth)} />
          <MetricRow label="Account" value={xhsAccountValue(auth)} />
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

function xhsAuthBadgeState(auth: XhsAuthStatus | null): "ok" | "warn" | "bad" {
  if (!auth) return "warn";
  if (!auth.installed) return "bad";
  return auth.authenticated ? "ok" : "warn";
}

function xhsAuthBadgeLabel(auth: XhsAuthStatus | null): string {
  if (!auth) return "XHS auth unknown";
  if (!auth.installed) return "XHS CLI missing";
  if (auth.authenticated) return "XHS signed in";
  if (auth.guest || auth.state === "guest") return "XHS partial login";
  return "XHS login needed";
}

function xhsAuthStateValue(auth: XhsAuthStatus | null): string {
  if (!auth) return "unknown";
  if (!auth.installed) return "missing cli";
  if (auth.state === "guest") return "partial";
  return auth.state ?? (auth.authenticated ? "signed-in" : "missing");
}

function xhsSignedInValue(auth: XhsAuthStatus | null): string {
  if (!auth) return "unknown";
  if (auth.authenticated) return "yes";
  if (auth.guest || auth.state === "guest") return "partial";
  return "no";
}

function xhsAccountValue(auth: XhsAuthStatus | null): string {
  if (!auth) return "unknown";
  if (auth.authenticated) return auth.nickname ?? auth.redId ?? "signed-in";
  if (auth.guest || auth.state === "guest") return "guest/partial";
  return auth.nickname ?? "unknown";
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
      {!agents.length ? <EmptyCompact label="No agents" /> : null}
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

function displayChatSessionTitle(session: ChatSession): string {
  return session.title.trim() || chatDefaultSessionTitle;
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

function topbarContext(activeView: DashboardView, selectedProfile: WorkspaceProfile | null): string {
  if (activeView === "workspace") return `~/.growth/${selectedProfile?.profile ?? ""}/${selectedProfile?.platform ?? "xiaohongshu"}`;
  if (activeView === "published") return selectedProfile ? `published xhs notes / ${selectedProfile.profile}` : "published xhs notes";
  if (activeView === "replies") return selectedProfile ? `auto replies / ${selectedProfile.profile}` : "auto replies";
  if (activeView === "chat") return "agent conversation";
  if (activeView === "skills") return "Hermes profile skills";
  if (activeView === "setup") return "runtime and auth";
  return selectedProfile ? `${selectedProfile.platform}/${selectedProfile.profile}` : "social media operations";
}

function calendarState(status: SocialTaskCalendarItem["status"]): "ok" | "warn" | "bad" {
  if (status === "failed") return "bad";
  if (status === "done" || status === "scheduled") return "ok";
  return "warn";
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

function buildSkillInstructions(skills: HermesSkillInfo[]): string | undefined {
  if (!skills.length) return undefined;
  const lines = skills.map((skill) => `- $${skill.name} (${skill.category || "uncategorized"}): ${skill.description || skill.path}`);
  return [
    "The user explicitly selected these enabled Hermes skills for this run.",
    "Treat $skill tokens in the user message as skill selection hints and apply the matching local skill behavior when relevant.",
    ...lines
  ].join("\n");
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
      instructions: options.instructions,
      model: options.model,
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

async function waitForHermesRunTerminal(runId: string, signal: AbortSignal): Promise<HermesChatEvent | null> {
  const deadline = Date.now() + 480000;
  let lastStatus: HermesChatRunStatus | null = null;
  while (!signal.aborted && Date.now() < deadline) {
    lastStatus = await getHermesRunStatus(runId);
    const event = runStatusToTerminalEvent(lastStatus);
    if (event) return event;
    await sleep(3000, signal);
  }
  if (!signal.aborted && lastStatus?.status === "running") {
    return {
      event: "run.failed",
      run_id: runId,
      timestamp: Date.now() / 1000,
      error: `run_status_poll_timeout:last_event=${lastStatus.lastEvent ?? "unknown"}`
    };
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
  const prior = buildChatTranscript(events)
    .filter((item): item is ChatTranscriptItemModel & { kind: "user" | "assistant" } => item.kind === "user" || item.kind === "assistant")
    .map((item) => ({ role: item.kind, content: item.text.trim() }))
    .filter((item) => item.content)
    .slice(-16);
  return [...prior, { role: "user", content: nextUserMessage }];
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

function hermesLlmValue(selection: HermesLlmSelection): string {
  return `${selection.provider}::${selection.model}`;
}

function hermesLlmFromValue(value: string): HermesLlmSelection | undefined {
  const [provider, model] = value.split("::");
  if (!provider || !model) return undefined;
  return { provider, model };
}

function isTerminalRunEvent(event: HermesChatEvent): boolean {
  const name = event.event || event.type || "";
  return name === "run.completed" || name === "run.failed" || name === "run.cancelled" || name === "response.completed" || name === "response.failed";
}

function hasTerminalEventForRun(events: HermesChatEvent[], runId: string): boolean {
  return events.some((event) => event.run_id === runId && isTerminalRunEvent(event));
}

function findRunMissingTerminalEvent(events: HermesChatEvent[]): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const runId = events[index].run_id;
    if (!runId) continue;
    if (hasTerminalEventForRun(events, runId)) return undefined;
    if (events.some((event) => event.run_id === runId && (isRuntimeEvent(event) || isToolStartedEvent(event) || isToolCompletedEvent(event)))) {
      return runId;
    }
  }
  return undefined;
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

function isSupportedChatAttachment(file: File): boolean {
  if (file.type.startsWith("text/")) return true;
  return /\.(txt|md|markdown|json|csv|log|yaml|yml)$/i.test(file.name) || file.type === "application/json";
}

function truncateAttachmentContent(content: string): string {
  if (content.length <= chatAttachmentMaxChars) return content;
  return `${content.slice(0, chatAttachmentMaxChars)}\n\n[truncated:${content.length - chatAttachmentMaxChars} chars]`;
}

function summarizeAttachments(attachments: ChatAttachment[]): string {
  return attachments.map((attachment) => `[attachment] ${attachment.name}`).join("\n");
}

function buildChatMessageWithAttachments(message: string, attachments: ChatAttachment[]): string {
  if (!attachments.length) return message;
  const rendered = attachments
    .map(
      (attachment) =>
        `### ${attachment.name}\n\n- MIME: ${attachment.mime || "text/plain"}\n- Size: ${formatBytes(attachment.size)}\n\n${attachment.content}`
    )
    .join("\n\n");
  return [message, "Attached local context:", rendered].filter(Boolean).join("\n\n");
}

function buildImageGenerationChatMessage(message: string, attachments: ChatAttachment[]): string {
  const prompt = buildChatMessageWithAttachments(message, attachments).trim() || summarizeAttachments(attachments);
  return [
    "GUI action: Create image.",
    "Use Hermes' built-in `image_generate` tool for this request.",
    "Call `image_generate` exactly once unless the user explicitly asks for multiple images.",
    "Use aspect_ratio `square` unless the prompt clearly asks for `landscape` or `portrait`.",
    "After the tool returns, show the generated result in chat as Markdown image syntax and include the URL/path returned by the tool.",
    "The dashboard persists returned Hermes image files into the selected workspace under `artifacts/images/`; do not invent that artifact path.",
    "",
    "Prompt:",
    prompt
  ].join("\n");
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

function createSpeechRecognition({ onEnd, onResult }: { onEnd: () => void; onResult: (text: string) => void }): SpeechRecognitionInstance | null {
  const Constructor = getSpeechRecognitionConstructor();
  if (!Constructor) return null;
  const recognition = new Constructor();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = navigator.language || "zh-CN";
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

function formatDateTime(value?: string): string {
  if (!value) return "not scheduled";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatPublishedDate(value?: string): string {
  if (!value) return "未记录时间";
  return new Intl.DateTimeFormat("zh-Hans", {
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

function formatCalendarDay(value: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit"
  }).format(value);
}

function formatWeekday(value: Date): string {
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(value);
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function calendarWeekStart(items: SocialTaskCalendarItem[]): Date {
  const today = startOfLocalDay(new Date());
  const currentWeekStart = startOfWeek(today);
  const currentWeekEnd = addDays(currentWeekStart, 7);
  const hasCurrentWeekItems = items.some((item) => {
    const startsAt = new Date(item.startsAt);
    return startsAt >= currentWeekStart && startsAt < currentWeekEnd;
  });
  if (hasCurrentWeekItems || !items.length) return currentWeekStart;

  const firstItem = items
    .map((item) => new Date(item.startsAt))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  return startOfWeek(firstItem);
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
