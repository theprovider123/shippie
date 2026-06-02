import type { UpdateCard } from './state';

export type UpdateSeverity = 'quiet' | 'review' | 'attention';
export type UpdateChipTone = 'neutral' | 'safe' | 'attention';

export interface UpdateChip {
  label: string;
  tone: UpdateChipTone;
}

export function updateSeverity(card: UpdateCard): UpdateSeverity {
  if (
    card.kindChanged ||
    card.addedPermissions.length > 0 ||
    card.addedNetworkDomains.length > 0 ||
    card.dataCompatibility.status !== 'same-schema'
  ) {
    return 'attention';
  }
  if (
    card.versionChanged ||
    card.permissionsChanged ||
    card.removedPermissions.length > 0 ||
    card.removedNetworkDomains.length > 0
  ) {
    return 'review';
  }
  return 'quiet';
}

export function updateBadgeLabel(cards: readonly UpdateCard[]): string {
  const attention = cards.filter((card) => updateSeverity(card) === 'attention').length;
  if (attention > 0) return attention === 1 ? '1 needs review' : `${attention} need review`;
  return cards.length === 1 ? '1 update' : `${cards.length} updates`;
}

export function updateSummary(card: UpdateCard): string {
  const parts: string[] = [];
  if (card.versionChanged) parts.push(`v${card.receipt.version} to v${card.app.version}`);
  else if (card.packageHashChanged) parts.push('package refreshed');
  if (card.addedNetworkDomains.length > 0) parts.push(`${card.addedNetworkDomains.length} new domain${card.addedNetworkDomains.length === 1 ? '' : 's'}`);
  if (card.addedPermissions.length > 0) parts.push(`${card.addedPermissions.length} new capability${card.addedPermissions.length === 1 ? '' : 'ies'}`);
  if (card.dataCompatibility.status !== 'same-schema') parts.push('data review');
  return parts.length > 0 ? parts.join(' · ') : 'ready to update';
}

export function updateChips(card: UpdateCard): UpdateChip[] {
  const chips: UpdateChip[] = [];
  if (card.versionChanged) chips.push({ label: `v${card.receipt.version} to v${card.app.version}`, tone: 'neutral' });
  else if (card.packageHashChanged) chips.push({ label: 'Code refreshed', tone: 'safe' });
  if (!card.kindChanged && card.addedPermissions.length === 0 && card.addedNetworkDomains.length === 0) {
    chips.push({ label: 'Same access', tone: 'safe' });
  }
  if (card.dataCompatibility.status === 'same-schema') {
    chips.push({ label: 'Same data', tone: 'safe' });
  } else {
    chips.push({ label: card.dataCompatibility.summary, tone: 'attention' });
  }
  if (card.addedNetworkDomains.length > 0) {
    chips.push({ label: `${card.addedNetworkDomains.length} new domain${card.addedNetworkDomains.length === 1 ? '' : 's'}`, tone: 'attention' });
  }
  if (card.addedPermissions.length > 0) {
    chips.push({ label: `${card.addedPermissions.length} new capability${card.addedPermissions.length === 1 ? '' : 'ies'}`, tone: 'attention' });
  }
  return chips.slice(0, 4);
}
