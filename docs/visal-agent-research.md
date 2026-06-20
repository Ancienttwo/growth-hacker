要，但**应抽的是“无头能力层”**，而不是把业务逻辑直接塞进 CLI。

当前工程本来就依赖 `hermes`、`xhs`、`yt-cli` 和 Python Skill 子进程；现有 `yt-cli` 的稳定 JSON 输出、OAuth 隔离、dry-run、频道绑定和确认门设计也证明 CLI 边界适合本地优先架构。与此同时，现有架构已经出现多套 CLI wrapper 重复实现 spawn、超时、JSON 解析和错误归一化的问题，所以不能继续为每项功能随意增加独立 CLI。([GitHub][1])

## 推荐结构

```text
                         ┌─ React / HTTP Adapter
                         ├─ Agent Tool / MCP Adapter
Command Registry ────────┼─ growthctl CLI Adapter
                         └─ Workflow Worker Adapter
              │
              ▼
      Application Use Cases
              │
              ▼
        Domain + Ports
              │
      SQLite / Artifact Store
      Hermes / Video Provider
      YouTube / XHS / FFmpeg
```

关键原则是：

> **同一个 Use Case，由 UI、API、CLI、Agent Tool 共同调用；CLI 只负责参数解析、Schema 校验、调用和输出。**

不要形成：

```text
HTTP 业务逻辑一套
CLI 业务逻辑一套
Agent Skill 再写一套
```

应形成：

```text
createVideoProject(input)
generateShotPlan(input)
compileVideoPrompts(input)
submitRender(input)
approveWorkflowStep(input)
```

然后由不同 adapter 暴露出去。

## 建议保留两类 CLI

### 1. 产品级 CLI：`growthctl`

这是 Agent、自动化脚本和运维人员调用的统一入口。

```bash
growthctl project create
growthctl video source import
growthctl workflow start
growthctl workflow status
growthctl workflow approve
growthctl video shots export
growthctl video prompts compile
growthctl video render submit
growthctl video package export
```

它不直接实现业务逻辑，默认调用本地 Growth Hacker Server。

```text
growthctl
  → localhost API / Command Bus
  → Application Use Case
  → SQLite Workflow
  → Worker
```

这样可确保：

* Web 和 CLI 看到同一个状态。
* 不会发生 CLI 与 Server 分别修改数据库的竞争。
* Workflow 重启后仍可恢复。
* Agent 调用都有统一审计记录。
* 权限、审批和成本控制只实现一次。

### 2. Provider CLI

Provider CLI 只用于有明确隔离价值的外部边界：

```text
yt-cli
xhs-cli
hermes CLI
ffmpeg / ffprobe
Python 视频或图像工具
浏览器自动化程序
```

现有 `yt-cli` 就属于这一类：它自己掌握 OAuth、安全门、频道校验和 Provider API 细节，服务端只消费稳定 JSON envelope。([GitHub][2])

但不要把 `scene-service`、`shot-service`、`prompt-service` 各自做成 CLI。它们应是 TypeScript application packages。

## 视频功能最适合暴露为 CLI 的部分

### 同步、确定性命令

这类命令很适合被 Agent 或代码直接调用：

```bash
growthctl video project create --input @project.json --json

growthctl video source import \
  --project prj_123 \
  --file screenplay.md \
  --json

growthctl video script validate \
  --project prj_123 \
  --json

growthctl video shots export \
  --project prj_123 \
  --format csv \
  --out shot-list.csv

growthctl video prompts compile \
  --project prj_123 \
  --provider hermes-video \
  --out prompts.jsonl

growthctl video continuity check \
  --project prj_123 \
  --json

growthctl video package export \
  --project prj_123 \
  --format directory \
  --out ./delivery
```

尤其适合 CLI 的能力包括：

* 剧本导入与格式规范化
* ShotSpec、SceneSpec、PromptSpec 校验
* 分镜列表导出
* Prompt 编译
* 连续性规则检查
* Artifact 校验、打包和导出
* Provider 能力查询
* 项目、版本、运行状态查询

### 长任务只提交，不在 CLI 进程中执行

分镜生成、剧本分析、视频生成等可能持续较长时间。CLI 不应成为 Workflow Runner，而应返回 `runId`：

```bash
growthctl workflow start \
  --definition video.preproduction.v1 \
  --project prj_123 \
  --input @requirements.json \
  --json
```

返回：

```json
{
  "ok": true,
  "schemaVersion": "1",
  "data": {
    "runId": "run_01JXYZ",
    "state": "queued"
  }
}
```

后续调用：

```bash
growthctl run status run_01JXYZ --json
growthctl run events run_01JXYZ --follow --format jsonl
growthctl run cancel run_01JXYZ --json
growthctl run retry run_01JXYZ --step continuity_review --json
```

即使 Agent、CLI 或 Dashboard 退出，Worker 仍可继续执行。

## 视频 Workflow 建议命令面

不要将每个 Agent 角色直接设计成 CLI 命令，例如：

```bash
# 不推荐
growthctl agent cinematographer ...
growthctl agent storyboard-artist ...
```

角色属于 Workflow 内部实现，不应该成为稳定公共 API。应暴露业务结果：

```bash
growthctl video brief generate
growthctl video bible generate
growthctl video scenes generate
growthctl video shots generate
growthctl video storyboard generate
growthctl video continuity check
growthctl video prompts compile
```

其中：

```text
video shots generate
  → Workflow Orchestrator
  → Script Analyst
  → Director
  → Cinematographer
  → Continuity Reviewer
  → ShotSpec[]
```

以后即使替换 Agent 数量、模型或 Prompt，CLI 契约也不需要变化。

## Agent 应该怎样调用

Agent 不应解析人类可读帮助文本，也不应依赖 stdout 中不稳定的自然语言。

建议每个命令都具备可发现的机器契约：

```bash
growthctl capabilities --json
growthctl tool describe video.shots.generate --json
growthctl tool call video.shots.generate --input @input.json --json
```

命令描述返回：

```json
{
  "name": "video.shots.generate",
  "version": "1",
  "risk": "local_write",
  "execution": "async",
  "inputSchema": {},
  "outputSchema": {},
  "requiredCapabilities": [
    "video.project.read",
    "video.shot.write"
  ]
}
```

这样同一份 Command Registry 还可以自动生成：

* CLI 命令
* Hono API route
* OpenAPI Schema
* Agent function tool
* MCP tool
* 测试 fixtures

## CLI 输出协议

建议统一替换各模块自行实现的 envelope。

成功：

```json
{
  "ok": true,
  "schemaVersion": "1",
  "command": "video.prompts.compile",
  "requestId": "req_01JXYZ",
  "data": {},
  "artifacts": [
    {
      "id": "art_123",
      "kind": "video-prompts",
      "uri": "growth://projects/prj_123/artifacts/prompts.jsonl",
      "sha256": "..."
    }
  ],
  "warnings": []
}
```

失败：

```json
{
  "ok": false,
  "schemaVersion": "1",
  "command": "video.prompts.compile",
  "requestId": "req_01JXYZ",
  "error": {
    "code": "shot_spec_invalid",
    "message": "Shot SHOT-018 has no end-frame state.",
    "retryable": false,
    "details": {
      "shotId": "SHOT-018",
      "field": "endFrame"
    }
  }
}
```

规则应固定为：

* `stdout`：只有最终 JSON 或 JSONL。
* `stderr`：日志和人类可读进度。
* `--json` 时禁止 ANSI、进度条和额外文本。
* 大型输入使用 `--input @file.json` 或 stdin。
* 大型输出写入 Artifact，只返回引用和 hash。
* 错误 code 稳定，message 可以调整。
* 所有写命令支持 `--idempotency-key`。
* 修改已有版本时支持 `--expected-revision`，避免 Agent 覆盖用户的新修改。

## Agent 权限边界

建议给每个命令定义风险等级：

```text
read
local_write
external_cost
external_publish
destructive
credential_admin
```

Agent 可默认执行：

```text
read
local_write
```

以下操作必须进入持久化 Approval：

```text
external_cost      视频批量生成、付费模型调用
external_publish   YouTube/XHS 正式发布
destructive        删除、覆盖、评论删除
credential_admin   OAuth、Token 撤销、账号绑定
```

例如：

```bash
growthctl video render plan \
  --project prj_123 \
  --dry-run \
  --json
```

先返回：

```json
{
  "estimatedShots": 46,
  "estimatedCredits": 312,
  "approvalRequired": true,
  "approvalId": "apr_123"
}
```

然后只能由操作员批准：

```bash
growthctl approval decide \
  --approval-id apr_123 \
  --decision approve \
  --expected-revision 7
```

Agent 不应该获得 OAuth start/revoke、公开发布、删除内容等能力。

## 哪些功能不应做成 CLI

以下内容应保留在应用层或服务进程：

* Workflow 状态机本身
* Worker、调度器和重试循环
* SQLite migration 和事务所有权
* Scene、Shot 的领域规则
* Agent 编排和上下文压缩策略
* UI 查询缓存和视图状态
* 原始数据库 CRUD
* 任意文件系统读取
* 任意 shell 执行
* 凭据读取或输出

内部 TypeScript 代码也不应为了复用而启动 `growthctl` 子进程：

```ts
// 不推荐
await runCommand("growthctl", ["video", "shots", "generate"]);

// 推荐
await generateShotPlan.execute(input, context);
```

使用关系应是：

```text
内部 TypeScript 代码 → 直接调用 Application Use Case
Web                     → HTTP Adapter
Agent                   → Tool/MCP 或 growthctl
Shell/Python/第三方代码  → growthctl 或 HTTP API
```

## 建议的目录调整

```text
apps/
  server/
    src/http/
    src/bootstrap/
  web/
  growthctl/
    src/cli.ts
    src/adapters/
  worker/
    src/main.ts

packages/
  contracts/
    src/commands/
    src/events/
    src/schemas/

  application/
    src/video/
    src/workflows/
    src/projects/
    src/artifacts/

  domain-video/
    src/project.ts
    src/scene.ts
    src/shot.ts
    src/prompt-spec.ts
    src/continuity.ts

  command-registry/
    src/command.ts
    src/registry.ts
    src/risk-policy.ts

  cli-runtime/
    src/envelope.ts
    src/exit-codes.ts
    src/jsonl.ts
    src/process-runner.ts

  workflow/
    src/engine.ts
    src/state-machine.ts
    src/retry-policy.ts

  adapters/
    hermes/
    sqlite/
    filesystem/
    video-provider/
```

可以定义统一命令：

```ts
interface ApplicationCommand<I, O> {
  readonly name: string;
  readonly version: number;
  readonly risk:
    | "read"
    | "local_write"
    | "external_cost"
    | "external_publish"
    | "destructive"
    | "credential_admin";

  readonly execution: "sync" | "async";
  readonly inputSchema: JSONSchema;
  readonly outputSchema: JSONSchema;

  execute(context: CommandContext, input: I): Promise<O>;
}
```

## 最终建议

采用：

> **一个统一的 `growthctl` 产品 CLI + 少量有隔离价值的 Provider CLI + 一套共享 Command/Application Core。**

优先抽出的第一批能力应是：

1. `project create/import/show`
2. `video script validate`
3. `workflow start/status/events/cancel/retry`
4. `video shots export`
5. `video prompts compile`
6. `video continuity check`
7. `video render plan/submit/status`
8. `artifact list/inspect/export/verify`
9. `approval show/decide`
10. 统一 `CliRunner`、JSON envelope、Schema 和错误码

现有 `yt-cli` 可以保留，但应迁移到共享的 `cli-runtime` 和 `ProviderPort`；视频领域本身不要复制成另一个巨型 CLI，而应由 `growthctl` 薄封装 application commands。

[1]: https://raw.githubusercontent.com/Ancienttwo/growth-hacker/main/docs/spec.md "raw.githubusercontent.com"
[2]: https://github.com/Ancienttwo/growth-hacker/tree/main/packages/youtube-cli "growth-hacker/packages/youtube-cli at main · Ancienttwo/growth-hacker · GitHub"
