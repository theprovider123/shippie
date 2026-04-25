import { describe, expect, test } from 'bun:test';
import { analyseApp } from './index.ts';

const enc = (s: string) => new TextEncoder().encode(s);

describe('analyseApp integration', () => {
  test('synthetic recipe app → cooking + wakelock + spring transitions', async () => {
    const files = new Map<string, Uint8Array>();
    files.set('index.html', enc(`
      <!doctype html>
      <html><head>
        <title>Recipe Saver</title>
        <link rel="apple-touch-icon" href="/apple-touch-icon.png">
      </head>
      <body>
        <h1>Your recipes</h1>
        <ul>
          <li>Carbonara</li>
          <li>Risotto</li>
        </ul>
        <button>Add recipe</button>
        <video autoplay></video>
        <p>Save recipes. Add ingredients, set the oven, cook your meal.</p>
      </body></html>
    `));
    files.set('style.css', enc(`
      body { background: #FAF7EF; font-family: 'Inter', sans-serif; }
      .accent { color: #E8603C; }
      .accent-bg { background: #E8603C; }
    `));
    files.set('app.js', enc(`import { createApp } from 'vue'; createApp({}).mount('#app');`));

    const profile = await analyseApp({ files });

    expect(profile.inferredName).toBe('Recipe Saver');
    expect(profile.category.primary).toBe('cooking');
    expect(profile.elements.buttons).toBe(1);
    expect(profile.elements.lists.count).toBe(1);
    expect(profile.elements.videos).toBe(1);
    expect(profile.design.primaryColor?.toLowerCase()).toBe('#e8603c');
    expect(profile.design.backgroundColor?.toLowerCase()).toBe('#faf7ef');
    expect(profile.design.fontFamily).toBe('Inter');
    expect(profile.design.iconHrefs).toContain('/apple-touch-icon.png');
    expect(profile.framework.name).toBe('vue');
    expect(profile.wasm.detected).toBe(false);
    // Cooking → aggressive screen wake.
    expect(profile.recommended.enhance['canvas, [data-shippie-canvas], main']).toEqual(['wakelock']);
    // Video present → wakelock + textures on video/canvas.
    expect(profile.recommended.enhance['video, canvas']).toEqual(['wakelock', 'textures']);
    // Cooking → ambient wakelock auto.
    expect(profile.recommended.ambient.wakeLock).toBe('auto');
  });

  test('synthetic Rust-WASM app → framework wasm + headers set', async () => {
    const files = new Map<string, Uint8Array>();
    files.set('index.html', enc(`<!doctype html><title>WASM Demo</title><body><canvas></canvas></body>`));
    files.set('pkg/main.wasm', new Uint8Array([0, 0, 0, 0]));

    const profile = await analyseApp({ files });

    expect(profile.framework.name).toBe('wasm');
    expect(profile.wasm.detected).toBe(true);
    expect(profile.wasm.files).toEqual(['pkg/main.wasm']);
    expect(profile.wasm.headers['Content-Type']).toBe('application/wasm');
    expect(profile.wasm.headers['Cross-Origin-Embedder-Policy']).toBe('require-corp');
    expect(profile.wasm.headers['Cross-Origin-Opener-Policy']).toBe('same-origin');
  });

  test('empty bundle → defaults all the way down', async () => {
    const profile = await analyseApp({ files: new Map() });
    expect(profile.inferredName).toBe('Untitled');
    expect(profile.category.primary).toBe('unknown');
    expect(profile.framework.name).toBeNull();
    expect(profile.wasm.detected).toBe(false);
    expect(profile.elements.buttons).toBe(0);
    // Even with no inventory, we always recommend textures on buttons.
    expect(profile.recommended.enhance['button, [role="button"], input[type="submit"]']).toEqual(['textures']);
  });

  test('JSON.stringify round-trip preserves the profile', async () => {
    const files = new Map<string, Uint8Array>();
    files.set('index.html', enc(`<title>X</title><button>a</button>`));
    const profile = await analyseApp({ files });
    const round = JSON.parse(JSON.stringify(profile));
    expect(round).toEqual(profile);
  });
});
