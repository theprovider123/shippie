/**
 * Auto-fire texture rule. Attaches delegated listeners at the document
 * level (one set, not per-element) so it costs nothing as the DOM grows.
 *
 * Maker apps register this rule against `*` in shippie.json to opt in;
 * the wrapper bootstrap also registers it by default. The rule is
 * page-global, not per-element. Apply runs once.
 *
 *   button click       → confirm
 *   toggle/switch click → toggle
 *   form submit        → complete
 *   form field invalid → error
 *   [data-shippie-action="delete"] → delete
 *   window appinstalled → install (the signature moment)
 */
import type { EnhanceRule } from '../types.ts';
import { fireTexture, registerBuiltinTextures } from '../../textures/index.ts';

const BUTTON_SELECTOR =
  'button, [role="button"], a[role="button"], input[type="submit"], input[type="button"]';
const TOGGLE_SELECTOR =
  '[role="switch"], input[type="checkbox"], input[type="radio"], [aria-pressed]';
const DELETE_SELECTOR = '[data-shippie-action="delete"]';

let installed = false;

export const texturesRule: EnhanceRule = {
  name: 'textures',
  capabilities: [],
  apply() {
    if (installed) return () => {};
    installed = true;
    registerBuiltinTextures();

    if (typeof document === 'undefined') {
      return () => {
        installed = false;
      };
    }

    const onClick = (e: Event) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      const deleteEl = target.closest(DELETE_SELECTOR);
      if (deleteEl) {
        fireTexture('delete', deleteEl);
        return;
      }
      const toggleEl = target.closest(TOGGLE_SELECTOR);
      if (toggleEl) {
        fireTexture('toggle', toggleEl);
        return;
      }
      const btnEl = target.closest(BUTTON_SELECTOR);
      if (btnEl) {
        fireTexture('confirm', btnEl);
      }
    };
    const onSubmit = (e: Event) => {
      const target = e.target instanceof Element ? e.target : null;
      fireTexture('complete', target);
    };
    const onInvalid = (e: Event) => {
      const target = e.target instanceof Element ? e.target : null;
      fireTexture('error', target);
    };
    const onAppInstalled = () => {
      fireTexture('install', document.body);
    };

    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    // `invalid` doesn't bubble — capture phase to catch it.
    document.addEventListener('invalid', onInvalid, true);
    if (typeof window !== 'undefined') {
      window.addEventListener('appinstalled', onAppInstalled);
    }

    return () => {
      installed = false;
      document.removeEventListener('click', onClick);
      document.removeEventListener('submit', onSubmit);
      document.removeEventListener('invalid', onInvalid, true);
      if (typeof window !== 'undefined') {
        window.removeEventListener('appinstalled', onAppInstalled);
      }
    };
  },
};

/** Test seam: reset the install latch so `apply` can re-attach. */
export function _resetTexturesRuleForTest(): void {
  installed = false;
}
