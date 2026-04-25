/**
 * Map a hardware-detection Backend value to the device-name string that
 * `@shippie/local-ai` (and underneath, transformers.js) expects.
 *
 * The detection layer distinguishes WebNN-NPU from WebNN-GPU because we want
 * to record which physical device ran an inference. transformers.js, on the
 * other hand, only knows `webnn` — it does not (yet) accept a deviceType
 * hint per-pipeline. Both NPU and GPU collapse to `webnn` here; the original
 * Backend value still rides back to the caller as the `source` field.
 */
import type { Backend } from '../backend.ts';
import type { LocalAiDevice } from '@shippie/local-ai';

export function backendToDevice(backend: Backend): LocalAiDevice {
  switch (backend) {
    case 'webnn-npu':
    case 'webnn-gpu':
      return 'webnn';
    case 'webgpu':
      return 'webgpu';
    case 'wasm-cpu':
      return 'cpu';
  }
}
