import type { JobSnapshot } from "@growth-hacker/core";

import { runCommand } from "./shell";

type Listener = (job: JobSnapshot) => void;

interface JobStartOptions {
  cwd?: string;
  timeoutMs?: number;
  onFinish?: (job: JobSnapshot) => void;
}

export class JobStore {
  private jobs = new Map<string, JobSnapshot>();
  private listeners = new Map<string, Set<Listener>>();

  list(): JobSnapshot[] {
    return [...this.jobs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  get(id: string): JobSnapshot | undefined {
    return this.jobs.get(id);
  }

  subscribe(id: string, listener: Listener): () => void {
    const listeners = this.listeners.get(id) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(id, listeners);
    const current = this.jobs.get(id);
    if (current) listener(current);
    return () => listeners.delete(listener);
  }

  start(type: string, command: string, args: string[], cwdOrOptions?: string | JobStartOptions): JobSnapshot {
    const options = typeof cwdOrOptions === "string" ? { cwd: cwdOrOptions } : (cwdOrOptions ?? {});
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const job: JobSnapshot = {
      id,
      type,
      status: "running",
      command: [command, ...args],
      startedAt: new Date().toISOString(),
      logs: []
    };
    this.jobs.set(id, job);
    this.emit(id);

    void runCommand(command, args, {
      cwd: options.cwd,
      timeoutMs: options.timeoutMs ?? 10 * 60 * 1000,
      onLine: (line) => {
        job.logs.push(line);
        this.emit(id);
      }
    }).then((result) => {
      job.exitCode = result.exitCode;
      job.finishedAt = new Date().toISOString();
      job.status = result.exitCode === 0 ? "succeeded" : "failed";
      if (result.error) job.logs.push(`error: ${result.error}`);
      if (!job.logs.length && result.stdout.trim()) job.logs.push(...result.stdout.trim().split(/\r?\n/).map((line) => `stdout: ${line}`));
      if (!job.logs.length && result.stderr.trim()) job.logs.push(...result.stderr.trim().split(/\r?\n/).map((line) => `stderr: ${line}`));
      this.emit(id);
      options.onFinish?.(job);
    });

    return job;
  }

  private emit(id: string): void {
    const job = this.jobs.get(id);
    if (!job) return;
    for (const listener of this.listeners.get(id) ?? []) listener(job);
  }
}
