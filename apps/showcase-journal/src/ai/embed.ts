import { getLocalAi } from './runtime.ts';

export async function embed(text: string): Promise<Float32Array> {
  const ai = getLocalAi();
  return ai.embed(text);
}
