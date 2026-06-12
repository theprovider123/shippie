import { describe, expect, it } from "vitest";
import {
  drawTrivia,
  pickTrivia,
  readTriviaRecent,
  rememberTrivia,
  TRIVIA_BANK,
  TRIVIA_HISTORY_LIMIT,
} from "./trivia";

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}

function seeded(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = Math.imul(x, 1664525) + 1013904223;
    return (x >>> 0) / 4294967296;
  };
}

describe("trivia bank", () => {
  it("has enough evergreen questions for repeat play", () => {
    expect(TRIVIA_BANK.length).toBeGreaterThanOrEqual(180);
  });

  it("has unique prompts, stable ids, and valid answers", () => {
    const ids = new Set<string>();
    const prompts = new Set<string>();

    for (const q of TRIVIA_BANK) {
      expect(q.id).toMatch(/^[a-z]+:/);
      expect(ids.has(q.id)).toBe(false);
      ids.add(q.id);

      expect(prompts.has(q.q)).toBe(false);
      prompts.add(q.q);

      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.options.length);
      expect(q.options[q.answer].trim().length).toBeGreaterThan(0);
    }
  });

  it("does not duplicate questions inside a deck", () => {
    const deck = pickTrivia(120, { rng: seeded(123), storage: null });
    expect(new Set(deck.map((q) => q.id)).size).toBe(deck.length);
  });

  it("avoids recently drawn questions when enough fresh ones remain", () => {
    const storage = memoryStorage();
    const first = drawTrivia(80, { rng: seeded(1), storage });
    const second = drawTrivia(80, { rng: seeded(2), storage });
    const firstIds = new Set(first.map((q) => q.id));

    expect(second.some((q) => firstIds.has(q.id))).toBe(false);
  });

  it("caps recent history so the bank can recycle later", () => {
    const storage = memoryStorage();
    rememberTrivia(TRIVIA_BANK, storage);
    expect(readTriviaRecent(storage)).toHaveLength(TRIVIA_HISTORY_LIMIT);
  });
});
