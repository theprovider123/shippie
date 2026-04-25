import { TOPIC_LABELS, type Topic } from '../db/schema.ts';
import { getLocalAi } from './runtime.ts';

export interface ClassifyResult {
  topic: Topic;
  confidence: number;
}

const CONFIDENCE_FLOOR = 0.15;

export async function classifyTopic(text: string): Promise<ClassifyResult> {
  if (!text.trim()) return { topic: 'unclassified', confidence: 0 };
  const ai = getLocalAi();
  const result = await ai.classify(text, { labels: [...TOPIC_LABELS] });
  if (!isTopic(result.label) || result.confidence < CONFIDENCE_FLOOR) {
    return { topic: 'unclassified', confidence: result.confidence };
  }
  return { topic: result.label, confidence: result.confidence };
}

export function isTopic(label: string): label is Topic {
  return (TOPIC_LABELS as readonly string[]).includes(label);
}
