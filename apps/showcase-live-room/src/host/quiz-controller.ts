import * as Y from 'yjs';
import {
  awardPointToWinner,
  getCurrentIndex,
  getPhase,
  setCurrentIndex,
  setPhase,
  setQuestionStartedAt,
} from '../shared/quiz-state.ts';
import { QUESTIONS } from '../shared/questions.ts';

/**
 * Host-only: orchestrate quiz progression. Guests are read-only on
 * phase + index. We stamp `questionStartedAt` on every transition
 * INTO 'question' so the latency overlay has a reference point.
 */
export function startQuiz(doc: Y.Doc): void {
  setCurrentIndex(doc, 0);
  setQuestionStartedAt(doc, Date.now());
  setPhase(doc, 'question');
}

export function reveal(doc: Y.Doc): void {
  if (getPhase(doc) !== 'question') return;
  awardPointToWinner(doc, getCurrentIndex(doc));
  setPhase(doc, 'reveal');
}

export function next(doc: Y.Doc): void {
  const index = getCurrentIndex(doc);
  if (index >= QUESTIONS.length - 1) {
    setPhase(doc, 'finished');
    return;
  }
  setCurrentIndex(doc, index + 1);
  setQuestionStartedAt(doc, Date.now());
  setPhase(doc, 'question');
}
