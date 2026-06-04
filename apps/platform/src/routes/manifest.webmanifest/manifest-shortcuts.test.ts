import { describe, expect, it } from 'vitest';
import { GET } from './+server';

interface PlatformShortcut {
  name: string;
  short_name: string;
  url: string;
}

interface PlatformManifest {
  start_url: string;
  shortcuts: PlatformShortcut[];
}

describe('/manifest.webmanifest', () => {
  it('uses Dock / Tools / You / Ship shortcuts', async () => {
    const response = await GET({ url: new URL('https://shippie.app/manifest.webmanifest') } as never);
    const manifest = await response.json() as PlatformManifest;

    expect(manifest.start_url).toBe('/dock');
    expect(manifest.shortcuts.map((shortcut: { short_name: string }) => shortcut.short_name)).toEqual([
      'Dock',
      'Tools',
      'You',
      'Ship',
    ]);
    expect(JSON.stringify(manifest.shortcuts)).not.toContain('Data');
  });
});
