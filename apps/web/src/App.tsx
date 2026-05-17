import {
  Activity,
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Copy,
  FileText,
  Folder,
  Gauge,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  Loader2,
  MessageSquare,
  Play,
  RefreshCcw,
  Send,
  Square,
  Terminal,
  Trash2,
  UserPlus,
  Video
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import type {
  ArtifactContent,
  ArtifactInfo,
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

interface HermesChatEvent {
  event: string;
  run_id?: string;
  timestamp?: number;
  delta?: string;
  output?: string;
  tool?: string;
  preview?: string;
  duration?: number;
  error?: unknown;
  usage?: Record<string, number>;
  choices?: string[];
  choice?: string;
  command?: string;
  message?: string;
}

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
  "health-report": "Health"
};

const defaultSocialCronTaskTypes: SocialCronTaskType[] = ["workspace-diagnosis", "daily-ops-refresh", "health-report"];
const boardStatuses: SocialBoardTaskStatus[] = ["todo", "ready", "running", "blocked", "done", "failed", "archived"];

type DashboardView = "workspace" | "calendar" | "board" | "cron" | "chat" | "jobs" | "setup";

const dashboardNav: Array<{ id: DashboardView; label: string; icon: LucideIcon }> = [
  { id: "workspace", label: "Workspace", icon: LayoutDashboard },
  { id: "calendar", label: "Task Calendar", icon: CalendarClock },
  { id: "board", label: "Social Board", icon: Bot },
  { id: "cron", label: "Social Cron", icon: RefreshCcw },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "jobs", label: "Job Log", icon: Terminal },
  { id: "setup", label: "Setup", icon: KeyRound }
];

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
const hermesApiBaseUrl = normalizeBaseUrl(
  viteEnv.VITE_HERMES_API_BASE_URL ?? localStorage.getItem("growth-hacker.hermesApiBaseUrl") ?? "http://127.0.0.1:8642"
);
const hermesApiKey = viteEnv.VITE_HERMES_API_KEY ?? localStorage.getItem("growth-hacker.hermesApiKey") ?? "";

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
  const [hermesChatStatus, setHermesChatStatus] = useState<HermesChatStatus | null>(null);
  const [chatEvents, setChatEvents] = useState<HermesChatEvent[]>([]);
  const [activeChatRunId, setActiveChatRunId] = useState<string | null>(null);
  const [chatSessionId, setChatSessionId] = useState(() => `chat-${Date.now().toString(36)}`);
  const [socialCronTaskTypes, setSocialCronTaskTypes] = useState<SocialCronTaskType[]>(defaultSocialCronTaskTypes);
  const [socialCronTaskType, setSocialCronTaskType] = useState<SocialCronTaskType>("workspace-diagnosis");
  const [socialCronSchedule, setSocialCronSchedule] = useState("daily 09:00");
  const [socialCronAgentId, setSocialCronAgentId] = useState("growth-agent");
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(() => new Set());
  const [activeView, setActiveView] = useState<DashboardView>("workspace");
  const [chatDraft, setChatDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);

  const refresh = async () => {
    const [
      workspacePayload,
      runtimePayload,
      migrationPayload,
      authPayload,
      socialCronPayload,
      socialBoardPayload,
      socialCalendarPayload,
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
    if (!selectedProfile) return;
    setExpandedDirectories(new Set());
    void api<{ artifacts: ArtifactInfo[] }>(
      `/api/platforms/xiaohongshu/profiles/${encodeURIComponent(selectedProfile.profile)}/artifacts`
    ).then((payload) => {
      setArtifacts(payload.artifacts);
      const first =
        payload.artifacts.find((item) => item.kind === "file" && item.path === "01-client-brief.md") ??
        payload.artifacts.find((item) => item.kind === "file" && !item.path.includes("/")) ??
        payload.artifacts.find((item) => item.kind === "file");
      if (first) void openArtifact(first);
    });
  }, [selectedProfile?.profile]);

  const hermes = runtimes.find((runtime) => runtime.kind === "hermes");
  const openclaw = runtimes.find((runtime) => runtime.kind === "openclaw");
  const profileGroups = useMemo(() => groupByPlatform(profiles), [profiles]);
  const artifactTree = useMemo(() => buildArtifactTree(artifacts), [artifacts]);
  const visibleArtifacts = useMemo(() => flattenArtifactTree(artifactTree, expandedDirectories), [artifactTree, expandedDirectories]);
  const selectedSocialAgent = socialAgents.find((agent) => agent.id === socialCronAgentId) ?? socialAgents[0];
  const activeNavItem = dashboardNav.find((item) => item.id === activeView) ?? dashboardNav[0];

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
      `/api/platforms/xiaohongshu/profiles/${encodeURIComponent(selectedProfile.profile)}/artifact?path=${encodeURIComponent(
        artifact.path
      )}`
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

  async function createSocialCron() {
    if (!selectedProfile) return;
    setBusy("social-cron-create");
    try {
      await api<SocialCronJob>("/api/social-cron/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: socialCronAgentId || socialCronAgents[0],
          platform: selectedProfile.platform,
          profile: selectedProfile.profile,
          taskType: socialCronTaskType,
          schedule: socialCronSchedule
        })
      });
      await reloadSocialCron();
      setActiveView("cron");
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

  async function sendChatMessage() {
    const message = chatDraft.trim();
    if (!message || activeChatRunId) return;
    const agentId = selectedSocialAgent?.id ?? socialCronAgentId;
    const clientSessionId = chatSessionId;
    const hermesSessionId = `growth-hacker:${normalizeSessionPart(agentId)}:${normalizeSessionPart(clientSessionId)}`;
    setChatDraft("");
    setChatEvents((current) => [
      ...current,
      { event: "message.user", message, timestamp: Date.now() / 1000 }
    ]);
    setBusy("chat-run");
    let runId: string | null = null;
    try {
      const run = await createHermesChatRun(message, clientSessionId, hermesSessionId);
      runId = run.runId;
      setActiveChatRunId(run.runId);
      const controller = new AbortController();
      chatAbortRef.current = controller;
      await consumeHermesRunEvents(run.runId, controller.signal, (next) => {
        setChatEvents((current) => [...current, next]);
        if (["run.completed", "run.failed", "run.cancelled"].includes(next.event)) {
          setActiveChatRunId(null);
          setBusy(null);
          void refresh();
        }
      });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setChatEvents((current) => [
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
      setChatEvents((current) => [
        ...current,
        { event: "approval.error", error: error instanceof Error ? error.message : "approval_failed", timestamp: Date.now() / 1000 }
      ]);
    });
  }

  function resetChat() {
    chatAbortRef.current?.abort();
    setChatEvents([]);
    setActiveChatRunId(null);
    setChatDraft("");
    setChatSessionId(`chat-${Date.now().toString(36)}`);
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
            {activeView === "calendar" ? <CalendarSubNav agents={socialAgents} items={socialCalendarItems} /> : null}
            {activeView === "board" ? <BoardSubNav agents={socialAgents} tasks={socialBoardTasks} /> : null}
            {activeView === "cron" ? (
              <CronSubNav
                agents={socialCronAgents}
                busy={busy}
                jobs={socialCronJobs}
                onCreate={() => void createSocialCron()}
                selectedAgentId={socialCronAgentId}
                selectedProfile={selectedProfile}
                setSchedule={setSocialCronSchedule}
                setSelectedAgentId={setSocialCronAgentId}
                setTaskType={setSocialCronTaskType}
                schedule={socialCronSchedule}
                taskType={socialCronTaskType}
                taskTypes={socialCronTaskTypes}
              />
            ) : null}
            {activeView === "chat" ? (
              <ChatSubNav agents={socialAgents} onNewChat={resetChat} selectedAgent={selectedSocialAgent} status={hermesChatStatus} />
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
              <StatusBadge state={auth?.authenticated ? "ok" : "warn"} label={auth?.authenticated ? "XHS signed in" : "XHS login needed"} />
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

              {activeView === "calendar" ? <CalendarView items={socialCalendarItems} /> : null}

              {activeView === "board" ? (
                <BoardView busy={busy} onRun={(task) => void runSocialBoardTask(task)} tasks={socialBoardTasks} />
              ) : null}

              {activeView === "cron" ? (
                <CronView
                  busy={busy}
                  jobs={socialCronJobs}
                  onDelete={(job) => void deleteSocialCron(job)}
                  onRun={(job) => void runSocialCron(job)}
                  onToggle={(job) => void toggleSocialCron(job)}
                />
              ) : null}

              {activeView === "chat" ? (
                <ChatView
                  activeRunId={activeChatRunId}
                  draft={chatDraft}
                  events={chatEvents}
                  onApprove={(runId, choice) => void approveChatRun(runId, choice)}
                  onDraftChange={setChatDraft}
                  onSend={() => void sendChatMessage()}
                  onStop={() => void stopChatRun()}
                  selectedAgent={selectedSocialAgent}
                  status={hermesChatStatus}
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
              className={cn("sub-nav-row", selectedProfile?.profile === profile.profile && "sub-nav-row-active")}
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

function CronSubNav({
  agents,
  busy,
  jobs,
  onCreate,
  schedule,
  selectedAgentId,
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
  onCreate: () => void;
  schedule: string;
  selectedAgentId: string;
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
          <StatusBadge state={job.enabled ? "ok" : "warn"} label={job.enabled ? "on" : "off"} />
        </button>
      ))}
      {!jobs.length ? <EmptyCompact label="No cron jobs" /> : null}
    </div>
  );
}

function ChatSubNav({
  agents,
  onNewChat,
  selectedAgent,
  status
}: {
  agents: SocialAgent[];
  onNewChat: () => void;
  selectedAgent?: SocialAgent;
  status: HermesChatStatus | null;
}) {
  return (
    <div className="sub-nav-body">
      <SectionLabel icon={Bot} label="Agents" />
      <AgentList agents={agents} selectedAgent={selectedAgent} />
      <MetricRow label="Gateway" value={status?.available ? "online" : "offline"} />
      <MetricRow label="Model" value={status?.capabilities?.model ?? "unknown"} />
      <Separator />
      <SectionLabel icon={MessageSquare} label="Threads" />
      <button className="sub-nav-row sub-nav-row-active" onClick={onNewChat} type="button">
        <span className="truncate">New chat</span>
        <Badge variant="outline">draft</Badge>
      </button>
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
      <MetricRow label="Signed in" value={auth?.authenticated ? "yes" : "no"} />
      <MetricRow label="Account" value={auth?.nickname ?? "unknown"} />
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
                              {item.profile} / {item.agentId} / {item.runner}
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
                        {task.profile} / {task.runner} / {task.source}
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
  draft,
  events,
  onApprove,
  onDraftChange,
  onSend,
  onStop,
  selectedAgent,
  status
}: {
  activeRunId: string | null;
  draft: string;
  events: HermesChatEvent[];
  onApprove: (runId: string, choice: string) => void;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  selectedAgent?: SocialAgent;
  status: HermesChatStatus | null;
}) {
  const transcript = buildChatTranscript(events);
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
      <div className="chat-runtime-bar">
        <StatusBadge state={status?.available ? "ok" : "bad"} label={status?.available ? "Hermes API online" : "Hermes API offline"} />
        <span className="truncate">{status?.available ? status.baseUrl : status?.error ?? "api_server unavailable"}</span>
        {activeRunId ? <Badge variant="outline">{activeRunId}</Badge> : null}
      </div>
      <div className="chat-composer">
        <Textarea
          disabled={Boolean(activeRunId)}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) onSend();
          }}
          placeholder="Message the agent..."
          value={draft}
        />
        {activeRunId ? (
          <Button aria-label="Stop run" onClick={onStop} size="icon" type="button" variant="destructive">
            <Square className="size-4" />
          </Button>
        ) : (
          <Button disabled={!draft.trim() || !status?.available} onClick={onSend} size="icon" type="button">
            <Send className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

interface ChatTranscriptItemModel {
  id: string;
  kind: "user" | "assistant" | "tool" | "system" | "approval";
  text: string;
  runId?: string;
  tool?: string;
  state?: "running" | "done" | "failed";
  choices?: string[];
}

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
        {item.state === "running" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
        <div className="chat-line-body">
          <strong>{item.tool}</strong>
          <span>{item.text}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("chat-message", `chat-message-${item.kind}`)}>
      <div className="chat-message-role">{item.kind}</div>
      <div className="chat-message-text">{item.text}</div>
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
    if (event.event === "message.user") {
      closeAssistant();
      items.push({ id: `user-${index}`, kind: "user", text: String(event.message ?? "") });
      continue;
    }

    if (event.event === "message.delta" && event.delta) {
      if (!assistant) {
        assistant = { id: `assistant-${index}`, kind: "assistant", text: "" };
        items.push(assistant);
      }
      assistant.text += event.delta;
      continue;
    }

    if (event.event === "tool.started") {
      closeAssistant();
      items.push({
        id: `tool-${index}`,
        kind: "tool",
        state: "running",
        text: event.preview ?? "running",
        tool: event.tool ?? "tool"
      });
      continue;
    }

    if (event.event === "tool.completed") {
      closeAssistant();
      const tool = [...items].reverse().find((item) => item.kind === "tool" && item.tool === event.tool && item.state === "running");
      if (tool) {
        tool.state = event.error ? "failed" : "done";
        tool.text = event.duration ? `${event.duration}s` : "completed";
      } else {
        items.push({
          id: `tool-${index}`,
          kind: "tool",
          state: event.error ? "failed" : "done",
          text: event.duration ? `${event.duration}s` : "completed",
          tool: event.tool ?? "tool"
        });
      }
      continue;
    }

    if (event.event === "approval.request") {
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

    if (event.event === "approval.responded") {
      closeAssistant();
      items.push({ id: `approval-response-${index}`, kind: "system", text: `approval: ${event.choice ?? "sent"}` });
      continue;
    }

    if (event.event === "run.completed") {
      if (!events.some((candidate) => candidate.event === "message.delta") && event.output) {
        items.push({ id: `assistant-final-${index}`, kind: "assistant", text: event.output });
      }
      closeAssistant();
      continue;
    }

    if (event.event === "run.failed" || event.event === "run.cancelled" || event.event === "approval.error") {
      closeAssistant();
      items.push({
        id: `system-${index}`,
        kind: "system",
        text: String(event.error ?? event.event)
      });
    }
  }

  return items.filter((item) => item.text.trim() || item.kind === "tool" || item.kind === "approval");
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
          <MetricRow label="Signed in" value={auth?.authenticated ? "yes" : "no"} />
          <MetricRow label="Account" value={auth?.nickname ?? "unknown"} />
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

function AgentList({ agents, selectedAgent }: { agents: SocialAgent[]; selectedAgent?: SocialAgent }) {
  return (
    <div className="space-y-1">
      {agents.map((agent) => (
        <div className={cn("sub-nav-row", selectedAgent?.id === agent.id && "sub-nav-row-active")} key={agent.id}>
          <span className="truncate">{agent.id}</span>
          <Badge variant="outline">{agent.runner}</Badge>
        </div>
      ))}
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

function topbarContext(activeView: DashboardView, selectedProfile: WorkspaceProfile | null): string {
  if (activeView === "workspace") return `~/.growth/${selectedProfile?.platform ?? "xiaohongshu"}/${selectedProfile?.profile ?? ""}`;
  if (activeView === "chat") return "agent conversation";
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

async function getHermesChatStatus(): Promise<HermesChatStatus> {
  try {
    const [health, capabilities] = await Promise.all([
      hermesJson<HermesChatStatus["health"]>("/health/detailed", { auth: false, timeoutMs: 2500 }),
      hermesJson<HermesChatStatus["capabilities"]>("/v1/capabilities", { timeoutMs: 2500 })
    ]);
    return {
      available: true,
      baseUrl: hermesApiBaseUrl,
      health,
      capabilities
    };
  } catch (error) {
    return {
      available: false,
      baseUrl: hermesApiBaseUrl,
      error: error instanceof Error ? error.message : "hermes_api_unavailable"
    };
  }
}

async function createHermesChatRun(message: string, sessionId: string, hermesSessionId: string): Promise<HermesChatRunResponse> {
  const headers = new Headers({ "Content-Type": "application/json" });
  applyHermesAuthHeaders(headers);
  if (hermesApiKey) headers.set("X-Hermes-Session-Key", hermesSessionId);

  const payload = await hermesJson<{ run_id?: string; status?: string }>("/v1/runs", {
    method: "POST",
    headers,
    body: JSON.stringify({
      input: message,
      session_id: hermesSessionId
    }),
    timeoutMs: 15000,
    auth: false
  });
  const runId = payload.run_id ?? "";
  if (!/^run_[a-f0-9]+$/i.test(runId)) throw new Error("invalid_hermes_run_response");
  return {
    runId,
    status: payload.status ?? "started",
    sessionId,
    hermesSessionId
  };
}

async function consumeHermesRunEvents(runId: string, signal: AbortSignal, onEvent: (event: HermesChatEvent) => void): Promise<void> {
  const response = await fetch(hermesUrl(`/v1/runs/${encodeURIComponent(runId)}/events`), {
    headers: hermesAuthHeaders(),
    signal
  });
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

async function approveHermesRun(runId: string, choice: string): Promise<void> {
  await hermesJson(`/v1/runs/${encodeURIComponent(runId)}/approval`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ choice }),
    timeoutMs: 10000
  });
}

async function stopHermesRun(runId: string): Promise<void> {
  await hermesJson(`/v1/runs/${encodeURIComponent(runId)}/stop`, {
    method: "POST",
    timeoutMs: 10000
  });
}

function parseHermesSseEvent(raw: string): HermesChatEvent | null {
  const data = raw
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();
  if (!data) return null;
  return JSON.parse(data) as HermesChatEvent;
}

interface HermesJsonOptions extends RequestInit {
  auth?: boolean;
  timeoutMs?: number;
}

async function hermesJson<T>(path: string, options: HermesJsonOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 10000);
  try {
    const headers = new Headers(options.headers);
    if (options.auth !== false) applyHermesAuthHeaders(headers);
    const response = await fetch(hermesUrl(path), {
      ...options,
      headers,
      signal: controller.signal
    });
    if (!response.ok) throw new Error(await hermesErrorMessage(response));
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("hermes_api_timeout");
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

async function hermesErrorMessage(response: Response): Promise<string> {
  const fallback = `${response.status} ${response.statusText}`.trim();
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    return payload.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

function hermesUrl(path: string): string {
  return `${hermesApiBaseUrl}${path}`;
}

function hermesAuthHeaders(): Headers {
  const headers = new Headers();
  applyHermesAuthHeaders(headers);
  return headers;
}

function applyHermesAuthHeaders(headers: Headers): void {
  if (hermesApiKey) headers.set("Authorization", `Bearer ${hermesApiKey}`);
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeSessionPart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_.:-]+/g, "_").slice(0, 96) || "chat";
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as T;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function artifactPreviewUrl(artifact: ArtifactInfo): string {
  return artifactRawUrl(artifact.profile, artifact.path);
}

function artifactRawUrl(profile: string, path: string): string {
  return `/api/platforms/xiaohongshu/profiles/${encodeURIComponent(profile)}/artifact/raw?path=${encodeURIComponent(path)}`;
}

function resolveMarkdownAssetUrl(artifact: ArtifactInfo, source?: string): string {
  if (!source || source.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(source)) return source ?? "";
  const base = parentPath(artifact.path);
  const path = normalizeArtifactPath(source.startsWith("/") ? source.slice(1) : [base, source].filter(Boolean).join("/"));
  return artifactRawUrl(artifact.profile, path);
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
