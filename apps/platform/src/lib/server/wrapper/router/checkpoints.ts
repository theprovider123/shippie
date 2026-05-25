/**
 * Sealed per-app checkpoints.
 *
 * Maker apps use this to store opaque encrypted recovery snapshots on
 * Shippie's sealed-documents store. The wrapper never sees plaintext app data: clients
 * upload ciphertext plus small metadata so a new device can bootstrap
 * from the latest sealed copy before live peer sync catches up.
 */
import type { WrapperContext } from '../env';

const CHECKPOINT_SCHEMA = 'shippie.sealed-checkpoint.v1';
const MAX_CHECKPOINT_BYTES = 10 * 1024 * 1024;
const ROOM_RE = /^[a-zA-Z0-9._:-]{1,256}$/;
const B64URL_RE = /^[a-zA-Z0-9_-]+={0,2}$/;

interface StoredCheckpoint {
  schema: typeof CHECKPOINT_SCHEMA;
  appSlug: string;
  roomId: string;
  createdAt: string;
  updatedAt: string;
  updateBytes: number;
  payload: string;
}

function checkpointKey(slug: string, roomId: string): string {
  return `sealed-checkpoints/${slug}/${encodeURIComponent(roomId)}.json`;
}

async function readStored(ctx: WrapperContext, key: string): Promise<string | null> {
  if (ctx.env.DOCUMENTS) {
    const obj = await ctx.env.DOCUMENTS.get(key);
    return obj ? await obj.text() : null;
  }
  return ctx.env.CACHE.get(key);
}

async function writeStored(ctx: WrapperContext, key: string, value: string): Promise<void> {
  if (ctx.env.DOCUMENTS) {
    await ctx.env.DOCUMENTS.put(key, value, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
    });
    return;
  }
  await ctx.env.CACHE.put(key, value);
}

async function deleteStored(ctx: WrapperContext, key: string): Promise<void> {
  if (ctx.env.DOCUMENTS) {
    await ctx.env.DOCUMENTS.delete(key);
    return;
  }
  await ctx.env.CACHE.delete(key);
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
    },
  });
}

function decodeRoomId(encodedRoomId: string): string | null {
  try {
    const roomId = decodeURIComponent(encodedRoomId);
    return ROOM_RE.test(roomId) ? roomId : null;
  } catch {
    return null;
  }
}

function parseStored(raw: string | null): StoredCheckpoint | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredCheckpoint;
    if (parsed?.schema !== CHECKPOINT_SCHEMA) return null;
    if (typeof parsed.payload !== 'string') return null;
    if (typeof parsed.updateBytes !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function handleCheckpoint(
  ctx: WrapperContext,
  encodedRoomId: string,
): Promise<Response> {
  const roomId = decodeRoomId(encodedRoomId);
  if (!roomId) return json({ error: 'invalid_room_id' }, 400);

  const key = checkpointKey(ctx.slug, roomId);

  if (ctx.request.method === 'GET') {
    const existing = parseStored(await readStored(ctx, key));
    if (!existing) {
      return json({ ok: true, exists: false, schema: CHECKPOINT_SCHEMA });
    }
    return json({
      ok: true,
      exists: true,
      schema: CHECKPOINT_SCHEMA,
      updated_at: existing.updatedAt,
      update_bytes: existing.updateBytes,
      payload: existing.payload,
    });
  }

  if (ctx.request.method === 'DELETE') {
    await deleteStored(ctx, key);
    return json({ ok: true, deleted: true, schema: CHECKPOINT_SCHEMA });
  }

  if (ctx.request.method !== 'PUT' && ctx.request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  let body: unknown;
  try {
    body = await ctx.request.json();
  } catch {
    return json({ error: 'expected_json_body' }, 400);
  }

  const input = body as {
    schema?: unknown;
    update_bytes?: unknown;
    payload?: unknown;
  };
  if (
    input.schema !== CHECKPOINT_SCHEMA ||
    typeof input.payload !== 'string' ||
    !B64URL_RE.test(input.payload) ||
    input.payload.length > MAX_CHECKPOINT_BYTES * 2 ||
    typeof input.update_bytes !== 'number' ||
    !Number.isFinite(input.update_bytes) ||
    input.update_bytes <= 0 ||
    input.update_bytes > MAX_CHECKPOINT_BYTES
  ) {
    return json({ error: 'invalid_checkpoint' }, 400);
  }

  const existing = parseStored(await readStored(ctx, key));
  if (existing && input.update_bytes < existing.updateBytes) {
    return json(
      {
        ok: false,
        error: 'smaller_than_existing_checkpoint',
        update_bytes: existing.updateBytes,
      },
      409,
    );
  }

  const now = new Date().toISOString();
  const stored: StoredCheckpoint = {
    schema: CHECKPOINT_SCHEMA,
    appSlug: ctx.slug,
    roomId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    updateBytes: input.update_bytes,
    payload: input.payload,
  };

  await writeStored(ctx, key, JSON.stringify(stored));
  return json({
    ok: true,
    schema: CHECKPOINT_SCHEMA,
    updated_at: stored.updatedAt,
    update_bytes: stored.updateBytes,
  });
}
