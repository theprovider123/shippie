import { describe, expect, it } from 'vitest';
import { redactContactForGrant, searchContacts, type Contact } from './contacts';

const alice: Contact = {
  id: 'a',
  name: 'Alice',
  emails: ['a@example.com'],
  phones: ['+44 1'],
  notes: 'cool',
  tags: ['family'],
  lastTouchedAt: 100,
};

describe('redactContactForGrant', () => {
  it('always returns id + name', () => {
    const r = redactContactForGrant(alice, []);
    expect(r).toEqual({ id: 'a', name: 'Alice' });
  });

  it('returns only the granted fields', () => {
    const r = redactContactForGrant(alice, ['emails']);
    expect(r.emails).toEqual(['a@example.com']);
    expect(r.phones).toBeUndefined();
    expect(r.notes).toBeUndefined();
    expect(r.tags).toBeUndefined();
  });

  it('does not invent absent fields', () => {
    const minimal: Contact = { id: 'm', name: 'M' };
    const r = redactContactForGrant(minimal, ['emails', 'phones']);
    expect(r.emails).toBeUndefined();
    expect(r.phones).toBeUndefined();
  });
});

describe('searchContacts', () => {
  const all: Contact[] = [
    alice,
    { id: 'b', name: 'Bob', tags: ['work'], lastTouchedAt: 50 },
    { id: 'c', name: 'Carlos', tags: ['family'], lastTouchedAt: 200 },
  ];

  it('returns all contacts newest-touched-first on blank query', () => {
    const r = searchContacts('', all);
    expect(r.map((c) => c.id)).toEqual(['c', 'a', 'b']);
  });

  it('matches by name', () => {
    expect(searchContacts('ali', all).map((c) => c.id)).toEqual(['a']);
  });

  it('matches by tag', () => {
    expect(searchContacts('family', all).map((c) => c.id)).toEqual(['c', 'a']);
  });

  it('AND semantics across tokens', () => {
    expect(searchContacts('family alice', all).map((c) => c.id)).toEqual(['a']);
    expect(searchContacts('family bob', all)).toEqual([]);
  });
});
