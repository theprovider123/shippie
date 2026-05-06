import type { CronEnv } from './index';
import { getDrizzleClient, schema } from '../db/client';
import { eq } from 'drizzle-orm';

export async function runCron<T>(
  env: CronEnv,
  input: {
    cronString: string;
    handler: string;
    run: (env: CronEnv) => Promise<T>;
  },
): Promise<T | undefined> {
  if (typeof (env.DB as { prepare?: unknown }).prepare !== 'function') {
    try {
      return await input.run(env);
    } catch (err) {
      console.error(`[cron] handler '${input.handler}' failed`, err);
      return undefined;
    }
  }
  const db = getDrizzleClient(env.DB);
  const startedAt = new Date().toISOString();
  const [row] = await db
    .insert(schema.cronRuns)
    .values({
      cronString: input.cronString,
      handler: input.handler,
      startedAt,
      status: 'running',
    })
    .returning();

  const runId = row?.id;
  try {
    const result = await input.run(env);
    if (runId) {
      await db
        .update(schema.cronRuns)
        .set({
          finishedAt: new Date().toISOString(),
          status: 'success',
          itemsProcessed: itemsProcessed(result),
        })
        .where(eq(schema.cronRuns.id, runId));
    }
    return result;
  } catch (err) {
    const message = err instanceof Error ? `${err.message}\n${err.stack ?? ''}`.trim() : String(err);
    if (runId) {
      await db
        .update(schema.cronRuns)
        .set({
          finishedAt: new Date().toISOString(),
          status: 'failed',
          errorMessage: message.slice(0, 4000),
        })
        .where(eq(schema.cronRuns.id, runId));
    }
    console.error(`[cron] handler '${input.handler}' failed`, err);
    return undefined;
  }
}

function itemsProcessed(result: unknown): number | null {
  if (!result || typeof result !== 'object') return null;
  const value = (result as { itemsProcessed?: unknown; processed?: unknown; count?: unknown })
    .itemsProcessed ?? (result as { processed?: unknown }).processed ?? (result as { count?: unknown }).count;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
