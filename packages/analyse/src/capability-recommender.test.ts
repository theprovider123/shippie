import { describe, expect, test } from 'bun:test';
import { recommend } from './capability-recommender.ts';
import type { CategoryGuess, ElementInventory, FrameworkGuess } from './profile.ts';

const emptyInventory: ElementInventory = {
  buttons: 0,
  textInputs: { count: 0, names: [] },
  fileInputs: { count: 0, accepts: [] },
  lists: { count: 0, itemCounts: [] },
  images: 0,
  videos: 0,
  canvases: 0,
  forms: 0,
  links: 0,
};

const unknownCategory: CategoryGuess = { primary: 'unknown', confidence: 0, signals: [] };
const vanillaFramework: FrameworkGuess = {
  name: 'vanilla',
  version: null,
  hasRouter: false,
  hasServiceWorker: false,
};

describe('recommend', () => {
  test('always recommends textures on buttons', () => {
    const out = recommend(emptyInventory, unknownCategory, vanillaFramework);
    expect(out.enhance['button, [role="button"], input[type="submit"]']).toEqual(['textures']);
  });

  test('adds list textures when lists are present', () => {
    const inv = { ...emptyInventory, lists: { count: 2, itemCounts: [3, 4] } };
    const out = recommend(inv, unknownCategory, vanillaFramework);
    expect(out.enhance['ul > li, ol > li, [role="listitem"]']).toEqual(['textures']);
  });

  test('adds wakelock+textures when video or canvas is present', () => {
    const inv = { ...emptyInventory, videos: 1 };
    const out = recommend(inv, unknownCategory, vanillaFramework);
    expect(out.enhance['video, canvas']).toEqual(['wakelock', 'textures']);
  });

  test('cooking category aggressively wakes the screen', () => {
    const cat: CategoryGuess = { primary: 'cooking', confidence: 0.5, signals: ['recipe'] };
    const out = recommend(emptyInventory, cat, vanillaFramework);
    expect(out.enhance['canvas, [data-shippie-canvas], main']).toEqual(['wakelock']);
    expect(out.ambient.wakeLock).toBe('auto');
  });

  test('journal category enables AI sentiment + embed + classify', () => {
    const cat: CategoryGuess = { primary: 'journal', confidence: 0.6, signals: ['mood'] };
    const out = recommend(emptyInventory, cat, vanillaFramework);
    expect(out.ai).toEqual(['classify', 'embed', 'sentiment']);
  });

  test('non-journal categories disable AI by default', () => {
    const out = recommend(emptyInventory, unknownCategory, vanillaFramework);
    expect(out.ai).toBe(false);
  });

  test('framework with router adds anchor textures', () => {
    const framework: FrameworkGuess = { ...vanillaFramework, hasRouter: true };
    const out = recommend(emptyInventory, unknownCategory, framework);
    expect(out.enhance['a[href]']).toEqual(['textures']);
  });

  test('feel defaults: haptics + spring + scroll-bounce, sound off', () => {
    const out = recommend(emptyInventory, unknownCategory, vanillaFramework);
    expect(out.feel).toEqual({
      haptics: true,
      transitions: 'spring',
      scrollBounce: true,
      sound: false,
    });
  });

  test('multiple images opt into image textures', () => {
    const inv = { ...emptyInventory, images: 5 };
    const out = recommend(inv, unknownCategory, vanillaFramework);
    expect(out.enhance['img']).toEqual(['textures']);
  });

  test('single image does NOT opt in', () => {
    const inv = { ...emptyInventory, images: 1 };
    const out = recommend(inv, unknownCategory, vanillaFramework);
    expect(out.enhance['img']).toBeUndefined();
  });
});
