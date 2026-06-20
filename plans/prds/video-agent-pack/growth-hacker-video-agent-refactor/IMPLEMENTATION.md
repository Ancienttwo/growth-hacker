# Video Agent V1 实现报告

日期：2026-06-19

## 已实现

本交付实现了一个可并入现有 Growth Hacker 单体的、平台无关的 Video Studio 前期制作纵向切片：

1. **领域与契约**：`VideoProject`、不可变 Revision、Story/Visual Bible、SceneSpec、ShotSpec、ContinuityReport、Canonical PromptSpec、ProviderPrompt、RenderManifest、Workflow、Artifact 和 Approval。
2. **专业视频 Agent 流程**：故事分析、设定集、场景拆分、镜头规划和连续性审查由 Hermes 分阶段执行；Prompt 编译、交叉引用校验、Storyboard/CSV/Manifest 生成由确定性 TypeScript 完成。
3. **持久化 Workflow Kernel**：SQLite WAL、Run/Step/Event/Approval、幂等键、唯一租约令牌与心跳、CAS 状态迁移、重启后轮询恢复、有限重试和人工审批。
4. **外部调用安全**：提交前持久化 `submitting`；若进程在 Provider ID 落库前退出，则以 `ambiguous_external_submission` 停止，不自动重复提交。
5. **Artifact Store**：原始输出、无效输出、校验后 JSON、Prompt JSONL、Render Manifest、Project Snapshot、Storyboard、CSV 和 Package Manifest；原子 no-replace 写入、崩溃孤儿文件校验接管、SHA-256、来源链、确定性重放和路径穿越防护。
6. **API**：独立 `/api/video` Hono 模块，含 Project、Revision、Run、Event/SSE、Retry、Cancel、Approval、Artifact 和 Package Export。
7. **CLI**：`growthctl` 仅调用 localhost API，普通命令输出 JSON，事件流输出 JSONL，不直接打开数据库或读取凭据。
8. **Provider 边界**：定义 `VideoRenderProviderPort`、能力、估算、提交、查询和取消契约；V1 不自动执行付费渲染。
9. **Skill 与文档**：Video Production Agent Skill、详细 PRD、架构说明、执行计划和示例输入。
10. **集成脚本**：幂等地复制新模块、挂载路由、登记 capability、增加工作区依赖和 CLI 脚本，并补上 Scheduler/SQLite 的进程关闭钩子。

## 关键目录

```text
packages/video-agent/               纯领域、Schema、校验、Prompt Compiler、文档渲染
apps/server/src/video/              SQLite、Artifact、Hermes Adapter、Coordinator、Hono Routes
apps/growthctl/                     无头 CLI Adapter
skills/creative/video-production-agent-skill/
docs/product/video-agent-prd.md
docs/architecture/video-agent-refactor-v1.md
docs/examples/video-agent/
scripts/apply.sh
```

## 工作流

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

Agent 只承担需要创意推理的前五个阶段。状态迁移、重试、引用校验、Prompt 编译、Artifact 登记和审批均由应用代码控制。

## 验证记录

已在本交付环境执行：

- 使用仓库声明的依赖版本 `hono@4.10.8`、`@types/bun@1.3.5`、`typescript@5.9.3` 完成严格 TypeScript 契约检查：纯领域包、Server Video 模块、集成测试和 `growthctl` 全部通过；
- 在隔离安装的 Bun `1.3.14` 上运行正式测试文件：**12 pass / 0 fail / 51 assertions**；
  - 8 个领域测试覆盖输入校验、Source checksum、Stage Envelope、跨引用、确定性 Prompt、Storyboard 和状态迁移；
  - 4 个 Workflow 集成测试覆盖同一外部 Run ID 的重启续跑、模糊提交保护、审批、安全导出、幂等键请求一致性、Revision CAS、崩溃后 Artifact 登记恢复，以及并发 Tick 只提交一次；
- 纯领域编译为 JavaScript 后的运行时 smoke test：通过，成功生成 Canonical Prompt、Provider Prompt、Render Manifest 和 Storyboard；
- SQLite migration 在 SQLite 引擎中实际执行：通过，共建立 8 张视频领域表、5 个显式索引，`user_version=1`；
- `apply.sh` 与 `verify-video-agent.sh` Bash 语法检查：通过；
- `apply.sh` 在与当前仓库入口契约一致的合成 checkout 上连续执行两次：通过，路由、生命周期钩子、Capability、测试文件和 package 修改均保持幂等。

系统镜像原本没有预装 Bun；上述测试使用临时、隔离安装的 Bun Runtime。由于当前环境没有完整 GitHub checkout，也没有可用的真实 Hermes Gateway，以下仓库级与在线集成验证尚未执行：

```bash
bun install
bash scripts/verify-video-agent.sh
bun run typecheck
bun test apps packages
# 使用真实 Hermes 跑一次完整 preproduction，并在 Agent Step 运行中重启 Server
```

合并前应在真实 checkout 中执行这些命令。当前测试已经验证本补丁自己的领域、持久化和恢复逻辑，但不能替代现有 Chat/XHS/YouTube 模块的全量回归，也不能替代真实 Hermes Provider 行为验证。

## 本次未实现

- React Video Studio 页面、Scene/Shot 可视化编辑器和 Storyboard UI；
- 付费视频 Provider 的真实提交、成本估算、变体选择和媒体 QC；
- FFmpeg Assembly、配音、字幕、音乐和发布工作流；
- 旧 YouTube one-shot 视频接口的删除。它应在 Dashboard 切换到 Video Studio 后先做兼容适配，再弃用。

这些内容已在 PRD 和架构文档中定义，不应重新写进 `server.ts` 或 `App.tsx` 的巨型内联逻辑。
