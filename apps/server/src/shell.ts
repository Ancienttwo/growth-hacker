import { spawn } from "node:child_process";

export interface CommandResult {
  command: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: string;
  signal?: NodeJS.Signals | null;
  timedOut?: boolean;
}

export interface RunOptions {
  cwd?: string;
  timeoutMs?: number;
  timeoutKillGraceMs?: number;
  env?: NodeJS.ProcessEnv;
  onLine?: (line: string) => void;
  redactOutput?: boolean;
}

export function runCommand(command: string, args: string[] = [], options: RunOptions = {}): Promise<CommandResult> {
  return new Promise((resolve) => {
    const all = [command, ...args];
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"]
    });

    const timer = options.timeoutMs
      ? setTimeout(() => {
          if (!settled) {
            timedOut = true;
            child.kill("SIGTERM");
            forceKillTimer = setTimeout(() => {
              if (!settled) child.kill("SIGKILL");
            }, options.timeoutKillGraceMs ?? 1000);
          }
        }, options.timeoutMs)
      : undefined;

    const append = (stream: "stdout" | "stderr", chunk: Buffer) => {
      const text = chunk.toString();
      if (stream === "stdout") stdout += text;
      else stderr += text;
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        options.onLine?.(`${stream}: ${redact(line)}`);
      }
    };

    child.stdout?.on("data", (chunk: Buffer) => append("stdout", chunk));
    child.stderr?.on("data", (chunk: Buffer) => append("stderr", chunk));

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      resolve({ command: all, exitCode: null, stdout, stderr, error: error.message, timedOut });
    });

    child.on("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      resolve({
        command: all,
        exitCode,
        signal,
        timedOut,
        stdout: options.redactOutput === false ? stdout : redact(stdout),
        stderr: options.redactOutput === false ? stderr : redact(stderr)
      });
    });
  });
}

export function redact(value: string): string {
  return value
    .replace(/("?(?:cookie|cookies|token|access_token|refresh_token|xsec_token)"?\s*[:=]\s*)("[^"]+"|[^\s,}]+)/gi, "$1[REDACTED]")
    .replace(/(Cookie:\s*)[^\n\r]+/gi, "$1[REDACTED]")
    .replace(/(Authorization:\s*Bearer\s+)[^\s]+/gi, "$1[REDACTED]");
}

export async function commandExists(command: string): Promise<string | undefined> {
  const result = await runCommand("sh", ["-lc", `command -v ${command}`], { timeoutMs: 5000 });
  if (result.exitCode !== 0) return undefined;
  return result.stdout.trim() || undefined;
}
