已完成一版**可直接并入仓库的 Video Agent V1**，不仅是 PRD，还包括领域模型、SQLite 持久化 Workflow、Hermes 分阶段 Agent、API、CLI、Skill、测试与安装脚本。

## 交付物

* [详细 Video Agent PRD](sandbox:/mnt/data/growth-hacker-video-agent-PRD.md)
* [完整重构代码包](sandbox:/mnt/data/growth-hacker-video-agent-refactor.zip)
* [实现与验证报告](sandbox:/mnt/data/growth-hacker-video-agent-IMPLEMENTATION.md)
* [Video Agent 架构设计](sandbox:/mnt/data/growth-hacker-video-agent-architecture-v1.md)
* [交付文件 SHA-256](sandbox:/mnt/data/growth-hacker-video-agent-delivery.sha256)
* [此前的总体架构 V2](sandbox:/mnt/data/growth-hacker-architecture-v2.md)

## 已实现范围

### 1. 独立视频生产领域

视频能力不再从属于 YouTube Profile，核心模型包括：

```text
VideoProject
VideoRevision
ProductionBrief
StoryBible
VisualBible
SceneSpec
ShotSpec
ContinuityReport
CanonicalPromptSpec
ProviderPrompt
RenderManifest
WorkflowRun
WorkflowStep
Artifact
Approval
```

所有项目修改通过不可变 Revision 管理，并支持 `expectedRevision` 乐观并发控制。

### 2. 专业视频前期制作 Workflow

```text
story_analysis
  → story_bible
  → scene_breakdown
  → shot_planning
  → continuity_review
  → prompt_compilation
  → storyboard_document
  → preproduction_approval
```

其中：

* 故事分析、世界观设定、场景拆分、镜头规划、连续性审查由 Hermes Agent 分阶段执行；
* Prompt 编译、引用校验、Storyboard、CSV、Render Manifest 和 Package Manifest 由确定性 TypeScript 实现；
* 每个 Agent 阶段使用严格、带版本号的 JSON Envelope；
* 无效输出保留为独立 Artifact，可携带校验错误重新生成；
* Agent 内部角色不是公共 API，外部调用稳定的业务命令。

现有 Hermes 已提供创建、查询和停止 Run 的接口，因此新 Adapter 可以持久化外部 Run ID，并在服务重启后继续查询同一任务，而不是重新提交。([GitHub][1])

### 3. Durable Workflow Kernel

运行状态从内存任务提升为 SQLite 持久化状态机：

```text
video_projects
video_revisions
video_workflow_runs
video_workflow_steps
video_workflow_events
video_artifacts
video_approvals
video_idempotency_keys
```

实现了：

* SQLite WAL；
* Run/Step 状态迁移约束；
* 幂等启动；
* 唯一租约令牌和心跳；
* 多 Scheduler Tick 防重复提交；
* 有限重试；
* 手工重试；
* 取消；
* SSE 事件；
* 人工审批；
* 重启恢复；
* Provider 模糊提交保护。

现有仓库的通用任务状态仍主要存放在进程内 `Map`，无法满足长时间视频任务的恢复要求；本实现没有直接破坏旧任务模块，而是先在 Video Studio 纵向切片中引入 durable workflow。([GitHub][2])

### 4. Artifact Store

大型结果不塞入数据库 JSON，而是保存为不可变文件：

* 原始 Agent 输出；
* 无效输出；
* 校验后 Story Analysis；
* Story/Visual Bible；
* Scene/Shot JSON；
* Continuity Report；
* Canonical Prompt JSONL；
* Provider Prompt JSONL；
* Storyboard Markdown；
* Shot List CSV；
* Render Manifest；
* Project Snapshot；
* Package Manifest。

同时实现了 SHA-256、来源链、原子 no-replace 写入、路径穿越防护、崩溃孤儿文件接管以及导出前后校验。

导出严格受 Package Manifest 限制，不会把无效 Agent 输出、其他 Workflow Run 或无关文件混入交付包。

### 5. API 与 CLI

新增独立 Hono 路由：

```text
/api/video/projects
/api/video/projects/:projectId/revisions
/api/video/projects/:projectId/workflows
/api/video/workflows/:runId
/api/video/workflows/:runId/events
/api/video/workflows/:runId/retry
/api/video/workflows/:runId/cancel
/api/video/workflows/:runId/approval
/api/video/artifacts/:artifactId
/api/video/projects/:projectId/package
```

新增薄 CLI：

```bash
growthctl video project create
growthctl video project list
growthctl video project show
growthctl video project revise
growthctl video workflow start
growthctl workflow status
growthctl workflow events --follow
growthctl workflow retry
growthctl workflow cancel
growthctl workflow approve
growthctl artifact show
growthctl video package export
```

CLI 只访问本地 API，不直接打开 SQLite，也不读取 OAuth 或 Provider 凭据。默认拒绝非 loopback Server；远程调用必须显式允许并使用 HTTPS。

当前仓库本身采用 `apps/*`、`packages/*` 工作区和 Bun 脚本，所以新增 `packages/video-agent` 与 `apps/growthctl` 可以作为增量模块接入，而不需要改造整个构建系统。([GitHub][3])

### 6. 与旧接口兼容

现有绑定在 YouTube 下的一次性视频生成接口暂时保留，新的 `/api/video` 独立运行。这样不会一次性影响 Chat、XHS、YouTube 和 Cron 等现有路径。旧接口仍然属于单次 Prompt 到视频的调用，不具备 Scene、Shot、Revision、Approval 和恢复语义。([GitHub][4])

## 验证结果

已执行：

```text
严格 TypeScript 检查：通过
Bun 正式测试：12 pass / 0 fail / 51 assertions
领域测试：8 个
SQLite Workflow 集成测试：4 个
SQLite Migration：8 张表、5 个显式索引、user_version=1
apply.sh Bash 检查：通过
apply.sh 连续执行两次：通过
ZIP 完整性与文件 Manifest：通过
```

集成测试覆盖：

* Agent 执行过程中重启；
* 重启后继续使用同一个 Hermes Run ID；
* 不重复提交；
* 模糊提交进入人工重试；
* Preproduction Approval；
* Revision CAS；
* 幂等键输入一致性；
* Artifact 崩溃恢复；
* 受 Manifest 约束的导出；
* 并发 Tick 只提交一次。

当前环境没有完整仓库 checkout 和真实 Hermes Gateway，因此尚未执行现有 Chat/XHS/YouTube 模块的全仓回归，也没有真实调用 Hermes 完成在线前期制作。

## 应用方式

解压代码包后，在 Growth Hacker 仓库根目录执行：

```bash
unzip growth-hacker-video-agent-refactor.zip

cd /path/to/growth-hacker

bash /path/to/growth-hacker-video-agent-refactor/scripts/apply.sh .

bun install
bash scripts/verify-video-agent.sh

bun run typecheck
bun test apps packages
```

安装脚本会先在以下目录备份被修改文件：

```text
.video-agent-refactor-backup/<timestamp-pid-random>/
```

## 有意留到下一阶段的内容

本次完成的是工程地基和完整 Preproduction MVP，尚未实现：

* React Video Studio 页面；
* Scene/Shot 可视化编辑器；
* Storyboard 卡片与拖动排序；
* 字段级局部失效和局部重新生成；
* 真实付费视频 Provider 提交；
* 多变体选择和媒体 QC；
* 配音、字幕、音乐与 FFmpeg Assembly；
* 独立 YouTube/XHS 发布 Workflow；
* 旧 one-shot 视频接口的正式弃用。

这些边界已经在 PRD 中定义，下一阶段可以直接从 Dashboard Video Studio 和 Render Workflow 开始，而不需要再次调整底层领域与运行架构。

[1]: https://raw.githubusercontent.com/Ancienttwo/growth-hacker/main/apps/server/src/hermesChat.ts "raw.githubusercontent.com"
[2]: https://github.com/Ancienttwo/growth-hacker/blob/main/apps/server/src/jobs.ts "https://github.com/Ancienttwo/growth-hacker/blob/main/apps/server/src/jobs.ts"
[3]: https://raw.githubusercontent.com/Ancienttwo/growth-hacker/main/package.json "raw.githubusercontent.com"
[4]: https://raw.githubusercontent.com/Ancienttwo/growth-hacker/main/apps/server/src/server.ts "https://raw.githubusercontent.com/Ancienttwo/growth-hacker/main/apps/server/src/server.ts"
