# Video Agent 示例

```bash
# 1. 创建项目
bun run growthctl -- video project create \
  --input @docs/examples/video-agent/project.example.json

# 2. 从上一步 JSON 中取得 project.id，然后启动工作流
bun run growthctl -- video workflow start <projectId> \
  --idempotency-key rain-night-v1

# 3. 查看状态或持续读取 JSONL 事件
bun run growthctl -- workflow status <runId>
bun run growthctl -- workflow events <runId> --follow

# 4. 审阅 Continuity、Storyboard、Shot CSV 和 Prompt 后批准
bun run growthctl -- workflow approve <runId> \
  --decision approve \
  --expected-revision 1 \
  --actor producer

# 5. 导出同一次 Run 的完整前期制作包
bun run growthctl -- video package export <projectId> --revision 1
```

工作流会生成 Story Analysis、Story/Visual Bible、Scene/Shot Spec、Continuity Report、Canonical Prompt、Hermes Provider Prompt、Render Manifest、Storyboard Markdown、CSV 和 Package Manifest。Render Manifest 只做计划，不会自动消耗视频生成额度。
