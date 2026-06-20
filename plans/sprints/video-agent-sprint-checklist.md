# Video Agent — Sprint Checklist

> 来源：`plans/prds/video-agent-pack/`（PRD v1.0 · architecture v1/v2 · IMPLEMENTATION 报告 · 交付 bundle）
> 图例：`[ ]` 待办 · `[x]` 完成 · `[~]` 进行中 · `[!]` 阻塞
> 验收引用：`AC-00x` → PRD §19；`FR-0xx` → PRD §12；`NFR-0xx` → PRD §16
> 阶段独立性：每个 Sprint 合并后系统都处于可用状态，后一 Sprint 不落地也不破坏前者。

## 现状基线 Baseline

**已交付（在 zip 内，未应用进仓库）**
- 纯领域包 `packages/video-agent`：types / validation / stage-output / workflow / agent-prompts / compiler / storyboard / commands / media-provider + 单测。
- Server 模块 `apps/server/src/video`：repository（SQLite 8 表）/ artifactStore / hermesAgent / coordinator（调度器+状态机）/ routes（`/api/video`）。
- `apps/growthctl`：localhost HTTP CLI。
- `skills/creative/video-production-agent-skill`：SKILL.md + references。
- 集成测试 `apps/server/test/videoWorkflow.test.ts`；示例 `examples/video-agent/`；`scripts/apply.sh` + `scripts/verify-video-agent.sh`。
- 自验：严格 TS 通过；隔离 Bun 跑 12 pass / 0 fail / 51 assertions。

**未交付（本路线图要建）**
- React Video Studio UI（Sprint 2）。
- Shot/Bible 字段级失效图与增量重算（Sprint 2，FR-015 Phase 2）。
- 付费 Render Provider 真实提交 / 轮询 / QC / 变体（Sprint 3）。
- FFmpeg Assembly、配音、字幕、音乐、发布工作流（Sprint 4）。
- 旧 YouTube one-shot route 迁移与下线（Sprint 4）。

> ⚠️ **最脆弱假设**：「bundle 能干净应用、其测试/契约在当前仓库直接成立」。bundle 构建基线（较早 main）与当前仓库已漂移（agent harness、xhs 登录加固等近期提交），且当前 `apps/server/src/index.ts` **完全没有 SIGINT/SIGTERM 优雅停机骨架**（apply.sh 假设要在其上扩展）。故 **Sprint 0 必须按「dry-run apply → 对齐 drift → 真实验证」执行，而非「跑完 apply.sh 即认为绿」**。

## 路线图概览

| Sprint | 目标 | 对应 PRD Phase | 可独立合并 | 关键验收 |
|---|---|---|---|---|
| 0 | 落地并真实验证已交付后端切片 | Phase 0+1 | ✅ CLI 可用 | AC-001/002/003/008/010 |
| 1 | Preproduction 加固与质量评估 | Phase 1 加固 | ✅ | AC-004/005/007/009 |
| 2 | Dashboard Video Studio + 失效图 | Phase 2 | ✅ UI 上线 | FR-002/011/015 |
| 3 | Render 工作流（审批后付费生成） | Phase 3 | ✅ | AC-006/009、FR-014 |
| 4 | Assembly 与 Distribution + 旧路由下线 | Phase 4 | ✅ | FR-009、NFR-006 |

---

## Sprint 0 — 落地并验证已交付后端切片

> 目标：把 bundle 应用进真实仓库，对齐漂移，在真实 checkout + 真实 Hermes 上端到端跑通并通过现有回归。合并后：操作员/Agent 可经 `growthctl` 完成 故事→前期制作包→审批→导出。

### 0.1 预检与完整性
- [ ] 新建工作分支 `feat/video-agent-land`（勿在 main 直接改）。
- [ ] 校验交付完整性：核对 `growth-hacker-video-agent-delivery.sha256` 与 `MANIFEST.sha256`（解压后 `sha256sum -c`）。
- [ ] 将 zip 解压到暂存目录（如 `_ops/staging/video-agent-bundle/`，不污染仓库根）。
- [ ] 通读 bundle `README.md` + `patches/server-integration.md` + `IMPLEMENTATION.md`「未实现/未验证」清单。
- [ ] 记录当前关键文件基线供对比：`apps/server/src/server.ts`（`createApp` @82，return @690）、`apps/server/src/index.ts`、`package.json` scripts、`apps/server/package.json` deps、`docs/spec.md`、`.ai/context/capabilities.json`。

### 0.2 应用与漂移对齐（不可假设干净应用）
- [ ] **dry-run**：先只复制纯附加文件（`packages/video-agent`、`apps/server/src/video`、`apps/growthctl`、skill、examples、tests、`scripts/verify-video-agent.sh`），暂不执行就地编辑。
- [ ] 逐项手工核对 `apply.sh` 的 6 处幂等编辑能否套用到当前文件（diff 预演）：
  - [ ] 根 `package.json`：新增 `growthctl` / `test:video-agent` / `verify:video-agent` 脚本（与现有 scripts 不冲突）。
  - [ ] `apps/server/package.json`：加 `@growth-hacker/video-agent: workspace:*`。
  - [ ] `server.ts`：`import { createVideoModule }`；`app.route("/api/video", video.router)`；`createApp()` return 增加 `stopVideoWorkflowScheduler: video.stop`（现 return @690 为 `{ app, config, jobs, stopSocialCronScheduler }`）。
  - [ ] **`index.ts` 优雅停机**：当前 `index.ts` 仅 `Bun.serve`，**无 SIGINT/SIGTERM 处理、也未调用 `stopSocialCronScheduler`** → 需新增信号处理：停 video 调度器 + 停 social cron + 关 video SQLite + 停 Bun server。该处为真正的新集成点，逐字核对而非照搬。
  - [ ] `docs/spec.md`：追加 Video Studio 产品契约段落。
  - [ ] `.ai/context/capabilities.json`：登记 video capability 与本地 Agent 契约（核对 JSON schema 与现有结构一致）。
- [ ] 应用就地编辑（手工或受控运行 `apply.sh`），确认生成 `.video-agent-refactor-backup/` 备份。
- [ ] `git diff` 审查所有改动行，确认无意外覆盖现有路由/调度器/SPA fallback。
- [ ] 确认默认监听仍 `127.0.0.1`，`GROWTH_HACKER_HOST` 为显式 override（NFR-004）。

### 0.3 构建与静态检查
- [ ] `bun install` 成功，workspace 解析到新包/新 app。
- [ ] `bun --filter @growth-hacker/video-agent typecheck` 通过。
- [ ] `bun --filter @growth-hacker/server typecheck` 通过。
- [ ] `bun --filter @growth-hacker/growthctl typecheck` 通过。
- [ ] `bun run typecheck`（全 filter）通过。
- [ ] `bash scripts/verify-video-agent.sh` 通过。

### 0.4 自动化测试
- [ ] `bun --filter @growth-hacker/video-agent test`：领域单测全绿（输入校验 / source checksum / stage envelope / 跨引用 / 确定性 Prompt / storyboard / 状态迁移）。
- [ ] `bun test apps/server/test/videoWorkflow.test.ts`：集成测试全绿——
  - [ ] 同一外部 Run ID 重启续跑（不重复提交）。
  - [ ] `ambiguous_external_submission` 模糊提交保护。
  - [ ] 审批流。
  - [ ] Manifest 受限安全导出。
  - [ ] 幂等键请求一致性。
  - [ ] Revision CAS 冲突。
  - [ ] 崩溃后 Artifact 登记恢复。
  - [ ] 并发 Tick 只提交一次。
- [ ] **现有能力回归（AC-008）**：`bun test apps packages` 全绿——Chat / XHS / YouTube / Cron / Board / Workspace 既有测试不回归。
- [ ] SQLite migration 在引擎中实际建表：8 表 + 索引、`user_version` 正确。

### 0.5 真实 Hermes 端到端 + 重启恢复
- [ ] `growthctl video project create --input @examples/video-agent/project.json` 返回 Project ID + Revision 1。
- [ ] `growthctl video workflow start <projectId> --idempotency-key demo-v1` 返回 `runId`。
- [ ] **AC-002 / AC-009**：某 Agent Step 运行中 `kill` server → 重启 → Scheduler 读取 Hermes Run ID 续轮询，不创建重复 Run；提交窗口崩溃以 `ambiguous_external_submission` 停止等待人工。
- [ ] `growthctl workflow events <runId> --follow` 输出 JSONL，进度推进至 `waiting_approval`。
- [ ] **AC-001**：最终产出 Analysis / Bible / Scenes / Shots / Continuity / Prompts / Storyboard，且所有实体引用合法。
- [ ] **AC-003**：人为令 Hermes 返回非法输出 → 保留 raw + invalid Artifact，预算内带校验错误修复重试，耗尽才 `failed`，不污染下游。
- [ ] `growthctl workflow approve <runId> --decision approve --expected-revision 1` → 项目进入 `ready_for_render`。
- [ ] **AC-010**：`growthctl video package export <projectId> --revision 1` 仅含 manifest 选定的已校验 Artifact，API 仅返回 `growth://` URI + Growth Root 相对路径，无服务端绝对路径。

### 0.6 安全与契约一致性
- [ ] 路径穿越：尝试越界 artifact 路径被 root containment 拒绝。
- [ ] Artifact raw endpoint 返回 `nosniff` + 正确 Content-Type。
- [ ] 确认 Phase 1 不主动下载远程 URL（Reference URL 抓取留待后续）。
- [ ] Agent 权限为 `read_only`，无 Shell/OAuth/平台写权限。
- [ ] Source / Prompt 不作为 Shell 参数执行。

### 0.7 验收签收（Sprint 0 覆盖项）
- [ ] AC-001 故事→生产包 ✅
- [ ] AC-002 重启恢复 ✅
- [ ] AC-003 无效输出隔离 ✅
- [ ] AC-008 兼容现有能力 ✅
- [ ] AC-009 模糊提交保护（preproduction）✅
- [ ] AC-010 安全导出 ✅

### 0.8 文档与弃用标记
- [ ] 将 PRD/架构正式纳入 `docs/`（`docs/product/video-agent-prd.md`、`docs/architecture/video-agent-refactor-v1.md`）。
- [ ] 旧 `/api/platforms/youtube/profiles/:profile/video-runs` 标记 deprecated（保留一个迁移周期，NFR-006）。
- [ ] 更新 `README` / `docs/spec.md` 指向 Video Studio 能力与 `growthctl` smoke flow。

### Sprint 0 Exit Criteria
- [ ] 上述全部勾选；`bun run typecheck` + `bun test apps packages` 在真实 checkout 全绿；真实 Hermes 至少完成一次 preproduction 全流程并通过重启恢复。

---

## Sprint 1 — Preproduction 加固与质量评估

> 目标：把「能跑」提升到「稳、准、可观测」。合并后：阶段产出质量可度量，CLI/错误契约严格成立。

### 1.1 阶段 Prompt 与真实 Hermes 调优
- [ ] 用真实 Hermes 跑 5 阶段（story_analysis → story_bible → scene_breakdown → shot_planning → continuity_review），逐阶段记录失败样例。
- [ ] 调优各阶段 instruction 模板版本（`agent-prompts.ts`），固化模板版本号入 manifest。
- [ ] 校准修复重试：malformed JSON / domain-reference 错误的可重试分类与最大 3 次预算（architecture-v1 §6）。
- [ ] 阶段间上下文最小化核对（PRD §11.2）：每阶段只收必要实体，Source ≤ 120,000 字符硬上限、超限拒绝不截断。

### 1.2 质量评估集
- [ ] 建固定评估集：短故事 / 广告 / 讲解 / 竖屏短视频 / 对白场景 各 ≥1。
- [ ] 实现/接入度量脚本，输出：Schema 首次通过率、Beat coverage、总时长偏差、Shot 可生成性、连续性冲突数/100 shots、Prompt 必填约束保留率。
- [ ] 对结构/ID/约束/必填字段断言，**不**对自然语言全文做脆弱 snapshot（architecture-v2 §16.6）。

### 1.3 确定性与并发契约
- [ ] **AC-005**：同一 ShotSpec + 同一 Compiler 版本重复编译字节一致（加回归测试）。
- [ ] Storyboard 确定性：用持久化 step 起始时间戳而非实时钟，孤儿写重放字节一致。
- [ ] **AC-004**：两调用者并发编辑同一 Revision，后者 `expectedRevision` 不匹配收 `revision_conflict`，旧版本不被覆盖。
- [ ] 幂等键唯一性、`run_id+step_key+input_hash` 幂等再验证。

### 1.4 CLI 与错误契约（AC-007）
- [ ] 普通命令 stdout 仅一个合法 JSON envelope；日志/诊断只进 stderr。
- [ ] `workflow events --follow` 为 JSONL。
- [ ] 退出码符合 PRD §13.4（0/2/3/4/5/6/7/10）。
- [ ] 错误 envelope 字段完整（code/message/retryable/details），错误可定位到 Stage/Scene/Shot/Field。

### 1.5 可观测性（NFR-003）
- [ ] 结构化日志字段：requestId / projectId / revision / runId / stepId / hermesRunId / duration / attempt / model / provider / token usage / error code。
- [ ] 日志脱敏：不记录 Token / Cookie / Authorization / 完整 OAuth / 未脱敏 CLI 输出 / 模型隐藏推理。
- [ ] 记录每阶段排队/开始/心跳/完成/失败/重试事件。

### 1.6 性能（NFR-002，本地基准）
- [ ] 项目列表 P95 < 200ms（≤1000 项）。
- [ ] 项目详情 P95 < 300ms（不读大 Artifact 正文）。
- [ ] Workflow status P95 < 200ms。
- [ ] Storyboard 100 shots 生成 < 2s（不含 LLM）。
- [ ] 初始状态端点不被 Hermes 慢调用阻塞。

### Sprint 1 Exit Criteria
- [ ] 评估集指标基线建立并入库；AC-004/005/007/009 测试全绿；可观测字段在真实运行中可见且脱敏。

---

## Sprint 2 — Dashboard Video Studio（Phase 2）

> 目标：在 Sprint 0 后端之上交付可用 UI 与字段级失效图。合并后：用户可在浏览器完成项目/场景/镜头/分镜/审批，并局部重算。

### 2.1 Web 架构准备（渐进 strangle `App.tsx`，现 6927 行）
- [ ] 引入路由层（route-level feature），新增 `apps/web/src/app/router.tsx` / `providers.tsx` / `apiClient.ts`。
- [ ] 引入 server-state query/cache 层，按 key 精确失效（替代全局 `busy`）。
- [ ] 新建 `features/video-projects` / `features/storyboard` / `entities/{project,scene,shot,artifact}` 目录骨架。
- [ ] 由 `packages/video-agent` 契约生成/复用前端 TS 类型与 API client（不重复定义）。

### 2.2 页面（PRD §15）
- [ ] **Project List**：标题/状态/画幅/目标时长/当前 Revision/最近 Run 状态/更新时间；搜索 + 状态筛选（FR-002 Phase 2）。
- [ ] **Project Overview**：紧凑工具栏（Run Preproduction / Export / Create Revision）；Brief 摘要、当前阶段、阻塞问题、Artifact 完成度。
- [ ] **Scene/Shot Editor**：左 Scene 导航 + 中 Shot 表格/卡片 + 右 Inspector（Camera/Blocking/Continuity/Prompt）；dirty/invalidated 状态；按 Scene/角色/状态过滤；非自由画布。
- [ ] **Storyboard**：每 Shot 占位图/Shot ID/时长/镜头语言/动作/对白/Prompt/连续性；打印/导出（FR-011）。
- [ ] **Run Drawer**：Step 时间线、模型、尝试次数、错误、输出 Artifact、审批；错误可定位 Stage/Scene/Shot/Field。
- [ ] **Approvals UI**：decision + scope（sceneIds/shotIds）+ comment；显示预计调用数/额度/影响范围。

### 2.3 实时与增量
- [ ] SSE 订阅持久化 `workflow_event`，支持 `Last-Event-ID` 重连（非进程内 listener）。
- [ ] Workflow 状态以服务端持久状态为准，SSE 只做增量。

### 2.4 字段级失效图（FR-015 Phase 2）
- [ ] 建依赖图：改某 Shot → 仅该 Shot 的 Prompt / Storyboard 条目 / 下游 Render 失效。
- [ ] 改 Bible 角色外观 → 引用该角色的 Shot 失效。
- [ ] 失效后只重跑下游 Step（标记 `stale`），不覆盖已批准版本。
- [ ] UI 直观呈现 stale/invalidated；Continuity warning 直链冲突字段。

### 2.5 体验与健壮性
- [ ] i18n（中/英），空态/错误态/加载态。
- [ ] Scene/Shot 拖拽排序用独立 `ordinal`，stable ID 不变。
- [ ] Prompt 同时展示 Canonical 与 Provider compiled 版本。

### 2.6 端到端
- [ ] E2E：故事 → preproduction 包 → 编辑一个 Shot → 仅重编该 Prompt。
- [ ] E2E：审批指定 Scene；Revision diff 可见。

### Sprint 2 Exit Criteria
- [ ] Studio 各页面可用并通过 E2E；失效图正确（改一处只 stale 应 stale 者）；`App.tsx` 不再承载跨领域 video 业务逻辑。

---

## Sprint 3 — Render 工作流（Phase 3）

> 目标：在审批门后实现按镜头付费生成与媒体 QC。合并后：可对已批准 Scene/Shot 提交真实生成、轮询、QC、选优，默认 dry-run。

### 3.1 Provider 适配（FR-014）
- [ ] 将 Hermes `video_generate` 封装为 `VideoRenderProviderPort` 实现（脱离 YouTube route）。
- [ ] Capabilities 声明：画幅 / 时长范围 / 分辨率 / 参考图 / 首尾帧 / 音频 / 异步 / 取消 / 费用估算。
- [ ] 依 capability 校验 Render Manifest；不支持能力产出 warning 而非静默丢弃。

### 3.2 Render 计划与审批（AC-006）
- [ ] `render_plan`：按 capability 生成可提交计划 + 成本估算。
- [ ] `cost_approval` 门：`external_cost` 必须人工审批；**发起 Workflow 的 Agent 不能自批**。
- [ ] Approval 绑定 revision + run + 资源范围 + 预算；Revision 变化令 token 失效。

### 3.3 提交 / 轮询 / 取消（AC-009 扩展到 render）
- [ ] 按 Shot 提交（非整片一次 `video_generate`）。
- [ ] 外部 job ID 立即持久化；提交前持久 `submitting`，崩溃窗口走 `ambiguous_external_submission` 不自动重提。
- [ ] 轮询 + 取消；重启不重复提交已登记 job。
- [ ] 并发上限（Adapter 限制）、预算上限、重试预算、默认 dry-run。

### 3.4 媒体获取安全（NFR-004 / architecture-v2 §14.2）
- [ ] 逐跳验证 redirect 的 protocol/host/解析 IP；阻止 loopback/private/link-local/multicast/metadata IP。
- [ ] 限 redirect 次数 / 响应头时间 / 总时长 / 字节数；流式写 temp，不 `arrayBuffer()` 整读。
- [ ] 校验 MIME / 扩展名 / magic bytes；原子提交 Artifact，失败清理 temp。

### 3.5 媒体 QC 与变体
- [ ] 元数据 QC：分辨率 / 帧率 / 时长 / 音轨 / 可解码性。
- [ ] 可选视觉 QC：黑帧 / 冻结帧 / 文本伪影 / 主体突变 / 角色连续性。
- [ ] 默认每 Shot 1 变体；仅对失败镜头追加变体并重试。

### 3.6 契约测试与迁移
- [ ] Provider adapter contract suite：submit / poll / cancel / artifact acquisition / 超时 / 错误码。
- [ ] 移除「从最终自然语言正则抓视频引用」主路径，仅保留旧兼容适配器。

### Sprint 3 Exit Criteria
- [ ] 仅重试失败镜头；重启不重复提交；成本审批不可被 Agent 自批；契约测试全绿；默认不自动付费。

---

## Sprint 4 — Assembly 与 Distribution（Phase 4）

> 目标：从已选媒体到可发布交付包，并把发布做成独立审批工作流；收尾旧路由。合并后：同一 DeliveryPackage 可生成多渠道 DistributionPlan。

### 4.1 Assembly 计划
- [ ] 生成 `timeline.json`（可选 OTIO / FCPXML / EDL）。
- [ ] 选定 render variant 映射；转场 / 音频 / 字幕 / 裁切计划。
- [ ] `ffmpeg` 命令计划或 renderer job（不在本机强制执行付费渲染）。

### 4.2 配音 / 字幕 / 音乐
- [ ] Voiceover 脚本（`11-voiceover-script.md`）。
- [ ] 字幕草稿（`12-subtitles-draft.srt`）。
- [ ] 音乐 cue 与音频意图落入 edit plan。

### 4.3 交付包（FR-009 完整化）
- [ ] 生成 architecture-v2 §10 完整交付物清单（00-manifest … 15-qa-report）。
- [ ] 交付只信任 `package-manifest.json` 内 Artifact ID；原始/无效响应不入包。
- [ ] 导出前后双重校验 checksum。

### 4.4 Distribution（独立工作流）
- [ ] `DeliveryPackage → DistributionPlan → Validate Target → publish_approval → Publisher Adapter → Publication Record`。
- [ ] **YouTube Publisher Adapter**：复用 `packages/youtube-cli` 的 OAuth / scope / channel binding / dry-run / confirm gate。
- [ ] **XHS Publisher Adapter**：复用现有 xhs 写边界。
- [ ] `publish_approval`：`external_publish` 人工审批；绑定 profile/channel + revision + run + scope + 预算；Revision 变更令 token 失效。
- [ ] 记录 synthetic-media / rights / provenance 供平台元数据与审计。

### 4.5 旧路由迁移与清理（NFR-006 / architecture-v2 Phase 6）
- [ ] 旧 YouTube one-shot route 改为兼容适配器：创建临时 VideoProject + 单 Shot Workflow，返回兼容 run ID，响应带 deprecation 元数据。
- [ ] Dashboard 不再调用旧 video route。
- [ ] 一个无消费者发布周期后删除旧 one-shot prompt builder（`hermesVideos.ts` 主路径）。
- [ ] 更新 architecture snapshot / ADR / runbook。

### Sprint 4 Exit Criteria
- [ ] 同一 DeliveryPackage 可创建多个 DistributionPlan 而不重生成内容；所有平台写操作经 Approval + channel binding；旧路由完成兼容或下线。

---

## 横切关注点（持续，每 Sprint 复检）

### 风险防护（PRD §17）
- [ ] LLM 输出不符 Schema：严格 JSON + 阶段解析器 + 限次修复 + 原始留档 + 失败不下传。
- [ ] 上下文过长：阶段化 Artifact + 只传必要实体 + 字段长度限制 + Source 120k 硬上限。
- [ ] 连续性不稳：Bible 锚点 + Reference ID + 首尾帧状态 + 确定性引用检查 + 独立 Continuity Agent + 渲染前人工批准。
- [ ] 成本失控：Render Plan 先估 + 外部成本 Approval + 镜头/并发上限 + 重试预算 + 默认 dry-run。
- [ ] Workflow 重复执行：幂等键 + Step CAS + provider request key + 外部 Run ID 持久化 + 重启恢复测试。

### 安全不变量（NFR-004，每 Sprint 不得回退）
- [ ] 浏览器/Agent/日志均不接触平台凭据。
- [ ] 默认绑定 `127.0.0.1`；远程需显式配置 HTTPS/认证/访问控制。
- [ ] 领域包不 import Hono / React / bun:sqlite / Hermes（NFR-005）。

## 验收标准映射（PRD §19）

| AC | 描述 | 主 Sprint |
|---|---|---|
| AC-001 | 故事→生产包 | 0 |
| AC-002 | 重启恢复 | 0 |
| AC-003 | 无效输出隔离 | 0 / 1 |
| AC-004 | Revision 冲突 | 1 |
| AC-005 | 确定性 Prompt | 1 |
| AC-006 | 审批门（preprod/cost/publish） | 0 / 3 / 4 |
| AC-007 | CLI 机器输出 | 1 |
| AC-008 | 兼容现有能力 | 0（每 Sprint 复检） |
| AC-009 | 模糊提交保护 | 0（preprod）/ 3（render） |
| AC-010 | 安全导出 | 0 |

## MVP Definition of Done（PRD §22）

- [ ] 1. 领域不再依赖 YouTube profile。
- [ ] 2. 项目和 Workflow 状态持久化。
- [ ] 3. 故事/剧本可生成完整结构化前期制作包。
- [ ] 4. 任何 Agent 输出必须先校验。
- [ ] 5. Prompt 编译与 Storyboard 为确定性代码。
- [ ] 6. CLI 与 API 调用同一 Use Case。
- [ ] 7. 具备 Revision、幂等、错误码与审批。
- [ ] 8. 重启后可恢复。
- [ ] 9. 现有功能不回归。
- [ ] 10. 文档、测试、迁移说明与弃用路径齐全。

## 关键命令速查

```bash
# 应用（从解压后的 bundle 目录）
bash _ops/staging/video-agent-bundle/scripts/apply.sh .
bun install
bash scripts/verify-video-agent.sh
bun run typecheck
bun test apps packages

# 定向
bun --filter @growth-hacker/video-agent typecheck
bun --filter @growth-hacker/video-agent test
bun test packages/video-agent/test apps/server/test/videoWorkflow.test.ts

# growthctl 冒烟
bun run growthctl -- video project create --input @examples/video-agent/project.json
bun run growthctl -- video workflow start <projectId> --idempotency-key demo-v1
bun run growthctl -- workflow events <runId> --follow
bun run growthctl -- workflow approve <runId> --decision approve --expected-revision 1
bun run growthctl -- video package export <projectId> --revision 1
```
