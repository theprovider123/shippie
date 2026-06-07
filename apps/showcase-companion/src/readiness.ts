import type { PrepState } from './types.ts';

export function getPreparationGuidance(prep: PrepState): string[] {
  const guidance: string[] = [];
  if (!prep.anchor.trim()) guidance.push('Leave yourself an anchor note if you have a minute.');
  if (!prep.contact.name.trim() || !prep.contact.phone.trim()) guidance.push('Add a trusted person for one-tap help.');
  if (!prep.contact.emergencyNumber.trim()) guidance.push('Add your local emergency number for quick access.');
  if (prep.safetyFlags.length > 0 && !prep.safetyAcknowledged) {
    guidance.push('Review the caution notes and involve real-world support.');
  }
  return guidance;
}

export function isReadyToStart(prep: PrepState): boolean {
  void prep;
  return true;
}
