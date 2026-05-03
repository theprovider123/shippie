/**
 * Never Have I Ever — drinking game (or just confession-game). Each
 * round, both phones see the same prompt; each partner taps "I have"
 * or "I have not". Both reveal at once. Sip count increments for
 * "I have" answers across the run.
 *
 * Y.Doc shape under map 'nhie':
 *   currentPromptIdx: number
 *   answers: Record<deviceId, Record<promptIdx, 'have' | 'havent'>>
 *   sips: Record<deviceId, number>
 *   tier: 'soft' | 'spicy'
 */
import * as Y from 'yjs';

export type Answer = 'have' | 'havent';
export type Tier = 'soft' | 'spicy';

export interface NhiePrompt {
  text: string;
  tier: Tier;
}

const SOFT: ReadonlyArray<string> = [
  'lied about loving a gift',
  'binge-watched something all day instead of working',
  'pretended to know a song to keep talking to someone',
  'taken a nap and missed an entire afternoon',
  'cried at a film in public',
  'eaten cereal for dinner more than three nights in a row',
  'texted the wrong person something embarrassing',
  'walked into a glass door',
  'sang in the shower loud enough that someone heard',
  'lied about reading a book',
  'forgotten where I parked the car for over twenty minutes',
  'pretended to be on the phone to avoid someone',
  'eaten food off the floor (3-second rule)',
  'fallen asleep in a film I had been excited to see',
  'lost track of how many seasons of a show I have watched',
  'stalked a stranger on social media for over an hour',
  'kept a borrowed book past returning age',
  'eaten an entire pizza alone',
  'cried laughing in public',
  'told a tiny lie to get out of a plan I made',
];

const SPICY: ReadonlyArray<string> = [
  'sent a text I deleted before they could read it',
  'pictured someone else for a moment when I should not have',
  'kept reading a message and not replied for over an hour on purpose',
  'taken a shower together that lasted longer than expected',
  'kissed someone in a place I was definitely not supposed to',
  'thought about you in the middle of an unrelated meeting',
  'changed clothes thinking about you',
  'lied (lightly) about how the day was going',
  'wanted to go home only because you were there',
  'broken a rule because of you',
  'kept a screenshot I should not have',
  'rehearsed a sentence in my head before saying it to you',
  'noticed someone hot and refused to admit it to you',
  'flirted, in some small way, with you in front of strangers',
  'wanted to skip the rest of an evening because of you',
  'crossed a line at work I am still thinking about',
  'told a friend something about you they will never let me live down',
  'kept a piece of clothing you thought you lost',
  'texted in bed for an hour after lights-out',
  'agreed to a plan only because you would be there',
];

export const NHIE_BANK: ReadonlyArray<NhiePrompt> = [
  ...SOFT.map((text) => ({ text: `Never have I ever ${text}.`, tier: 'soft' as const })),
  ...SPICY.map((text) => ({ text: `Never have I ever ${text}.`, tier: 'spicy' as const })),
];

interface NhieRecord {
  currentPromptIdx: number;
  answers: Record<string, Record<number, Answer>>;
  sips: Record<string, number>;
  tier: Tier | 'all';
}

function getMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('nhie');
}

export function readNhie(doc: Y.Doc): NhieRecord {
  const m = getMap(doc);
  const currentPromptIdx = (m.get('currentPromptIdx') as number | undefined) ?? -1;
  const answers = (m.get('answers') as Record<string, Record<number, Answer>> | undefined) ?? {};
  const sips = (m.get('sips') as Record<string, number> | undefined) ?? {};
  const tier = (m.get('tier') as Tier | 'all' | undefined) ?? 'all';
  return { currentPromptIdx, answers, sips, tier };
}

export function setTier(doc: Y.Doc, tier: Tier | 'all'): void {
  doc.transact(() => getMap(doc).set('tier', tier));
}

function pickIdx(rec: NhieRecord): number {
  const pool: number[] = [];
  for (let i = 0; i < NHIE_BANK.length; i += 1) {
    const p = NHIE_BANK[i]!;
    if (rec.tier !== 'all' && p.tier !== rec.tier) continue;
    pool.push(i);
  }
  if (pool.length === 0) return 0;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

export function nextPrompt(doc: Y.Doc): void {
  doc.transact(() => {
    const rec = readNhie(doc);
    const idx = pickIdx(rec);
    const m = getMap(doc);
    m.set('currentPromptIdx', idx);
    // Clear previous-round answers for the NEW prompt only; keep
    // sip totals across rounds.
  });
}

export function answer(doc: Y.Doc, deviceId: string, choice: Answer): void {
  doc.transact(() => {
    const rec = readNhie(doc);
    if (rec.currentPromptIdx < 0) return;
    const existing = rec.answers[deviceId]?.[rec.currentPromptIdx];
    if (existing) return; // already answered this round
    const myAnswers = { ...(rec.answers[deviceId] ?? {}) };
    myAnswers[rec.currentPromptIdx] = choice;
    const sips = { ...rec.sips };
    if (choice === 'have') sips[deviceId] = (sips[deviceId] ?? 0) + 1;
    const m = getMap(doc);
    m.set('answers', { ...rec.answers, [deviceId]: myAnswers });
    m.set('sips', sips);
  });
}

export function reset(doc: Y.Doc): void {
  doc.transact(() => {
    const m = getMap(doc);
    m.set('currentPromptIdx', -1);
    m.set('answers', {});
    m.set('sips', {});
  });
}

export function bothAnswered(rec: NhieRecord, a: string, b: string | null): boolean {
  if (rec.currentPromptIdx < 0) return false;
  if (!b) return false;
  return Boolean(rec.answers[a]?.[rec.currentPromptIdx]) && Boolean(rec.answers[b]?.[rec.currentPromptIdx]);
}

export function promptAt(idx: number): NhiePrompt | null {
  return NHIE_BANK[idx] ?? null;
}
