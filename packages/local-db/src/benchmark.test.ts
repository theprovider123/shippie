import { describe, expect, test } from 'bun:test';
import { runLocalDbBenchmark } from './benchmark.ts';
import { createMemoryLocalDb } from './memory.ts';

describe('@shippie/local-db benchmark harness', () => {
  test('runs deterministic workload against any contract adapter', async () => {
    const db = createMemoryLocalDb();
    const result = await runLocalDbBenchmark(db, {
      table: 'bench_recipes',
      rowCount: 50,
      vectorDimensions: 4,
    });

    expect(result.rowCount).toBe(50);
    expect(result.vectorDimensions).toBe(4);
    expect(result.steps.map((step) => step.name)).toEqual([
      'insert',
      'query',
      'search',
      'vectorSearch',
      'count',
      'export',
    ]);
    expect(result.steps.find((step) => step.name === 'query')?.rows).toBeGreaterThan(0);
    expect(result.steps.find((step) => step.name === 'vectorSearch')?.rows).toBe(10);
  });
});
