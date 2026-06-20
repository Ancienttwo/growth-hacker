# Video Agent 示例

```bash
bun run growthctl -- video project create --input @examples/video-agent/project.json
bun run growthctl -- video project list
bun run growthctl -- video workflow start <projectId> --idempotency-key rain-station-v1
bun run growthctl -- workflow events <runId> --follow
bun run growthctl -- workflow approve <runId> --decision approve --expected-revision 1
bun run growthctl -- video package export <projectId> --revision 1
```

CLI 的普通命令始终输出 JSON；`workflow events --follow` 输出 JSONL，并在工作流进入 `waiting_approval` 或终态时结束。
