import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireAdmin } from '$server/admin/auth';
import { recordAudit } from '$server/admin/audit';
import { getDrizzleClient } from '$server/db/client';
import {
  deleteLiveRoutePack,
  liveRoutePackSummary,
  parseLiveRoutePack,
  readLiveRoutePack,
  writeLiveRoutePack,
} from '$server/parade/route-pack-live';

export const load: PageServerLoad = async (event) => {
  requireAdmin(event);
  const kv = event.platform?.env.CACHE;
  const [raw, summary] = await Promise.all([readLiveRoutePack(kv), liveRoutePackSummary(kv)]);

  return {
    available: Boolean(kv),
    current: summary,
    currentJson: raw ?? '',
  };
};

export const actions: Actions = {
  publish: async (event) => {
    const admin = requireAdmin(event);
    const kv = event.platform?.env.CACHE;
    if (!kv) return fail(503, { error: 'KV cache unavailable.' });

    const form = await event.request.formData();
    const raw = String(form.get('routePack') ?? '').trim();
    if (!raw) return fail(400, { error: 'Paste a route-pack JSON document first.' });

    const before = await liveRoutePackSummary(kv);
    const parsed = await writeLiveRoutePack(kv, raw);
    if (!parsed.ok) return fail(400, { error: parsed.error });

    if (event.platform?.env.DB) {
      const db = getDrizzleClient(event.platform.env.DB);
      await recordAudit(db, {
        actorUserId: admin.id,
        action: 'admin.parade.route_pack.publish',
        targetTable: 'kv:parade_route_pack',
        targetId: parsed.summary.packVersion,
        before: before ? { packVersion: before.packVersion, status: before.status } : null,
        after: { packVersion: parsed.summary.packVersion, status: parsed.summary.status },
      });
    }

    return { ok: true, message: `Published route pack ${parsed.summary.packVersion}.` };
  },

  validate: async (event) => {
    requireAdmin(event);
    const form = await event.request.formData();
    const raw = String(form.get('routePack') ?? '').trim();
    if (!raw) return fail(400, { error: 'Paste a route-pack JSON document first.' });
    const parsed = parseLiveRoutePack(raw);
    if (!parsed.ok) return fail(400, { error: parsed.error });
    return { ok: true, message: `Valid pack ${parsed.summary.packVersion}. Not published yet.` };
  },

  clear: async (event) => {
    const admin = requireAdmin(event);
    const kv = event.platform?.env.CACHE;
    if (!kv) return fail(503, { error: 'KV cache unavailable.' });

    const before = await liveRoutePackSummary(kv);
    await deleteLiveRoutePack(kv);

    if (event.platform?.env.DB) {
      const db = getDrizzleClient(event.platform.env.DB);
      await recordAudit(db, {
        actorUserId: admin.id,
        action: 'admin.parade.route_pack.clear',
        targetTable: 'kv:parade_route_pack',
        targetId: before?.packVersion ?? null,
        before: before ? { packVersion: before.packVersion, status: before.status } : null,
        after: null,
      });
    }

    return { ok: true, message: 'Live route pack cleared. Apps keep their baked offline pack.' };
  },
};
