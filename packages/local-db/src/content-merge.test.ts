import { describe, expect, test } from 'bun:test';
import { planContentMerge, type ContentRow, type BundleRow } from './content-merge.ts';

const bundleRow = (id: string, values: Record<string, unknown>): BundleRow => ({ id, values });

const localBundle = (id: string, values: Record<string, unknown>, version = 1): ContentRow => ({
  id,
  values,
  _origin: 'bundle',
  _bundleVersion: version,
  _userModified: false,
});

const localUser = (id: string, values: Record<string, unknown>): ContentRow => ({
  id,
  values,
  _origin: 'user',
});

describe('planContentMerge — additive', () => {
  test('inserts new bundle rows', () => {
    const plan = planContentMerge({
      local: [],
      bundle: [bundleRow('a', { title: 'Carbonara' }), bundleRow('b', { title: 'Ramen' })],
      bundleVersion: 7,
    });
    expect(plan.summary.inserted).toBe(2);
    const op = plan.ops[0]!;
    expect(op.kind).toBe('insert');
    if (op.kind === 'insert') {
      expect(op.row._origin).toBe('bundle');
      expect(op.row._bundleVersion).toBe(7);
    }
  });

  test('updates unmodified bundle rows', () => {
    const plan = planContentMerge({
      local: [localBundle('a', { title: 'Old' }, 6)],
      bundle: [bundleRow('a', { title: 'New' })],
      bundleVersion: 7,
    });
    expect(plan.summary.updated).toBe(1);
    const op = plan.ops[0]!;
    expect(op.kind).toBe('update');
    if (op.kind === 'update') {
      expect(op.id).toBe('a');
      expect(op.bundleVersion).toBe(7);
    }
  });
});

describe('planContentMerge — user data sacred', () => {
  test('user-modified bundle rows are NEVER updated; bundle version is shadowed', () => {
    const userEdited: ContentRow = {
      id: 'a',
      values: { title: 'My Carbonara' },
      _origin: 'bundle',
      _bundleVersion: 6,
      _userModified: true,
    };
    const plan = planContentMerge({
      local: [userEdited],
      bundle: [bundleRow('a', { title: 'Updated Carbonara' })],
      bundleVersion: 7,
    });
    expect(plan.summary.updated).toBe(0);
    expect(plan.summary.preservedUserEdits).toBe(1);
    const op = plan.ops[0]!;
    expect(op.kind).toBe('shadow_only');
    if (op.kind === 'shadow_only') {
      expect(op.id).toBe('a');
      expect(op.bundleVersion).toBe(7);
      expect(op.bundleValues.title).toBe('Updated Carbonara');
    }
  });

  test('user-origin rows are never touched even if id collides with bundle', () => {
    const plan = planContentMerge({
      local: [localUser('a', { title: 'User recipe' })],
      bundle: [bundleRow('a', { title: 'Maker recipe' })],
      bundleVersion: 7,
    });
    expect(plan.ops.length).toBe(0);
    expect(plan.summary.inserted).toBe(0);
    expect(plan.summary.updated).toBe(0);
  });
});

describe('planContentMerge — soft delete', () => {
  test('removed bundle rows soft-deleted, never hard-deleted', () => {
    const plan = planContentMerge({
      local: [localBundle('a', { title: 'Old' }), localBundle('b', { title: 'Stays' })],
      bundle: [bundleRow('b', { title: 'Stays' })],
      bundleVersion: 7,
    });
    expect(plan.summary.softDeleted).toBe(1);
    const op = plan.ops.find((o) => o.kind === 'soft_delete');
    expect(op?.kind).toBe('soft_delete');
    if (op && op.kind === 'soft_delete') {
      expect(op.id).toBe('a');
    }
  });

  test('soft delete does not happen for user-origin rows', () => {
    const plan = planContentMerge({
      local: [localUser('a', { title: 'Mine' })],
      bundle: [],
      bundleVersion: 7,
    });
    expect(plan.summary.softDeleted).toBe(0);
  });
});

describe('planContentMerge — combined', () => {
  test('mixed update + insert + preserve + soft-delete', () => {
    const plan = planContentMerge({
      local: [
        localBundle('a', { title: 'Carbonara' }), // updated cleanly
        {
          id: 'b',
          values: { title: 'My Tweaked Ramen' },
          _origin: 'bundle',
          _bundleVersion: 6,
          _userModified: true,
        }, // user edit, preserved
        localBundle('c', { title: 'Removed Recipe' }), // soft delete
        localUser('user-1', { title: 'My Stir Fry' }), // never touched
      ],
      bundle: [
        bundleRow('a', { title: 'Carbonara v2' }),
        bundleRow('b', { title: 'Ramen v2' }),
        bundleRow('d', { title: 'New Tacos' }),
      ],
      bundleVersion: 7,
    });
    expect(plan.summary).toEqual({
      inserted: 1,
      updated: 1,
      preservedUserEdits: 1,
      softDeleted: 1,
    });
  });
});
