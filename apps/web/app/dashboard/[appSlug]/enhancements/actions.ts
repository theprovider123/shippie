'use server';

import { z } from 'zod';
import { requireMakerOwnsApp } from '@/lib/dashboard/profile-loader';
import {
  writeShippieJson,
  clearShippieJson,
} from '@/lib/dashboard/shippie-json';

const ShippieJsonSchema = z
  .object({
    name: z.string().optional(),
    category: z.string().optional(),
    themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    sound: z.boolean().optional(),
    ai: z.union([z.array(z.string()), z.literal(false)]).optional(),
    ambient: z.object({ analyse: z.boolean().optional() }).optional(),
    groups: z.object({ enabled: z.boolean().optional() }).optional(),
    enhance: z.record(z.string(), z.array(z.string())).optional(),
    capabilities: z.array(z.string()).optional(),
  })
  .passthrough();

export type SaveResult = { ok: true } | { error: string };

export async function saveShippieJson(slug: string, raw: string): Promise<SaveResult> {
  await requireMakerOwnsApp(slug);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { error: `Invalid JSON: ${(e as Error).message}` };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: 'shippie.json must be a JSON object.' };
  }

  const validated = ShippieJsonSchema.safeParse(parsed);
  if (!validated.success) {
    return {
      error: validated.error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; '),
    };
  }

  await writeShippieJson(slug, validated.data as Record<string, unknown>);
  return { ok: true };
}

export async function resetShippieJson(slug: string): Promise<{ ok: true }> {
  await requireMakerOwnsApp(slug);
  await clearShippieJson(slug);
  return { ok: true };
}
