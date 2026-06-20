import type { ProviderPrompt, RenderManifestItem } from "./types";

export interface VideoProviderCapabilities {
  provider: string;
  model?: string;
  aspectRatios: string[];
  minDurationSec: number;
  maxDurationSec: number;
  resolutions: string[];
  supportsImageReference: boolean;
  supportsStartFrame: boolean;
  supportsEndFrame: boolean;
  supportsNegativePrompt: boolean;
  supportsSeed: boolean;
}

export interface VideoRenderEstimate {
  provider: string;
  model?: string;
  itemCount: number;
  estimatedCost?: {
    amount: number;
    currency: string;
    unit?: string;
  };
  estimatedDurationSec?: number;
  warnings: string[];
}

export interface SubmitVideoRenderInput {
  projectId: string;
  revision: number;
  runId: string;
  item: RenderManifestItem;
  providerPrompt: ProviderPrompt;
  idempotencyKey: string;
  referenceUris: string[];
}

export interface SubmittedVideoRender {
  provider: string;
  externalJobId: string;
  acceptedAt: number;
  status: "queued" | "running";
}

export interface VideoRenderJobStatus {
  provider: string;
  externalJobId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  progress?: number;
  outputUris: string[];
  previewUri?: string;
  errorCode?: string;
  errorMessage?: string;
  usage?: Record<string, number>;
  updatedAt?: number;
}

/**
 * Boundary for paid or otherwise externally mutating video generation.
 *
 * Implementations must not be called from preproduction. A render workflow must
 * first persist an external_cost approval and an idempotency key, then submit
 * one manifest item at a time through this port.
 */
export interface VideoRenderProviderPort {
  getCapabilities(): Promise<VideoProviderCapabilities>;
  estimate(items: RenderManifestItem[]): Promise<VideoRenderEstimate>;
  submit(input: SubmitVideoRenderInput): Promise<SubmittedVideoRender>;
  get(externalJobId: string): Promise<VideoRenderJobStatus>;
  cancel(externalJobId: string): Promise<void>;
}
