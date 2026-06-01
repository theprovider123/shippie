/**
 * Phase 4 — shared open-state for the mobile tool switcher sheet. The global
 * BottomDock "Tools" tab sets this; the /workspace route mounts the sheet and
 * binds its open state here (a small store beats a custom DOM event and matches
 * the existing svelte-store pattern).
 */
import { writable } from 'svelte/store';

export const switcherOpen = writable(false);
