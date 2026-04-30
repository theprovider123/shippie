/**
 * Toast store: timing, manual dismiss, ordering.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { get } from 'svelte/store';
import { toast } from './toast';

describe('toast store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    toast.clear();
  });
  afterEach(() => {
    toast.clear();
    vi.useRealTimers();
  });

  test('push returns an id and adds the toast', () => {
    const id = toast.push({ kind: 'success', message: 'hi' });
    expect(id).toBeTruthy();
    const list = get(toast);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(id);
    expect(list[0]?.message).toBe('hi');
    expect(list[0]?.kind).toBe('success');
  });

  test('auto-expires after default 4000ms', () => {
    toast.push({ kind: 'success', message: 'gone soon' });
    expect(get(toast)).toHaveLength(1);
    vi.advanceTimersByTime(3999);
    expect(get(toast)).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(get(toast)).toHaveLength(0);
  });

  test('respects custom durationMs', () => {
    toast.push({ kind: 'info', message: 'short', durationMs: 1000 });
    vi.advanceTimersByTime(1000);
    expect(get(toast)).toHaveLength(0);
  });

  test('durationMs: 0 is sticky — never auto-dismisses', () => {
    toast.push({ kind: 'info', message: 'sticky', durationMs: 0 });
    vi.advanceTimersByTime(60_000);
    expect(get(toast)).toHaveLength(1);
  });

  test('manual dismiss removes immediately', () => {
    const id = toast.push({ kind: 'error', message: 'boom' });
    expect(get(toast)).toHaveLength(1);
    toast.dismiss(id);
    expect(get(toast)).toHaveLength(0);
  });

  test('concurrent pushes maintain insertion order', () => {
    toast.push({ kind: 'success', message: 'first' });
    toast.push({ kind: 'success', message: 'second' });
    toast.push({ kind: 'success', message: 'third' });
    const list = get(toast);
    expect(list.map((t) => t.message)).toEqual(['first', 'second', 'third']);
  });

  test('dismissing the middle toast keeps the others in order', () => {
    const a = toast.push({ kind: 'info', message: 'a' });
    const b = toast.push({ kind: 'info', message: 'b' });
    const c = toast.push({ kind: 'info', message: 'c' });
    toast.dismiss(b);
    const list = get(toast);
    expect(list.map((t) => t.id)).toEqual([a, c]);
  });

  test('clear removes everything and cancels timers', () => {
    toast.push({ kind: 'success', message: 'x' });
    toast.push({ kind: 'success', message: 'y' });
    toast.clear();
    expect(get(toast)).toHaveLength(0);
    // Advancing time should not resurrect anything.
    vi.advanceTimersByTime(10_000);
    expect(get(toast)).toHaveLength(0);
  });
});
