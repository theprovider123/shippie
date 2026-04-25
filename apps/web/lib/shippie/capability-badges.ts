import type { ProvenCapabilities } from './capability-proofs.ts';

export interface PublicCapabilityBadge {
  label: string;
  status: 'pass' | 'not_tested' | 'warn';
  proven?: boolean;
}

interface RawBadge {
  label?: unknown;
  status?: unknown;
}

export function publicCapabilityBadges(
  report: unknown,
  proofs?: ProvenCapabilities,
): PublicCapabilityBadge[] {
  const raw = readBadges(report);
  return raw
    .filter((badge): badge is { label: string; status: PublicCapabilityBadge['status'] } => {
      return typeof badge.label === 'string' && (badge.status === 'pass' || badge.status === 'not_tested' || badge.status === 'warn');
    })
    .filter((badge) => badge.status !== 'warn' || badge.label !== 'Works Offline')
    .map((badge) => overlayProof(badge, proofs))
    .slice(0, 5);
}

function overlayProof(badge: { label: string; status: PublicCapabilityBadge['status'] }, proofs?: ProvenCapabilities): PublicCapabilityBadge {
  if (!proofs) return { ...badge };
  const isProven = matchesProof(badge.label, proofs);
  if (!isProven) return { ...badge };
  return { label: badge.label, status: 'pass', proven: true };
}

function matchesProof(label: string, proofs: ProvenCapabilities): boolean {
  if (label === 'Local Database') return proofs.db;
  if (label === 'Local Files') return proofs.files;
  if (label === 'Local AI') return proofs.ai;
  if (label === 'Works Offline') return proofs.opfs && proofs.db;
  if (label === 'Privacy First') return proofs.opfs && !proofs.ai;
  return false;
}

function readBadges(report: unknown): RawBadge[] {
  if (!report || typeof report !== 'object') return [];
  const wrapper = 'wrapper_compat' in report ? (report as { wrapper_compat?: unknown }).wrapper_compat : report;
  if (!wrapper || typeof wrapper !== 'object') return [];
  const badges = (wrapper as { capability_badges?: unknown }).capability_badges;
  return Array.isArray(badges) ? badges : [];
}
