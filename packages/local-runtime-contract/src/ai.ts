export type LocalAiFeature = 'embeddings' | 'classification' | 'sentiment' | 'vision';

export interface LocalAiAvailability {
  embeddings: boolean;
  classification: boolean;
  sentiment: boolean;
  vision: boolean;
  gpu: boolean;
  wasm: boolean;
}

export interface ClassificationResult {
  label: string;
  confidence: number;
}

export interface SentimentResult {
  sentiment: 'positive' | 'neutral' | 'negative';
  score: number;
}

export interface ShippieLocalAi {
  available(): Promise<LocalAiAvailability>;
  classify(text: string, opts: { labels: string[] }): Promise<ClassificationResult>;
  sentiment(text: string): Promise<SentimentResult>;
  embed(text: string): Promise<Float32Array>;
  labelImage(image: Blob): Promise<string[]>;
}
