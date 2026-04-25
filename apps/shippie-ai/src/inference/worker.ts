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
 *
 * The Worker is fully model-agnostic: it dispatches by `task` to the model
 * wrappers in `./models/*`. New tasks add a single case here.
 */
import type { InferenceMessage, InferenceResponse } from '../types.ts';
import { runClassify } from './models/classify.ts';
import { runEmbed } from './models/embed.ts';
import { runSentiment } from './models/sentiment.ts';
import { runModerate } from './models/moderate.ts';
import { runVision } from './models/vision.ts';

self.addEventListener('message', async (e: MessageEvent) => {
  const data = e.data as InferenceMessage | undefined;
  if (!data || typeof data.requestId !== 'string') return;

  try {
    const result = await runTask(data);
    const reply: InferenceResponse = { requestId: data.requestId, result };
    (self as unknown as Worker).postMessage(reply);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const reply: InferenceResponse = { requestId: data.requestId, error: message };
    (self as unknown as Worker).postMessage(reply);
  }
});

async function runTask(msg: InferenceMessage): Promise<unknown> {
  switch (msg.task) {
    case 'classify':
      return runClassify(msg.payload as Parameters<typeof runClassify>[0]);
    case 'embed':
      return runEmbed(msg.payload as Parameters<typeof runEmbed>[0]);
    case 'sentiment':
      return runSentiment(msg.payload as Parameters<typeof runSentiment>[0]);
    case 'moderate':
      return runModerate(msg.payload as Parameters<typeof runModerate>[0]);
    case 'vision':
      return runVision(msg.payload as Parameters<typeof runVision>[0]);
    default:
      throw new Error(`unknown task: ${(msg as { task: string }).task}`);
  }
}
