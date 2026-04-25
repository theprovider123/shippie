/**
 * Shared types between dashboard, inference router, and the dedicated Worker
 * inside the iframe. These types intentionally mirror the postMessage
 * protocol on the wire — what the host app ships in, what the AI app ships
 * back. Keep this surface tiny: every field is part of the public contract.
 *
 * Privacy invariant: none of these messages carry PII to a server. Inputs
 * arrive from a same-device sibling tab (cross-origin iframe), pass through
 * the Worker, and the result returns the same path. There is no network
 * egress beyond the initial model download from the Shippie CDN.
 */

export type InferenceTask = 'classify' | 'embed' | 'sentiment' | 'moderate' | 'vision';

export interface ClassifyRequest {
  task: 'classify';
  text: string;
  labels: string[];
}

export interface EmbedRequest {
  task: 'embed';
  text: string;
}

export interface SentimentRequest {
  task: 'sentiment';
  text: string;
}

export interface ModerateRequest {
  task: 'moderate';
  text: string;
}

export interface VisionRequest {
  task: 'vision';
  /** ImageBitmap or DataURL — encoded for postMessage. */
  imageDataUrl: string;
}

export type InferenceRequest =
  | ClassifyRequest
  | EmbedRequest
  | SentimentRequest
  | ModerateRequest
  | VisionRequest;

export interface InferenceMessage<R extends InferenceRequest = InferenceRequest> {
  requestId: string;
  task: R['task'];
  payload: Omit<R, 'task'>;
}

export interface InferenceResponse {
  requestId: string;
  result?: unknown;
  error?: string;
}

export interface ReadyMessage {
  type: 'ready';
  /** Iso list of supported tasks so the host can capability-check. */
  tasks: InferenceTask[];
}

export interface UsageEntry {
  /** Source app origin, e.g. https://recipe.shippie.app */
  origin: string;
  task: InferenceTask;
  /** Wall-clock ms when the inference completed. */
  ts: number;
  /** Inference duration in ms (model run only, not iframe round-trip). */
  durationMs: number;
}

export interface InstalledModelInfo {
  task: InferenceTask;
  /** Approximate quantized size in bytes — surfaced on the dashboard. */
  approxBytes: number;
  /** True if the model files are present in Cache Storage. */
  installed: boolean;
}
