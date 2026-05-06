/**
 * On first load, seed a small list of common chronic-illness symptoms
 * so the user has something to log against. The user can add/remove/
 * reorder. No-op if the symptoms table already has rows.
 *
 * Voice rule: these are descriptive labels. Not "your headache score";
 * just "Headache". The app records what the user reports.
 */
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import { createSymptom, listSymptoms } from './queries.ts';

export const SEED_SYMPTOMS: Array<{ name: string; default_scale: '1-5' | 'present-absent' }> = [
  { name: 'Pain', default_scale: '1-5' },
  { name: 'Fatigue', default_scale: '1-5' },
  { name: 'Headache', default_scale: '1-5' },
  { name: 'Brain fog', default_scale: '1-5' },
  { name: 'Nausea', default_scale: 'present-absent' },
];

export async function seedIfEmpty(db: ShippieLocalDb): Promise<{ seeded: boolean; count: number }> {
  const existing = await listSymptoms(db);
  if (existing.length > 0) return { seeded: false, count: existing.length };
  for (const s of SEED_SYMPTOMS) {
    await createSymptom(db, s);
  }
  return { seeded: true, count: SEED_SYMPTOMS.length };
}
