export type Phase = 'lobby' | 'question' | 'reveal' | 'finished';

export interface Buzz {
  peerId: string;
  ts: number;
  questionIndex: number;
}

export interface Score {
  peerId: string;
  points: number;
}
