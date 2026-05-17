import { loadConfig } from "./config";
import { runXhsAutoReplyBatch } from "./xhsAutoReplies";

const args = parseArgs(process.argv.slice(2));
const profile = args.profile;
const agentId = args.agentId || "growth-agent";
const llm = args.llmProvider && args.llmModel ? { provider: args.llmProvider, model: args.llmModel } : undefined;

if (!profile) {
  console.error("error: --profile is required");
  process.exit(2);
}

try {
  console.log(`auto-reply: starting profile=${profile} agent=${agentId}${llm ? ` llm=${llm.provider}/${llm.model}` : ""}`);
  const result = await runXhsAutoReplyBatch(loadConfig(), profile, agentId, { llm });
  console.log(JSON.stringify(result, null, 2));
  console.log(
    `auto-reply: done scanned=${result.scanned} replied=${result.replied} drafted=${result.drafted} skipped=${result.skipped} failed=${result.failed}`
  );
  process.exit(result.failed > 0 ? 1 : 0);
} catch (error) {
  console.error(`auto-reply: failed: ${error instanceof Error ? error.message : "unknown_error"}`);
  process.exit(1);
}

function parseArgs(values: string[]): { profile?: string; agentId?: string; llmProvider?: string; llmModel?: string } {
  const parsed: { profile?: string; agentId?: string; llmProvider?: string; llmModel?: string } = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--profile") parsed.profile = values[++index];
    else if (value === "--agent-id") parsed.agentId = values[++index];
    else if (value === "--llm-provider") parsed.llmProvider = values[++index];
    else if (value === "--llm-model") parsed.llmModel = values[++index];
  }
  return parsed;
}
