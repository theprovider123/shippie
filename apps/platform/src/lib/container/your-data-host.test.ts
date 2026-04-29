import { describe, expect, test, vi } from 'vitest';
import { createYourDataHost } from './your-data-host';

describe('createYourDataHost — A5 panel host', () => {
  test('starts closed', () => {
    const onChange = vi.fn();
    const host = createYourDataHost({ onChange });
    expect(host.state.open).toBe(false);
    expect(host.state.appId).toBe(null);
    expect(onChange).not.toHaveBeenCalled();
  });

  test('openFor sets state and notifies onChange', () => {
    const onChange = vi.fn();
    const host = createYourDataHost({ onChange });
    host.openFor('app_recipe_saver');
    expect(host.state.open).toBe(true);
    expect(host.state.appId).toBe('app_recipe_saver');
    expect(onChange).toHaveBeenCalledWith({ open: true, appId: 'app_recipe_saver' });
  });

  test('close resets state and notifies onChange', () => {
    const onChange = vi.fn();
    const host = createYourDataHost({ onChange });
    host.openFor('app_recipe_saver');
    host.close();
    expect(host.state.open).toBe(false);
    expect(host.state.appId).toBe(null);
    expect(onChange).toHaveBeenLastCalledWith({ open: false, appId: null });
  });

  test('openFor switches scope when a different app calls', () => {
    const onChange = vi.fn();
    const host = createYourDataHost({ onChange });
    host.openFor('app_recipe_saver');
    host.openFor('app_journal');
    expect(host.state.appId).toBe('app_journal');
    expect(onChange).toHaveBeenLastCalledWith({ open: true, appId: 'app_journal' });
  });
});
