/**
 * Public-listing gate — determines whether an app is allowed to reach
 * `visibility=public` on the marketplace. Unlisted/private apps can
 * ship without these fields; public ones require the basics a real user
 * needs to file a complaint, read a privacy policy, or contact support.
 *
 * Spec v6 §9 (trust — privacy + support surfaces required for public listing).
 */

import type { ShippieJson } from '@shippie/shared';

export interface PublicListingGateInput {
  manifest: ShippieJson;
  /** Intended visibility after deploy. */
  visibility: 'public' | 'unlisted' | 'private_org' | 'private_link';
}

export interface PublicListingGateResult {
  allowed: boolean;
  violations: Array<{ field: string; message: string }>;
}

export function checkPublicListingGate(input: PublicListingGateInput): PublicListingGateResult {
  const violations: Array<{ field: string; message: string }> = [];

  // Only public listings trigger the gate. Everything else ships.
  if (input.visibility !== 'public') {
    return { allowed: true, violations: [] };
  }

  const m = input.manifest;
  const meta = m.store_metadata ?? {};

  if (!meta.support_url) {
    violations.push({
      field: 'store_metadata.support_url',
      message: 'Public apps need store_metadata.support_url in shippie.json so users can report issues',
    });
  }

  if (!meta.privacy_url) {
    violations.push({
      field: 'store_metadata.privacy_url',
      message: 'Public apps need store_metadata.privacy_url (or opt-in to Shippie\'s standard privacy page)',
    });
  }

  if (!m.category) {
    violations.push({
      field: 'category',
      message: 'Public apps need a category for discovery + age rating',
    });
  }

  if (!m.description || m.description.trim().length < 20) {
    violations.push({
      field: 'description',
      message: 'Public apps need a description of at least 20 characters',
    });
  }

  return {
    allowed: violations.length === 0,
    violations,
  };
}
