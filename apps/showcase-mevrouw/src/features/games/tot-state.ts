/**
 * Twenty-one Truths — turn-based slow-question game. Each session
 * walks through 21 prompts; partners alternate answering. When a
 * session completes, both phones get a "Save as memory" affordance
 * that drops the full transcript into the memories timeline.
 *
 * Y.Doc shape under map 'tot':
 *   currentSessionId: string | null
 *   sessions: Record<sessionId, { startedBy, startedAt, answers, completedAt? }>
 *
 * Turn rule: turn N (0-indexed) is the starter on N % 2 === 0,
 * the partner on N % 2 === 1. After 21 answers the session is
 * complete. Each answer carries `by` so the rule is verifiable.
 */
import * as Y from 'yjs';

export interface TotPrompt {
  id: string;
  text: string;
}

export const TOT_BANK: ReadonlyArray<TotPrompt> = [
  { id: 't1', text: 'What is something about us you wish we said out loud more often?' },
  { id: 't2', text: 'A childhood memory you have never told me?' },
  { id: 't3', text: 'When did you first know you loved me?' },
  { id: 't4', text: 'A small ritual we have that secretly means everything to you?' },
  { id: 't5', text: 'A fear about us you carry quietly?' },
  { id: 't6', text: 'The version of yourself you most want me to see?' },
  { id: 't7', text: 'A way I have changed you that surprised you?' },
  { id: 't8', text: 'Something you wish we did more often?' },
  { id: 't9', text: 'Something you wish we did less often?' },
  { id: 't10', text: 'A future I have not heard you imagine yet?' },
  { id: 't11', text: 'When was the last time I made you feel really seen?' },
  { id: 't12', text: 'A way you want to grow that I can support?' },
  { id: 't13', text: "Something I've done that you forgave but never forgot?" },
  { id: 't14', text: 'A truth about us that took you a while to admit?' },
  { id: 't15', text: 'What does home feel like with me in it?' },
  { id: 't16', text: 'The thing you do for us that you wish I noticed more?' },
  { id: 't17', text: 'A friendship of mine you appreciate?' },
  { id: 't18', text: "An ambition you have that you haven't told anyone yet?" },
  { id: 't19', text: 'Something about my body or way of moving that you love?' },
  { id: 't20', text: 'How would you describe us to a child?' },
  { id: 't21', text: "What's the truest thing you can say about today?" },
];

export interface TotAnswer {
  promptId: string;
  by: string;
  text: string;
  at: number;
}

export interface TotSession {
  id: string;
  startedBy: string;
  startedAt: number;
  answers: TotAnswer[];
  completedAt: number | null;
}

interface TotRecord {
  currentSessionId: string | null;
  sessions: Record<string, TotSession>;
}

function getMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('tot');
}

export function readTot(doc: Y.Doc): TotRecord {
  const m = getMap(doc);
  const currentSessionId = (m.get('currentSessionId') as string | null | undefined) ?? null;
  const sessions = (m.get('sessions') as Record<string, TotSession> | undefined) ?? {};
  return { currentSessionId, sessions };
}

export function startTotSession(doc: Y.Doc, deviceId: string): string {
  const id = `tot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const session: TotSession = {
    id,
    startedBy: deviceId,
    startedAt: Date.now(),
    answers: [],
    completedAt: null,
  };
  doc.transact(() => {
    const rec = readTot(doc);
    const m = getMap(doc);
    m.set('sessions', { ...rec.sessions, [id]: session });
    m.set('currentSessionId', id);
  });
  return id;
}

export function answerTot(
  doc: Y.Doc,
  sessionId: string,
  deviceId: string,
  text: string,
): void {
  if (!text.trim()) return;
  doc.transact(() => {
    const rec = readTot(doc);
    const session = rec.sessions[sessionId];
    if (!session || session.completedAt !== null) return;
    if (whoseTurn(session) !== deviceId) return; // not your turn
    if (session.answers.length >= TOT_BANK.length) return;
    const promptId = TOT_BANK[session.answers.length]!.id;
    const next: TotAnswer = {
      promptId,
      by: deviceId,
      text: text.trim(),
      at: Date.now(),
    };
    const updated: TotSession = {
      ...session,
      answers: [...session.answers, next],
      completedAt: session.answers.length + 1 >= TOT_BANK.length ? Date.now() : null,
    };
    const m = getMap(doc);
    m.set('sessions', { ...rec.sessions, [sessionId]: updated });
  });
}

export function abandonTotSession(doc: Y.Doc, sessionId: string): void {
  doc.transact(() => {
    const rec = readTot(doc);
    if (!rec.sessions[sessionId]) return;
    const m = getMap(doc);
    if (rec.currentSessionId === sessionId) {
      m.set('currentSessionId', null);
    }
    const sessions = { ...rec.sessions };
    delete sessions[sessionId];
    m.set('sessions', sessions);
  });
}

export function whoseTurn(session: TotSession): string {
  // turn N is starter on even, partner on odd. We don't know the
  // partner's deviceId here; if the starter is `me`, my turn is even,
  // else my turn is odd. The component picks the right device id.
  // To compute purely from session: need the second deviceId. We
  // derive it from the answers (first non-starter answer = partner).
  const starter = session.startedBy;
  const partnerAnswer = session.answers.find((a) => a.by !== starter);
  const partner = partnerAnswer?.by ?? null;
  const turn = session.answers.length;
  if (turn % 2 === 0) return starter;
  return partner ?? starter; // before partner has answered, only starter has played
}

export function promptFor(promptId: string): TotPrompt {
  return TOT_BANK.find((p) => p.id === promptId) ?? TOT_BANK[0]!;
}

export function currentPromptForSession(session: TotSession): TotPrompt | null {
  if (session.answers.length >= TOT_BANK.length) return null;
  return TOT_BANK[session.answers.length] ?? null;
}
