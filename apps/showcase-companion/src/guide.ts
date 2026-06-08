import type { PrepState, TripSession } from './types.ts';

export interface PrepareGuide {
  anchorDraft: string;
  roomNote: string;
  cautionNote: string;
}

export interface IntegrationGuide {
  reflectionPrompt: string;
  carryForwardDraft: string;
  patternNote: string;
}

export function prepareGuide(prep: PrepState, warnings: readonly string[]): PrepareGuide {
  const intention = clean(prep.intention) || 'staying kind to yourself';
  const contact = clean(prep.contact.name) || 'your trusted person';
  const anchorDraft =
    clean(prep.anchor) ||
    `You chose ${intention}. Your only job is to stay gentle, sip water, and let time pass. If it gets big, read this again and call ${contact}.`;
  const roomNote = prep.checklist.space
    ? 'Your room plan has a stable base. Keep the next choice small: lower light, simple sound, water nearby.'
    : 'Start with the room. A familiar place, quiet phone, water, and one reachable person matter more than extra setup.';
  const cautionNote =
    warnings.length > 0
      ? 'Selected cautions mean this plan deserves extra sober support and real-world help if anything feels physically unsafe.'
      : 'No selected cautions is only a checklist result. It is not proof of safety, medical clearance, or legal advice.';

  return { anchorDraft, roomNote, cautionNote };
}

export function integrationGuide(session: TripSession): IntegrationGuide {
  const hardMoments = session.moodLog.filter((entry) => entry.felt === 'hard').length;
  const intenseMoments = session.moodLog.filter((entry) => entry.felt === 'intense').length;
  const intention = clean(session.prep.intention) || 'the intention you wrote';
  const texture =
    hardMoments > 0
      ? 'Include the difficult part without turning it into the whole story.'
      : intenseMoments > 0
        ? 'Name what felt large, then name one ordinary detail from the room.'
        : 'Notice the soft parts without forcing a lesson.';

  return {
    reflectionPrompt: `Write three sentences: what happened, what your body needed, and how it relates to ${intention}. ${texture}`,
    carryForwardDraft:
      clean(session.carryForward) ||
      'Choose one small ordinary-life action: a message, a walk, a meal, a tidy corner, or sleep.',
    patternNote:
      session.moodLog.length > 0
        ? `${session.moodLog.length} check-ins give you a simple map. Treat it as memory support, not diagnosis.`
        : 'No check-ins were logged. Your notes can still be useful if they stay plain and specific.',
  };
}

function clean(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
