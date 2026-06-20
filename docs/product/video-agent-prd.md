# PRD：Growth Hacker Video Agent

> 状态：Phase 1 implementation baseline  
> 版本：1.0  
> 日期：2026-06-19  
> 产品形态：Local-first operator workbench + Agent workflow  
> 目标版本：Video Agent MVP / Preproduction V1  
> 依赖：Growth Hacker Dashboard、Hermes Gateway、本地 SQLite、Artifact Store

---

## 1. 产品摘要

Video Agent 是 Growth Hacker 中独立于 YouTube、小红书等分发平台的视频生产域。用户输入一个故事、创意梗概、口播稿或标准剧本后，系统通过可恢复、可审查、可追踪的工作流，生成一套能够直接进入 AI 视频生成或传统制作流程的专业前期制作包。

MVP 的核心交付不是“一次性生成一条视频”，而是稳定生成以下彼此一致的生产资料：

1. Production Brief；
2. Story Analysis；
3. Story Bible 与 Visual Bible；
4. Scene Breakdown；
5. Shot List / ShotSpec；
6. Continuity Review；
7. Canonical Prompt 与 Provider Prompt；
8. Storyboard 文档；
9. Render Manifest；
10. 可审计的 Workflow Run、Step、Artifact 和 Approval 记录。

产品的核心承诺是：**输入可以模糊，输出必须结构化；Agent 可以创造，系统必须控制；长任务可以失败，但不能丢失状态。**

---

## 2. 背景与问题

当前视频生成能力附着在 YouTube profile API 下，主要工作方式是把用户 Prompt 包装成一次 Hermes Chat Run，要求 Agent 调一次 `video_generate`，再从最终文本中识别视频引用。这种方式能够验证模型接入，但无法支撑完整生产：

- 视频资产被错误地归属于分发平台，而不是内容项目；
- 缺少 Project、Revision、Scene、Shot、PromptSpec 等稳定实体；
- 无法对单个镜头修改、重试、替换或比较变体；
- 缺少角色、服装、道具、场景和镜头之间的连续性约束；
- Agent 输出依赖自然语言和正则提取，难以验证；
- 长时间任务缺少持久化步骤、恢复、幂等和审批；
- 生成成本、外部写入、发布等风险没有统一策略；
- UI、API、CLI 和 Agent Tool 无法共享一个业务命令契约。

Video Agent 必须把“一次工具调用”升级为“专业制作工作流”。

---

## 3. 产品目标

### 3.1 用户目标

用户能够在不掌握摄影、分镜和生成模型 Prompt 工程全部细节的情况下，将故事或剧本转化为专业、完整、可执行的视频生产包；能够审查和修改任意场景、镜头及风格规则，而无需重新生成整个项目。

### 3.2 业务目标

- 为 Growth Hacker 增加平台无关的内容生产核心；
- 将 YouTube/XHS 从内容生产者降级为 Distribution Target；
- 形成可复用的 Agent Workflow、Artifact、Approval 和 Provider 基础设施；
- 让 CLI、Dashboard、自动化脚本和 Agent 使用同一应用能力；
- 为未来接入多个图像、视频、配音和剪辑 Provider 保留稳定边界。

### 3.3 工程目标

- 所有运行状态可在进程重启后恢复；
- 所有 Agent 输出必须通过结构校验后才能进入下一阶段；
- 所有阶段输入、输出、模型选择、错误和审批可追踪；
- Prompt 编译尽可能确定性，不让 Provider 细节污染 ShotSpec；
- 默认无外部付费调用、无发布、无破坏性操作；
- 领域逻辑不依赖 Hono、React、Hermes 或具体视频 Provider。

---

## 4. 非目标

MVP 不承担以下能力：

- 全自动生成并发布一部长视频；
- 浏览器端保存模型密钥、OAuth Token 或平台凭据；
- 多租户、远程协作和云端项目同步；
- 专业 NLE 的完整替代品；
- 对所有剧本格式实现无损 Fountain/Final Draft 解析；
- 自动保证模型生成的人物绝对一致；
- 未经审批自动执行付费批量渲染；
- 未经审批自动上传或公开发布到任何平台。

---

## 5. 目标用户与角色

### 5.1 独立创作者

输入故事梗概或口播脚本，希望快速得到镜头清单、画面 Prompt、旁白和剪辑建议，并生成短视频素材。

### 5.2 小型工作室制片人

需要管理多个项目、版本、镜头状态、审批和生成变体，强调可追踪、可局部重做和交付包完整性。

### 5.3 导演/编导

希望控制叙事节奏、视觉风格、镜头语言和连续性；需要在生成前审阅场景、ShotSpec 与 Storyboard。

### 5.4 Agent Runtime

通过稳定命令或 Tool Schema 创建项目、启动工作流、读取状态、修订镜头和导出 Artifact；不能绕过审批或直接获得凭据。

### 5.5 操作员

拥有最终审批权，控制付费渲染、外部发布、删除和凭据管理。

---

## 6. 核心使用场景

### 场景 A：故事到专业分镜

用户输入一段故事，选择 16:9、约 60 秒、写实电影风格。系统生成 Story Bible、8 个场景、约 20 个镜头、Storyboard 文档和每镜头 Prompt。用户修改第 7 镜头的焦段和动作后，只重新编译相关 Prompt。

### 场景 B：标准剧本到短视频生产包

用户导入剧本文件，设置目标平台为 YouTube Shorts、9:16、45 秒。系统识别对白、旁白、地点和人物，压缩成适合时长的 Scene/Shot 结构，并给出被删减情节和风险警告。

### 场景 C：连续性审查

系统发现角色在 SHOT-012 的外套颜色与前一镜头不一致、关键道具在出场前已经出现、日夜状态跳变，将问题标记为 error/warning，并阻止自动进入付费渲染。

### 场景 D：局部重新生成

用户只调整 SCENE-03 的视觉风格。系统创建新 Revision，标记受影响镜头，重新执行该场景的 Shot Planning、Continuity 和 Prompt Compilation，而不覆盖已批准版本。

### 场景 E：Agent/代码调用

外部 Agent 使用 `growthctl` 创建项目并启动 Workflow，得到 `runId`；通过 JSON 查询状态、读取 Artifact URI；当工作流进入审批状态时，Agent只能报告，不能自行批准外部成本操作。

---

## 7. 产品原则

### 7.1 生产域与分发域分离

视频项目不属于 YouTube profile。项目先形成内容资产，再选择一个或多个 Distribution Target。

### 7.2 Canonical First

ShotSpec 和 PromptSpec 是稳定真相源。Hermes Video、未来的其他视频模型、图像模型或人工制作单都由 Compiler 从 Canonical 数据生成。

### 7.3 Deterministic Control, Agentic Creation

Agent 负责理解、创作和评审；代码负责状态、校验、转换、权限、幂等、审批、存储和调度。

### 7.4 Revision over Mutation

重要修改创建 Revision；历史生产包、审批和生成结果不可被静默覆盖。

### 7.5 Artifact over Chat Text

聊天文本不是最终产品。正式输出必须登记为带类型、版本、hash 和来源的 Artifact。

### 7.6 Safe by Default

分析与本地写入可以自动执行；外部成本、发布、破坏性操作和凭据管理必须使用显式审批。

---

## 8. 信息架构

```text
Video Studio
├── Projects
│   ├── Project Overview
│   ├── Source & Brief
│   ├── Story / Visual Bible
│   ├── Scenes
│   ├── Shots
│   ├── Storyboard
│   ├── Prompts
│   ├── Runs & Approvals
│   ├── Assets / Artifacts
│   └── Delivery
├── Workflow Runs
├── Provider Status
└── Settings
```

项目详情采用工作台布局：左侧项目/场景导航，中间主编辑区，右侧 Inspector。避免营销式大卡片和无信息装饰。

---

## 9. 领域模型

### 9.1 VideoProject

```ts
interface VideoProject {
  id: string;
  title: string;
  status: "draft" | "in_preproduction" | "ready_for_render" | "rendering" | "completed" | "archived";
  currentRevision: number;
  brief: ProductionBrief;
  source: StorySource;
  createdAt: number;
  updatedAt: number;
}
```

### 9.2 StorySource

- `kind`: story、outline、screenplay、voiceover、article、unknown；
- `text`: 原始输入；
- `language`；
- `sourceName`；
- `checksum`；
- 原文在 Revision 中保持不变，并以 `source.txt` 进入交付包；Phase 1 Source 上限为 120,000 字符，超限直接拒绝而不截断。

### 9.3 ProductionBrief

至少包含：

- 目标受众；
- 目标平台或用途；
- 画幅；
- 目标时长；
- 语言；
- 叙事类型；
- 视觉风格；
- 节奏；
- 内容等级和禁区；
- 必须保留的内容；
- 可删减内容；
- 参考资料；
- Provider 偏好，但不嵌入 Provider Prompt。

### 9.4 Revision

Revision 是 Project 的不可变快照。所有 Scene、Shot、Bible 和 Prompt Artifact 必须关联 Revision。更新采用 optimistic concurrency：调用者提交 `expectedRevision`，不匹配时返回冲突。

### 9.5 SceneSpec

```ts
interface SceneSpec {
  id: string;
  order: number;
  slugline: string;
  summary: string;
  purpose: string;
  locationId?: string;
  timeOfDay?: string;
  characters: string[];
  props: string[];
  emotionalBeat: string;
  estimatedDurationSec: number;
  continuityIn: ContinuityState;
  continuityOut: ContinuityState;
}
```

### 9.6 ShotSpec

每个镜头必须具备稳定 ID 和以下信息：

- 所属 Scene 与顺序；
- 叙事目的、Story Beat；
- 时长；
- Shot Size；
- Angle；
- Lens；
- Composition；
- Camera Movement；
- Blocking 和动作；
- Location、Time、Weather、Atmosphere；
- Lighting、Palette、Texture；
- Characters、Wardrobe、Props、Reference IDs；
- Dialogue、Voice-over、SFX、Music；
- Start Frame State、End Frame State；
- Continuity Dependencies；
- Negative Constraints；
- Edit Intent、Transition；
- QC Criteria。

### 9.7 PromptSpec

```ts
interface PromptSpec {
  shotId: string;
  schemaVersion: "1";
  subject: string;
  action: string;
  environment: string;
  cinematography: string;
  lighting: string;
  style: string;
  continuity: string[];
  negative: string[];
  audio?: string;
  durationSec: number;
  aspectRatio: "16:9" | "9:16" | "1:1" | "4:3";
  seedHint?: string;
}
```

### 9.8 WorkflowRun / WorkflowStep

WorkflowRun 保存定义版本、状态、当前步骤、输入、输出、错误和时间戳。WorkflowStep 保存单阶段状态、尝试次数、Hermes Run ID、结构化结果、错误和日志摘要。

### 9.9 Artifact

Artifact 必须包含：

- ID；
- Project / Revision / Run / Step 归属；
- kind；
- mediaType；
- 相对路径或 URI；
- byte size；
- sha256；
- schemaVersion；
- producer；
- source artifact IDs；
- createdAt。

### 9.10 Approval

Approval 包含风险类型、请求摘要、预估外部成本、影响对象、状态、决策者、决策说明和 Revision。外部成本与发布 Approval 不得由发起 Workflow 的 Agent 自批。

---

## 10. 工作流定义

### 10.1 Preproduction V1

```text
intake
  → story_analysis
  → story_bible
  → scene_breakdown
  → shot_planning
  → continuity_review
  → prompt_compilation
  → storyboard_document
  → preproduction_approval
  → completed
```

#### intake

代码执行：校验输入、标准化 Brief、计算 checksum、创建 Project/Revision/Run。

#### story_analysis

Agent 输出：主题、类型、受众假设、叙事结构、角色目标、冲突、情绪曲线、关键信息、压缩策略、风险。

#### story_bible

Agent 输出：角色、地点、道具、世界规则、视觉规则、色板、材质、光线、禁用元素和连续性锚点。

#### scene_breakdown

Agent 输出 SceneSpec 列表。总时长应在目标时长容差内；每个 Scene 有清晰目的和进出连续性状态。

#### shot_planning

Agent 输出 ShotSpec 列表。每个 Scene 至少一个 Shot；ID 稳定；镜头总时长满足容差；不得只写抽象情绪而缺少可拍摄动作。

#### continuity_review

Agent 根据 Bible、Scene 和 Shot 输出问题清单和修正建议。系统规则同时执行 ID、引用、时长、首尾状态、角色/道具存在性等确定性检查。

#### prompt_compilation

代码执行：从已校验 ShotSpec 生成 Canonical PromptSpec，再由 Provider Compiler 输出 Provider Prompt。禁止 Agent 在该阶段随意丢失约束。

#### storyboard_document

代码执行：Phase 1 生成 Markdown Storyboard，包含 Scene 摘要、逐镜头表格、Prompt、连续性、对白/音频和 QC 条件。HTML/PDF 作为后续格式适配器。

#### preproduction_approval

人工审阅。批准后项目进入 `ready_for_render`；拒绝时记录原因并将项目恢复为 `draft`，由用户基于历史 Artifact 创建新 Revision。

### 10.2 Render V1（接口先行）

```text
render_plan
  → cost_approval
  → submit_shots
  → poll_provider_jobs
  → media_qc
  → variant_selection
  → assembly_manifest
  → render_approval
```

MVP 只实现 Render Manifest、Provider Port 和 Approval 契约，不默认执行付费生成。

### 10.3 Delivery V1（后续）

```text
assembly
  → subtitle/audio package
  → delivery_qc
  → distribution_plan
  → publish_approval
  → platform adapters
```

---

## 11. Agent 设计

### 11.1 Agent 角色不是公共 API

内部可使用 Script Analyst、Creative Director、Storyboard Artist、Cinematographer、Continuity Supervisor 等角色 Prompt，但外部命令只暴露业务结果，例如 `video.shots.generate`，避免将角色数量和模型策略固化为 API。

### 11.2 上下文最小化

每个阶段只接收必要内容：

- Story Analysis：Source + Brief；
- Bible：Source + Brief + Analysis；
- Scene Breakdown：Source + Brief + Analysis + Bible；
- Shot Planning：Brief + Bible + Scenes + Source（MVP 限制 Source 不超过 120,000 字符）；
- Continuity：Bible + Scenes + Shots；
- 不向每个步骤重复全部聊天历史。

### 11.3 结构化输出协议

Agent 必须输出单个 JSON 对象：

```json
{
  "schemaVersion": "1",
  "stage": "shot_planning",
  "data": {},
  "warnings": []
}
```

系统先解析，再执行阶段校验。解析或校验失败时：

1. 保留原始输出 Artifact；
2. 记录可定位错误；
3. 同一步最多自动修复重试 2 次；
4. 超过次数后进入 `failed`，不继续污染下游。

### 11.4 Agent 权限

Preproduction Agent 使用 `read_only` 或等价权限，不需要 Shell、OAuth 或平台写权限。Render Agent 只能通过 Provider Port 请求，不能直接读取密钥。

---

## 12. 功能需求

### FR-001 创建项目

用户必须提交标题、Source 和 Brief。系统返回 Project ID、Revision 1 和状态；Dashboard 可在提交前提供标题建议，但 API 不隐式改写用户输入。

### FR-002 项目列表与详情

Phase 1 支持数量限制和最近更新时间排序；项目详情返回同一 Revision、同一最近 Run 的一致快照，避免跨 Run 拼接 Artifact。搜索、状态筛选和最近 Run 摘要进入 Dashboard Phase 2。

### FR-003 修订

用户修改 Brief、Source 或结构化内容时必须提交 `expectedRevision`。成功后创建新 Revision；旧 Revision 可读取、不可覆盖。

### FR-004 启动 Preproduction

用户可选择 Agent、Provider、Model 和最大尝试次数；Reasoning Effort 由阶段策略决定。重复请求携带相同 idempotency key 时返回同一 Run。

### FR-005 持久化执行

Server 重启后，`queued/running` Run 能被 scheduler 重新发现。单个步骤通过状态比较更新，避免重复提交同一 Hermes Run。

### FR-006 状态与事件

用户可读取 Run、Step、进度、错误和事件。CLI 支持 JSON；Dashboard 后续通过 SSE 获取更新。

### FR-007 失败与重试

支持按 Run 或 Step 重试。重试创建新 attempt，保留旧输出。非 retryable 校验错误必须先修复输入或手工确认。

### FR-008 审批

Preproduction 完成后进入 `waiting_approval`。批准更新项目状态；拒绝记录原因。付费 Render 和 Publish 需要独立 Approval。

### FR-009 Artifact 导出

至少导出：

- `source.txt`；
- `production-brief.json`；
- `story-analysis.json`；
- `story-bible.json`；
- `scenes.json` / `.csv`；
- `shots.json` / `.csv`；
- `continuity-report.json`；
- `canonical-prompts.jsonl`；
- `provider-prompts.jsonl`；
- `storyboard.md`；
- `render-manifest.json`；
- `package-manifest.json`。

导出只信任 `package-manifest.json` 中的 Artifact ID，并额外包含清单自身；原始/无效 Agent 响应不进入交付包。服务端返回 `growth://` URI 和 Growth Root 相对路径，不返回绝对路径。

### FR-010 Prompt 编译

同一 Canonical PromptSpec 在同一 Compiler 版本下必须产生稳定输出。Compiler 输出记录版本和 Provider capability 假设。

### FR-011 Storyboard

Storyboard 必须按 Scene/Shot 顺序呈现，展示镜头语言、可见动作、画面连续性、对白/音频、Prompt 和 QC；缺失关键字段时工作流失败，不生成伪完整文档。Phase 1 输出 Markdown，HTML/PDF 属于后续格式适配。

### FR-012 CLI

提供 `growthctl video ...` 与 `growthctl workflow ...`。所有机器输出遵循统一 envelope；stdout 不混入日志。

### FR-013 Agent Tool 可发现性

Command Registry 能描述命令名称、版本、风险、同步/异步、Input/Output Schema 和所需 capability。MCP 可由相同 Registry 后续生成。

### FR-014 Provider Port

Provider 能力至少描述：支持画幅、时长范围、分辨率、参考图、首尾帧、音频、异步任务、取消和费用估算。系统根据 capability 校验 Render Manifest。

### FR-015 局部失效

Phase 2 必须实现依赖图：修改某一 Shot 时，只使该 Shot 的 Prompt、Storyboard 条目和后续 Render 失效；修改 Bible 中角色外观时，使引用该角色的 Shot 失效。Phase 1 通过不可变 Revision 保证正确性，尚不做字段级增量重算。

---

## 13. CLI 契约

### 13.1 示例

```bash
growthctl video project create --input @project.json
growthctl video project list
growthctl video project show vprj_123
growthctl video workflow start vprj_123 --idempotency-key demo-1
growthctl workflow status vrun_123
growthctl workflow events vrun_123 --follow
growthctl workflow approve vrun_123 --decision approve --expected-revision 1
growthctl video artifacts list vprj_123
growthctl video package export vprj_123 --revision 1
growthctl artifact get vart_123 --out ./storyboard.md
```

### 13.2 成功 Envelope

```json
{
  "ok": true,
  "schemaVersion": "1",
  "command": "video.workflow.start",
  "requestId": "req_...",
  "data": {},
  "artifacts": [],
  "warnings": []
}
```

### 13.3 错误 Envelope

```json
{
  "ok": false,
  "schemaVersion": "1",
  "command": "video.workflow.start",
  "requestId": "req_...",
  "error": {
    "code": "revision_conflict",
    "message": "Expected revision 2 but current revision is 3.",
    "retryable": false,
    "details": {}
  }
}
```

### 13.4 退出码

- 0：成功；
- 2：参数/输入 Schema 错误；
- 3：资源不存在；
- 4：Revision/幂等冲突；
- 5：审批所需；
- 6：外部 Provider 错误；
- 7：Workflow 已终止或请求了非法状态转换；
- 10：内部错误。

---

## 14. API 契约

基础路径：`/api/video`

```text
POST   /projects
GET    /projects
GET    /projects/:projectId
PATCH  /projects/:projectId
POST   /projects/:projectId/preproduction-runs
GET    /projects/:projectId/artifacts
GET    /artifacts/:artifactId/raw
GET    /runs/:runId
GET    /runs/:runId/events
POST   /runs/:runId/retry
POST   /runs/:runId/cancel
POST   /runs/:runId/approval
POST   /runs/:runId/tick
POST   /projects/:projectId/package-exports
GET    /commands
GET    /health
```

所有写接口支持 `X-Request-ID`；创建 Run 支持 `Idempotency-Key`；Revision 更新在 body 中提交 `expectedRevision`。

---

## 15. Dashboard UX 需求

### 15.1 Project List

显示标题、状态、画幅、目标时长、当前 Revision、最近 Workflow 状态和更新时间。支持搜索与状态筛选。

### 15.2 Project Overview

顶部为紧凑工具栏：Run Preproduction、Export、Create Revision。正文展示 Brief 摘要、当前阶段、阻塞问题和 Artifact 完成度。

### 15.3 Scene / Shot Editor

- 左侧 Scene 列表；
- 中间 Shot 表格或卡片；
- 右侧 Inspector 编辑 Camera、Blocking、Continuity、Prompt；
- 修改显示 dirty/invalidated 状态；
- 支持按 Scene、角色、状态过滤；
- 不采用自由画布作为 MVP 主编辑方式。

### 15.4 Storyboard

每个 Shot 显示占位图/未来生成图、Shot ID、时长、镜头语言、动作、对白、Prompt 和连续性。支持打印/导出。

### 15.5 Run Drawer

展示 Step 时间线、模型、尝试次数、错误、输出 Artifact 和审批。错误必须可定位到 Stage/Scene/Shot/Field。

---

## 16. 非功能需求

### NFR-001 可靠性

- SQLite 使用 WAL、foreign keys 和 busy timeout；
- 关键 Run/Step/Approval 决策使用 SQLite 事务；单状态更新使用 expected-state compare-and-set；
- Scheduler 重启可恢复；
- 外部 Run ID 写入后才能将 Step 标记 running；
- 幂等键唯一；
- Artifact 写入采用临时文件、fsync 与 atomic no-replace publish，禁止覆盖已存在文件。

### NFR-002 性能

- 项目列表 P95 < 200ms（本地，1000 项以内）；
- 项目详情 P95 < 300ms，不读取大型 Artifact 正文；
- Workflow status P95 < 200ms；
- Storyboard 生成 100 个 Shot < 2s，不含 LLM；
- Dashboard 初始状态端点不可被 Hermes 慢调用阻塞。

### NFR-003 可观测性

记录 requestId、projectId、revision、runId、stepId、Hermes runId、duration、attempt、model/provider、token usage（可用时）和错误码。日志必须脱敏。

### NFR-004 安全

- 默认绑定 `127.0.0.1`；只有操作员显式设置 `GROWTH_HACKER_HOST` 才允许改变监听地址，远程部署必须另行配置 HTTPS、认证与访问控制；
- 路径必须经过 root containment 校验；
- Artifact raw endpoint 设置 `nosniff` 和正确 Content-Type；
- Phase 1 不主动下载远程 URL；未来启用 Reference URL 抓取时，必须阻止 localhost、私网、link-local、重定向绕过和非 HTTPS；
- Agent 不获得平台凭据；
- Source 和 Prompt 不作为 Shell 参数执行。

### NFR-005 可维护性

- 领域包不导入 Hono、React、Bun SQLite 或 Hermes；
- Route 只做协议映射；
- Repository 只做持久化；
- Service/Use Case 负责事务边界和应用流程；
- Provider Compiler 使用版本化注册表；
- 每个 Schema 有解析器、测试和示例 fixture。

### NFR-006 兼容性

- 保留现有 YouTube one-shot route 一个迁移周期；
- 新功能不改变现有 XHS、Chat、Cron 和 Workspace 行为；
- 旧路由标记 deprecated，最终调用新的 Video Application Service。

---

## 17. 风险与防护

### 17.1 LLM 输出不符合 Schema

防护：严格 JSON、阶段解析器、自动修复重试、原始输出留档、失败不下传。

### 17.2 上下文过长

防护：阶段化 Artifact、只传必要实体、字段长度限制；Phase 1 对 Source 设置 120,000 字符硬上限而不静默截断，按 Scene 分批 Shot Planning 在 Phase 2 实现。

### 17.3 连续性仍不稳定

防护：Bible 锚点、Reference ID、首尾帧状态、确定性引用检查、独立 Continuity Agent、渲染前人工批准。

### 17.4 成本失控

防护：Render Plan 先估算；外部成本 Approval；镜头上限；并发上限；失败重试预算；默认 dry-run。

### 17.5 Workflow 重复执行

防护：幂等键、Step compare-and-set、Provider request key、外部 Run ID 持久化、重启恢复测试。

### 17.6 巨型 Agent Prompt

防护：专业阶段、小输入、大结构输出；Prompt 模板版本化；Compiler 代码化。

---

## 18. 指标

### 产品指标

- 从创建项目到可审阅 Storyboard 的完成率；
- 首次生成后无需整体重跑的项目比例；
- 平均每项目局部修订次数；
- 被用户接受的 Shot 比例；
- Preproduction Approval 通过率；
- Artifact 导出使用率。

### 质量指标

- Agent 输出一次通过 Schema 校验比例；
- Continuity error / 100 shots；
- Shot 总时长偏差；
- 无叙事目的或无可见动作的 Shot 比例；
- Prompt 必填约束保留率。

### 工程指标

- 重启恢复成功率；
- 重复 Provider 提交率；
- Workflow terminal state 比例；
- P95 API latency；
- 每阶段失败和重试分布；
- Artifact hash/manifest 验证失败率。

---

## 19. 验收标准

### AC-001 故事到生产包

给定至少 500 字故事和完整 Brief，启动 Preproduction 后，系统最终生成 Analysis、Bible、Scenes、Shots、Continuity、Prompts 和 Storyboard Artifact，所有实体引用合法，Run 进入 `waiting_approval`。

### AC-002 重启恢复

当任一 Agent Step 正在运行时重启 Server，启动后 Scheduler 能读取 Step 的 Hermes Run ID 并继续轮询，不创建重复 Run。

### AC-003 无效输出隔离

当 Hermes 返回无法解析或不满足 Schema 的内容时，系统保存原始输出和无效输出 Artifact，并在尝试预算内带着校验错误发起修复重试；只有校验通过才启动下游 Step，耗尽尝试次数后 Run 才进入 `failed`。

### AC-004 Revision 冲突

两个调用者同时编辑 Revision 3，先提交者创建 Revision 4，后提交者使用 expectedRevision=3 时收到 `revision_conflict`，Revision 4 不被覆盖。

### AC-005 确定性 Prompt

同一 ShotSpec 和同一 Compiler 版本重复编译，结果字节一致。

### AC-006 审批门

Preproduction 完成前项目不能进入 `ready_for_render`；批准后状态更新。Agent 无法调用外部成本审批的自批准路径。

### AC-007 CLI 机器输出

所有普通命令的 stdout 只有一个合法 JSON envelope，`workflow events --follow` 使用 JSONL；帮助和诊断只进入 stderr，错误退出码符合契约。

### AC-008 兼容现有能力

现有 Chat、XHS、YouTube、Cron、Board 和 Workspace 测试继续通过。

### AC-009 模糊提交保护

若进程在 Provider 已可能接收请求、但外部 Run ID 尚未持久化的窗口退出，恢复后 Step 以 `ambiguous_external_submission` 失败并等待人工重试，不自动重复提交。

### AC-010 安全导出

Package Export 只导出同一 Preproduction Run 的 Artifact，API 仅返回 `growth://` URI 和相对于 Growth Root 的路径，不泄漏服务端绝对路径。

---

## 20. 发布计划

### Phase 0：架构地基

- Video Domain 与 Schema；
- SQLite Repository；
- Workflow Run/Step/Event/Artifact/Approval；
- Server route module；
- `growthctl`；
- Skill 与文档。

### Phase 1：Preproduction MVP

- Hermes 多阶段执行；
- 自动校验与重试；
- Canonical/Provider Prompt Compiler；
- Storyboard Markdown；
- 审批；
- Artifact 导出。

### Phase 2：Dashboard Video Studio

- Project、Scene、Shot、Storyboard、Run UI；
- 局部修订和失效图；
- SSE 状态更新。

### Phase 3：Render Workflow

- Hermes Video Provider Adapter；
- 成本估算与审批；
- Shot 级提交/轮询/取消；
- 变体与 QC；
- 参考图和首尾帧。

### Phase 4：Assembly 与 Distribution

- FFmpeg/剪辑清单；
- 配音、字幕、音乐；
- Delivery Package；
- 独立 YouTube/XHS 发布审批工作流。

---

## 21. 当前实现覆盖（本交付）

已落地：

- 独立 Video Domain、Schema、Validator、Prompt Compiler 与 Storyboard Renderer；
- SQLite Project/Revision/Run/Step/Event/Artifact/Approval/Idempotency 持久化；
- Hermes 五阶段 Agent 编排、严格结构化解析、自动修复重试和模糊提交保护；
- `prompt_compilation`、`storyboard_document` 和生产包确定性阶段；
- 人工 Preproduction Approval、SSE/JSONL 事件、Hono API、`growthctl`；
- 受 Manifest 限制的安全导出、单元测试和重启恢复集成测试。

未落地：

- React Video Studio；
- Shot/Bible 字段级局部失效与增量重算；
- 付费视频 Provider 的实际提交、媒体 QC、变体选择和 Assembly；
- YouTube/XHS 新发布流程及旧 one-shot 路由迁移。

---

## 22. MVP Definition of Done

MVP 完成必须同时满足：

1. 领域不再依赖 YouTube profile；
2. 项目和 Workflow 状态持久化；
3. 故事/剧本可生成完整结构化前期制作包；
4. 任何 Agent 输出必须先校验；
5. Prompt 编译和 Storyboard 为确定性代码；
6. CLI 与 API 调用同一 Use Case；
7. 具备 Revision、幂等、错误码和审批；
8. 重启后可恢复；
9. 现有功能不回归；
10. 文档、测试、迁移说明与弃用路径齐全。
