import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { HermesLlmSelection, HermesModelOptions, HermesModelOption, HermesProviderOption } from "@growth-hacker/core";

import type { AppConfig } from "./config";
import { commandExists, runCommand } from "./shell";

interface RawHermesInventory {
  provider?: unknown;
  model?: unknown;
  providers?: Array<{
    slug?: unknown;
    name?: unknown;
    is_current?: unknown;
    source?: unknown;
    total_models?: unknown;
    models?: unknown;
  }>;
}

const MAX_HERMES_MODELS_PER_PROVIDER = 80;

export async function listHermesModelOptions(config: AppConfig): Promise<HermesModelOptions> {
  const inventory = await readHermesInventory(config);
  const providers = normalizeProviderOptions(inventory);
  const models = providers.flatMap((provider) => provider.models);
  const current = normalizeHermesLlmSelection({
    provider: stringValue(inventory.provider),
    model: stringValue(inventory.model)
  });
  return { providers, models, current };
}

export function normalizeHermesLlmSelection(value: unknown): HermesLlmSelection | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const provider = stringValue(record.provider);
  const model = stringValue(record.model);
  if (!provider || !model) return undefined;
  if (!isSafeProvider(provider) || !isSafeModel(model)) throw new Error("invalid_llm_selection");
  return { provider, model };
}

export async function resolveHermesLlmSelection(config: AppConfig, value: unknown): Promise<HermesLlmSelection | undefined> {
  const selection = normalizeHermesLlmSelection(value);
  if (!selection) return undefined;
  const options = await listHermesModelOptions(config);
  const available = options.models.some((model) => model.provider === selection.provider && model.id === selection.model);
  if (!available) throw new Error(`llm_selection_not_available:${selection.provider}/${selection.model}`);
  return selection;
}

export function hermesLlmSelectionValue(selection: HermesLlmSelection): string {
  return `${selection.provider}::${selection.model}`;
}

export async function runHermesProviderPrompt(
  config: AppConfig,
  selection: HermesLlmSelection,
  prompt: string
): Promise<string> {
  const hermes = await resolveHermesCli();
  const result = await runCommand(
    hermes,
    ["--provider", selection.provider, "--model", selection.model, "--toolsets", "hermes-cli", "--oneshot", prompt],
    {
      env: { HERMES_HOME: config.hermesHome },
      timeoutMs: 10 * 60 * 1000,
      redactOutput: false
    }
  );
  if (result.exitCode !== 0) {
    const message = (result.stderr || result.stdout || result.error || "hermes_llm_failed").trim();
    throw new Error(`hermes_llm_failed:${message.slice(0, 500)}`);
  }
  const output = result.stdout.trim();
  if (!output) throw new Error("hermes_llm_empty_output");
  return output;
}

async function readHermesInventory(config: AppConfig): Promise<RawHermesInventory> {
  const agentRoot = join(config.hermesHome, "hermes-agent");
  const python = existsSync(join(agentRoot, "venv", "bin", "python"))
    ? join(agentRoot, "venv", "bin", "python")
    : process.env.PYTHON || "python3";
  const script = [
    "import json",
    "from hermes_cli.inventory import build_models_payload, load_picker_context",
    `print(json.dumps(build_models_payload(load_picker_context(), max_models=${MAX_HERMES_MODELS_PER_PROVIDER}), ensure_ascii=False))`
  ].join("\n");
  const pythonPath = [agentRoot, process.env.PYTHONPATH].filter(Boolean).join(":");
  const result = await runCommand(python, ["-c", script], {
    env: {
      HERMES_HOME: config.hermesHome,
      PYTHONPATH: pythonPath
    },
    timeoutMs: 8000,
    redactOutput: false
  });
  if (result.exitCode !== 0) {
    const message = (result.stderr || result.stdout || result.error || "hermes_inventory_failed").trim();
    throw new Error(`hermes_inventory_failed:${message.slice(0, 500)}`);
  }
  return JSON.parse(result.stdout) as RawHermesInventory;
}

async function resolveHermesCli(): Promise<string> {
  const fromPath = await commandExists("hermes");
  if (fromPath) return fromPath;
  const local = join(homedir(), ".local", "bin", "hermes");
  if (existsSync(local)) return local;
  throw new Error("hermes_cli_not_found");
}

function normalizeProviderOptions(inventory: RawHermesInventory): HermesProviderOption[] {
  const providers: HermesProviderOption[] = [];
  for (const provider of inventory.providers ?? []) {
    const id = stringValue(provider.slug);
    if (!id || !isSafeProvider(id)) continue;
    const models = Array.isArray(provider.models) ? provider.models.flatMap((model) => normalizeModelOption(id, model)) : [];
    if (!models.length) continue;
    providers.push({
      id,
      name: stringValue(provider.name) ?? id,
      current: provider.is_current === true,
      source: stringValue(provider.source),
      totalModels: numberValue(provider.total_models) ?? models.length,
      models
    });
  }
  return providers;
}

function normalizeModelOption(provider: string, value: unknown): HermesModelOption[] {
  const id = stringValue(value);
  if (!id || !isSafeModel(id)) return [];
  return [{ id, provider, label: `${provider} / ${id}`, value: hermesLlmSelectionValue({ provider, model: id }) }];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isSafeProvider(value: string): boolean {
  return /^[a-zA-Z0-9_.:-]{1,80}$/.test(value);
}

function isSafeModel(value: string): boolean {
  return /^[a-zA-Z0-9_.:/-]{1,160}$/.test(value);
}
