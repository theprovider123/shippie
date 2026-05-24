/**
 * Dedicated Worker that runs inference off the iframe main thread.
 *
 * Why a Worker?
 *   - iOS Safari is more aggressive about evicting hidden iframes than
 *     dedicated workers. Inference state survives memory pressure better in
 *     the Worker. (The plan's risk register, line 532.)
 *   - Heavy ONNX execution doesn't block the postMessage event loop, so we
 *     can still surface progress + ack errors quickly.
 *
 * Protocol — same as the cross-origin one, just one extra hop:
 *
 *   iframe   ── postMessage(InferenceMessage)   ──► worker
 *   iframe   ◄── postMessage(InferenceResponse) ── worker
 *   iframe   ◄── postMessage(ProgressMessage)   ── worker (streaming)
 *   iframe   ── postMessage(PreloadMessage)     ──► worker (fire-and-forget)
 *
 * The Worker is fully model-agnostic: it dispatches by `task` to the model
 * wrappers in `./models/*`. New tasks add a single case here.
 */
import type { InferenceMessage, InferenceResponse, InferenceTask } from '../types.ts';
import { runClassify } from './models/classify.ts';
import { runEmbed } from './models/embed.ts';
import { runSentiment } from './models/sentiment.ts';
import { runModerate } from './models/moderate.ts';
import { runVision } from './models/vision.ts';
import type { ModelProgressCallback } from './models/progress.ts';

/**
 * Progress event the Worker emits while a model is downloading. The
 * router fans these out to the embedder over postMessage so the
 * iframe-sdk can dispatch to the consumer's `onProgress` callback.
 */
export interface WorkerProgressMessage {
  type: 'ai.progress';
  requestId: string;
  task: InferenceTask;
  loaded: number;
  total: number;
  status: string;
}

/**
 * Preload hint posted from the router. Fire-and-forget — we never reply.
 */
export interface WorkerPreloadMessage {
  type: 'ai.preload';
  task: InferenceTask;
}

type IncomingMessage = InferenceMessage | WorkerPreloadMessage;

self.addEventListener('message', async (e: MessageEvent) => {
  const data = e.data as IncomingMessage | undefined;
  if (!data || typeof data !== 'object') return;

  if ((data as WorkerPreloadMessage).type === 'ai.preload') {
    void schedulePreload((data as WorkerPreloadMessage).task);
    return;
  }

  const msg = data as InferenceMessage;
  if (typeof msg.requestId !== 'string') return;

  // Forward transformers.js progress events to the router as ai.progress
  // wire messages. Same requestId as the inference, so the router can
  // correlate to the right consumer.
  const onProgress: ModelProgressCallback = (progress) => {
    const wire: WorkerProgressMessage = {
      type: 'ai.progress',
      requestId: msg.requestId,
      task: msg.task,
      loaded: typeof progress.loaded === 'number' ? progress.loaded : 0,
      total: typeof progress.total === 'number' ? progress.total : 0,
      status: typeof progress.status === 'string' ? progress.status : 'progress',
    };
    (self as unknown as Worker).postMessage(wire);
  };

  try {
    const result = await runTask(msg, onProgress);
    const reply: InferenceResponse = { requestId: msg.requestId, result };
    (self as unknown as Worker).postMessage(reply);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const reply: InferenceResponse = { requestId: msg.requestId, error: message };
    (self as unknown as Worker).postMessage(reply);
  }
});

async function runTask(msg: InferenceMessage, onProgress: ModelProgressCallback): Promise<unknown> {
  switch (msg.task) {
    case 'classify':
      return runClassify(msg.payload as Parameters<typeof runClassify>[0], onProgress);
    case 'embed':
      return runEmbed(msg.payload as Parameters<typeof runEmbed>[0], onProgress);
    case 'sentiment':
      return runSentiment(msg.payload as Parameters<typeof runSentiment>[0], onProgress);
    case 'moderate':
      return runModerate(msg.payload as Parameters<typeof runModerate>[0], onProgress);
    case 'vision':
      return runVision(msg.payload as Parameters<typeof runVision>[0], onProgress);
    default:
      throw new Error(`unknown task: ${(msg as { task: string }).task}`);
  }
}

/**
 * Best-effort warm-up — run a tiny noop inference so the model
 * downloads and caches without a foreground request waiting on it.
 * Errors are swallowed; the next real `ai.run` will surface them.
 */
async function schedulePreload(task: InferenceTask): Promise<void> {
  try {
    switch (task) {
      case 'classify':
        await runClassify({ text: '.', labels: ['warmup'] });
        return;
      case 'embed':
        await runEmbed({ text: '.' });
        return;
      case 'sentiment':
        await runSentiment({ text: '.' });
        return;
      case 'moderate':
        await runModerate({ text: '.' });
        return;
      case 'vision':
        // Vision isn't enabled yet — touch the adapter cache and bail.
        return;
    }
  } catch {
    /* preload is silent — real call surfaces the error */
  }
}
