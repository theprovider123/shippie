import { describe, expect, it, beforeEach, mock } from 'bun:test';
import { Window } from 'happy-dom';
import { texturesRule, _resetTexturesRuleForTest } from './textures.ts';
import {
  _resetTextureEngineForTest,
  configureTextureEngine,
} from '../../textures/engine.ts';
import { _resetBuiltinRegistrationForTest } from '../../textures/index.ts';

function installFakeDom() {
  const win = new Window();
  const g = globalThis as Record<string, unknown>;
  g.document = win.document;
  g.window = win;
  // Bun has no DOM globals. The rule uses `e.target instanceof Element`,
  // which throws TypeError if Element is undefined — happy-dom's
  // dispatchEvent swallows the throw and the handler exits silently. Set
  // every DOM constructor the rule (or anything it touches) might use.
  g.Element = win.Element;
  g.Event = win.Event;
  g.Node = win.Node;
  // Force-override rAF: happy-dom may provide one that never fires in tests.
  g.requestAnimationFrame = (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  };
  return win;
}

beforeEach(() => {
  _resetTexturesRuleForTest();
  _resetTextureEngineForTest();
  _resetBuiltinRegistrationForTest();
});

describe('textures rule', () => {
  it('fires confirm on a button click', async () => {
    const win = installFakeDom();
    const vibrate = mock((_p: number | number[]) => true);
    (globalThis as unknown as { navigator: { vibrate: typeof vibrate } }).navigator = { vibrate };

    win.document.body.innerHTML = '<button id="b">go</button>';
    const teardown = texturesRule.apply(win.document.body as unknown as Element);
    // Disable visuals so happy-dom doesn't have to support requestAnimationFrame on layout.
    configureTextureEngine({ visuals: false });

    win.document
      .getElementById('b')!
      .dispatchEvent(new win.Event('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));

    expect(vibrate).toHaveBeenCalledWith(12);
    if (typeof teardown === 'function') teardown();
  });

  it('fires toggle on a checkbox click', async () => {
    const win = installFakeDom();
    const vibrate = mock((_p: number | number[]) => true);
    (globalThis as unknown as { navigator: { vibrate: typeof vibrate } }).navigator = { vibrate };

    win.document.body.innerHTML = '<input type="checkbox" id="c" />';
    const teardown = texturesRule.apply(win.document.body as unknown as Element);
    configureTextureEngine({ visuals: false });

    win.document
      .getElementById('c')!
      .dispatchEvent(new win.Event('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));

    expect(vibrate).toHaveBeenCalledWith(10);
    if (typeof teardown === 'function') teardown();
  });

  it('fires error on an invalid event', async () => {
    const win = installFakeDom();
    const vibrate = mock((_p: number | number[]) => true);
    (globalThis as unknown as { navigator: { vibrate: typeof vibrate } }).navigator = { vibrate };

    win.document.body.innerHTML = '<form><input id="i" required /></form>';
    const teardown = texturesRule.apply(win.document.body as unknown as Element);
    configureTextureEngine({ visuals: false });

    win.document.getElementById('i')!.dispatchEvent(new win.Event('invalid'));
    await new Promise((r) => setTimeout(r, 30));

    expect(vibrate).toHaveBeenCalled();
    if (typeof teardown === 'function') teardown();
  });

  it('fires delete on a [data-shippie-action="delete"] click', async () => {
    const win = installFakeDom();
    const vibrate = mock((_p: number | number[]) => true);
    (globalThis as unknown as { navigator: { vibrate: typeof vibrate } }).navigator = { vibrate };

    win.document.body.innerHTML = '<button data-shippie-action="delete" id="d">x</button>';
    const teardown = texturesRule.apply(win.document.body as unknown as Element);
    configureTextureEngine({ visuals: false });

    win.document
      .getElementById('d')!
      .dispatchEvent(new win.Event('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 30));

    expect(vibrate).toHaveBeenCalledWith(60);
    if (typeof teardown === 'function') teardown();
  });
});
