/**
 * Whispers — soft conversation prompts. No score, no winner. One
 * partner taps "new whisper", a prompt rolls in, both write a
 * response. Both responses sync. Long-running conversation thread
 * ordered by `startedAt`.
 *
 * Y.Doc shape under map 'whispers':
 *   order: ReadonlyArray<roundId>
 *   rounds: Record<roundId, { promptId, startedAt, responses: Record<deviceId, string> }>
 */
import * as Y from 'yjs';

export interface WhisperPrompt {
  id: string;
  text: string;
}

export const WHISPERS_BANK: ReadonlyArray<WhisperPrompt> = [
  { id: 'w1', text: 'What is the moment from this week you keep coming back to?' },
  { id: 'w2', text: 'Where would you most want to wake up tomorrow morning?' },
  { id: 'w3', text: 'What is a smell that always makes you think of me?' },
  { id: 'w4', text: 'What is a song that, if it came on right now, would put you in a good mood?' },
  { id: 'w5', text: 'Tell me about a tiny thing I do that you love.' },
  { id: 'w6', text: 'If we could disappear for 48 hours, where do we go?' },
  { id: 'w7', text: 'What did you eat as a kid that you still think about?' },
  { id: 'w8', text: 'A movie scene that makes you cry every time?' },
  { id: 'w9', text: 'What part of your day do you most want to share with me?' },
  { id: 'w10', text: 'Which of our memories would you turn into a film?' },
  { id: 'w11', text: 'Tell me one thing you want me to know about today.' },
  { id: 'w12', text: 'What is your most controversial pizza topping?' },
  { id: 'w13', text: 'What did past-you most want for present-you?' },
  { id: 'w14', text: 'What is a compliment you wish I would give you more?' },
  { id: 'w15', text: "What's something you used to be embarrassed about and aren't anymore?" },
  { id: 'w16', text: 'Describe the perfect Sunday morning. Really detailed.' },
  { id: 'w17', text: 'What is an apology you owe someone (not me)?' },
  { id: 'w18', text: 'A book character you would have wanted to be friends with as a teenager?' },
  { id: 'w19', text: "If you had to teach me one thing you're good at, what would it be?" },
  { id: 'w20', text: "What's a small thing I did recently that you noticed and meant something to you?" },
  { id: 'w21', text: 'What weather are you in your head right now?' },
  { id: 'w22', text: 'Where on me would you put your hand if I came home tired?' },
  { id: 'w23', text: 'A sentence you would say to your fifteen-year-old self?' },
  { id: 'w24', text: "What's the most you've ever laughed in your life?" },
  { id: 'w25', text: 'A meal you want me to cook for you.' },
  { id: 'w26', text: 'What would the title of your week be?' },
  { id: 'w27', text: 'What about us do you most want to protect?' },
  { id: 'w28', text: 'A small private dream you keep meaning to tell me.' },
  { id: 'w29', text: 'A texture, scent, or sound that feels like home.' },
  { id: 'w30', text: 'A question you wish someone had asked you this week.' },
  { id: 'w31', text: 'Something you used to think you wanted but now know you do not.' },
  { id: 'w32', text: 'The thing you do for me that you wish I knew you do.' },
  { id: 'w33', text: 'A thing about me you noticed before I noticed it about myself.' },
  { id: 'w34', text: 'If I could buy you any tiny gift today, what would it be?' },
];

export interface WhisperRound {
  id: string;
  promptId: string;
  startedAt: number;
  responses: Record<string, string>;
}

interface WhispersRecord {
  order: string[];
  rounds: Record<string, WhisperRound>;
}

function getMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('whispers');
}

export function readWhispers(doc: Y.Doc): WhispersRecord {
  const m = getMap(doc);
  const order = (m.get('order') as string[] | undefined) ?? [];
  const rounds = (m.get('rounds') as Record<string, WhisperRound> | undefined) ?? {};
  return { order, rounds };
}

function genId(): string {
  return `wsp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function pickPrompt(rec: WhispersRecord): WhisperPrompt {
  // Avoid recent prompts; cycle through the bank fairly.
  const usedRecently = new Set(
    rec.order.slice(-Math.min(8, WHISPERS_BANK.length - 1)).map((rid) => rec.rounds[rid]?.promptId),
  );
  const available = WHISPERS_BANK.filter((p) => !usedRecently.has(p.id));
  const pool = available.length > 0 ? available : WHISPERS_BANK;
  return pool[Math.floor(Math.random() * pool.length)] ?? WHISPERS_BANK[0]!;
}

export function newWhisper(doc: Y.Doc): string {
  const rec = readWhispers(doc);
  const id = genId();
  const prompt = pickPrompt(rec);
  const next: WhisperRound = {
    id,
    promptId: prompt.id,
    startedAt: Date.now(),
    responses: {},
  };
  doc.transact(() => {
    const m = getMap(doc);
    const rounds = { ...rec.rounds, [id]: next };
    m.set('rounds', rounds);
    m.set('order', [...rec.order, id]);
  });
  return id;
}

export function setWhisperResponse(
  doc: Y.Doc,
  roundId: string,
  deviceId: string,
  text: string,
): void {
  const rec = readWhispers(doc);
  const round = rec.rounds[roundId];
  if (!round) return;
  doc.transact(() => {
    const m = getMap(doc);
    const updated: WhisperRound = {
      ...round,
      responses: { ...round.responses, [deviceId]: text },
    };
    m.set('rounds', { ...rec.rounds, [roundId]: updated });
  });
}

export function deleteWhisper(doc: Y.Doc, roundId: string): void {
  const rec = readWhispers(doc);
  if (!rec.rounds[roundId]) return;
  doc.transact(() => {
    const m = getMap(doc);
    const rounds = { ...rec.rounds };
    delete rounds[roundId];
    m.set('rounds', rounds);
    m.set('order', rec.order.filter((x) => x !== roundId));
  });
}

export function promptFor(promptId: string): WhisperPrompt {
  return WHISPERS_BANK.find((p) => p.id === promptId) ?? WHISPERS_BANK[0]!;
}
