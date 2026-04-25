import type { LocalDbRecord, ShippieLocalDb } from '@shippie/local-runtime-contract';

export interface LocalDbBenchmarkOptions {
  table?: string;
  rowCount?: number;
  vectorDimensions?: number;
  now?: () => number;
}

export interface LocalDbBenchmarkStep {
  name: 'insert' | 'query' | 'search' | 'vectorSearch' | 'count' | 'export';
  durationMs: number;
  targetMs?: number;
  passedTarget?: boolean;
  rows?: number;
}

export interface LocalDbBenchmarkResult {
  table: string;
  rowCount: number;
  vectorDimensions: number;
  steps: LocalDbBenchmarkStep[];
  targets: {
    query10kMs: number;
    insert1kMs: number;
    search50kMs: number;
    vector10kMs: number;
  };
}

const TARGETS = {
  query10kMs: 5,
  insert1kMs: 50,
  search50kMs: 20,
  vector10kMs: 50,
} as const;

export async function runLocalDbBenchmark(
  db: ShippieLocalDb,
  opts: LocalDbBenchmarkOptions = {},
): Promise<LocalDbBenchmarkResult> {
  const table = opts.table ?? `bench_${randomSuffix()}`;
  const rowCount = opts.rowCount ?? 10_000;
  const vectorDimensions = opts.vectorDimensions ?? 16;
  const now = opts.now ?? performanceNow;
  const steps: LocalDbBenchmarkStep[] = [];

  await db.create(table, {
    id: 'text primary key',
    title: 'text',
    cuisine: 'text',
    rating: 'integer',
    body: 'text',
    embedding: 'blob',
    created: 'datetime',
  });

  const insertStart = now();
  for (let i = 0; i < rowCount; i++) {
    await db.insert(table, benchmarkRecord(i, vectorDimensions));
  }
  const insertMs = now() - insertStart;
  steps.push({
    name: 'insert',
    durationMs: insertMs,
    targetMs: scaledTarget(TARGETS.insert1kMs, rowCount, 1_000),
    passedTarget: insertMs <= scaledTarget(TARGETS.insert1kMs, rowCount, 1_000),
    rows: rowCount,
  });

  const query = await timed(now, () =>
    db.query(table, {
      where: { cuisine: 'italian', rating: { gte: 4 } },
      orderBy: { created: 'desc' },
      limit: 20,
    }),
  );
  steps.push({
    name: 'query',
    durationMs: query.durationMs,
    targetMs: scaledTarget(TARGETS.query10kMs, rowCount, 10_000),
    passedTarget: query.durationMs <= scaledTarget(TARGETS.query10kMs, rowCount, 10_000),
    rows: query.value.length,
  });

  const search = await timed(now, () => db.search(table, 'creamy pasta cheese', { limit: 20 }));
  steps.push({
    name: 'search',
    durationMs: search.durationMs,
    targetMs: scaledTarget(TARGETS.search50kMs, rowCount, 50_000),
    passedTarget: search.durationMs <= scaledTarget(TARGETS.search50kMs, rowCount, 50_000),
    rows: search.value.length,
  });

  const vector = await timed(now, () => db.vectorSearch(table, benchmarkVector(7, vectorDimensions), { limit: 10 }));
  steps.push({
    name: 'vectorSearch',
    durationMs: vector.durationMs,
    targetMs: scaledTarget(TARGETS.vector10kMs, rowCount, 10_000),
    passedTarget: vector.durationMs <= scaledTarget(TARGETS.vector10kMs, rowCount, 10_000),
    rows: vector.value.length,
  });

  const count = await timed(now, () => db.count(table, { where: { cuisine: 'mexican' } }));
  steps.push({ name: 'count', durationMs: count.durationMs, rows: count.value });

  const exported = await timed(now, () => db.export(table, { format: 'json' }));
  steps.push({ name: 'export', durationMs: exported.durationMs, rows: rowCount });

  return {
    table,
    rowCount,
    vectorDimensions,
    steps,
    targets: TARGETS,
  };
}

function benchmarkRecord(index: number, vectorDimensions: number): LocalDbRecord {
  const cuisines = ['italian', 'mexican', 'thai', 'ethiopian', 'japanese'];
  const cuisine = cuisines[index % cuisines.length]!;
  return {
    id: `recipe-${index}`,
    title: `${cuisine} recipe ${index}`,
    cuisine,
    rating: ((index + 3) % 5) + 1,
    body: index % 3 === 0 ? 'creamy pasta cheese comfort food' : 'bright fresh quick meal',
    embedding: [...benchmarkVector(index, vectorDimensions)],
    created: new Date(1_700_000_000_000 + index * 1_000).toISOString(),
  };
}

function benchmarkVector(seed: number, dimensions: number): Float32Array {
  const vector = new Float32Array(dimensions);
  for (let i = 0; i < dimensions; i++) {
    vector[i] = Math.sin(seed + i) * 0.5 + Math.cos(seed * (i + 1)) * 0.5;
  }
  return vector;
}

async function timed<T>(now: () => number, fn: () => Promise<T>): Promise<{ value: T; durationMs: number }> {
  const start = now();
  const value = await fn();
  return { value, durationMs: now() - start };
}

function scaledTarget(target: number, rows: number, targetRows: number): number {
  return Math.max(1, target * (rows / targetRows));
}

function performanceNow(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
