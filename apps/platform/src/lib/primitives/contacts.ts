/**
 * Shared Contacts primitive (Tranche 3).
 *
 * Capability: `contacts.read` (with field-level scoping) and
 * `contacts.write`. Storage is on-device IndexedDB (the user's own
 * device, not Shippie infrastructure). The picker UI is supplied by
 * the container; apps never see contacts they were not granted.
 *
 * 5A foundation: pure shape + field filter + scoring. The IDB-backed
 * store and the bridge handler land as separate patches; this module
 * defines the contract every consumer must satisfy.
 */

export interface Contact {
  id: string;
  /** Display name. */
  name: string;
  emails?: string[];
  phones?: string[];
  /** Free-form notes the user attaches. */
  notes?: string;
  /** ms — when the user last interacted with the contact. */
  lastTouchedAt?: number;
  /** Optional tags the user adds. */
  tags?: string[];
}

export type ContactField = 'name' | 'emails' | 'phones' | 'notes' | 'tags';

/**
 * Field-level redaction. Apps with `contacts.read` get only the
 * fields named in their grant. `name` is always allowed when the
 * user picks a contact (otherwise the picker UI would be useless),
 * but the redactor still strips other fields.
 */
export function redactContactForGrant(
  contact: Contact,
  allowedFields: readonly ContactField[],
): Partial<Contact> & { id: string; name: string } {
  const out: Partial<Contact> & { id: string; name: string } = {
    id: contact.id,
    name: contact.name,
  };
  const allowed = new Set<ContactField>(allowedFields);
  if (allowed.has('emails') && contact.emails) out.emails = contact.emails;
  if (allowed.has('phones') && contact.phones) out.phones = contact.phones;
  if (allowed.has('notes') && contact.notes) out.notes = contact.notes;
  if (allowed.has('tags') && contact.tags) out.tags = contact.tags;
  return out;
}

/**
 * Picker-side search. Returns contacts whose name or tag contains
 * every token, ordered by recent-interaction descending.
 */
export function searchContacts(query: string, contacts: readonly Contact[]): Contact[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return contacts
      .slice()
      .sort((a, b) => (b.lastTouchedAt ?? 0) - (a.lastTouchedAt ?? 0));
  }
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  return contacts
    .filter((c) => {
      const haystack = [c.name, ...(c.tags ?? [])].join(' ').toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    })
    .sort((a, b) => (b.lastTouchedAt ?? 0) - (a.lastTouchedAt ?? 0));
}
