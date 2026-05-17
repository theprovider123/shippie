import {
  createIndexedDbEventQueue,
  createMemoryEventQueue,
  type EventQueue,
  type QueuedEvent,
} from '@shippie/spaces';

const DB_NAME = 'shippie-match-room';
const STORE_NAME = 'queued-messages';

export type QueuedMessage<T = unknown> = QueuedEvent<T>;
export type VoteQueue<T = unknown> = EventQueue<T>;

export function createMemoryVoteQueue<T = unknown>(): VoteQueue<T> {
  return createMemoryEventQueue<T>();
}

export function createIndexedDbVoteQueue<T = unknown>(): VoteQueue<T> {
  return createIndexedDbEventQueue<T>({ dbName: DB_NAME, storeName: STORE_NAME });
}
