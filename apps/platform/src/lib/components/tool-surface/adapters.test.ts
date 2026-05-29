import { describe, expect, it } from 'vitest';
import { containerAppToToolTile, launcherAppToToolTile } from './adapters';
import type { ContainerApp } from '$lib/container/state';
import { SHIPPIE_PERMISSIONS_SCHEMA } from '@shippie/app-package-contract';

describe('launcherAppToToolTile', () => {
  it('prefers tagline as blurb, falls back to description', () => {
    expect(
      launcherAppToToolTile({
        slug: 'a',
        name: 'A',
        tagline: 'tag',
        description: 'desc',
        themeColor: '#000',
      }).blurb,
    ).toBe('tag');

    expect(
      launcherAppToToolTile({
        slug: 'a',
        name: 'A',
        tagline: null,
        description: 'desc',
        themeColor: '#000',
      }).blurb,
    ).toBe('desc');
  });

  it('treats absent badges as an empty array', () => {
    const result = launcherAppToToolTile({
      slug: 'a',
      name: 'A',
      themeColor: '#000',
    });
    expect(result.badges).toEqual([]);
    expect(result.firstPartySigned).toBe(false);
  });
});

describe('containerAppToToolTile', () => {
  const baseContainerApp: ContainerApp = {
    id: 'app:tap',
    slug: 'tap',
    name: 'Tap Counter',
    shortName: 'Tap',
    description: 'Count taps',
    appKind: 'local',
    entry: 'index.html',
    labelKind: 'Local',
    icon: '⊕',
    accent: '#cc4444',
    version: '1.0.0',
    packageHash: 'sha:0',
    standaloneUrl: '/run/tap/',
    visibility: 'private',
    permissions: {
      schema: SHIPPIE_PERMISSIONS_SCHEMA,
      capabilities: {},
    },
  };

  it('uses accent as themeColor and surfaces the glyph', () => {
    const result = containerAppToToolTile(baseContainerApp);
    expect(result.themeColor).toBe('#cc4444');
    expect(result.glyph).toBe('⊕');
    expect(result.iconUrl).toBeNull();
  });

  it('propagates visibility into the tier field', () => {
    expect(containerAppToToolTile(baseContainerApp).tier).toBe('private');
    expect(
      containerAppToToolTile({ ...baseContainerApp, visibility: 'public' }).tier,
    ).toBe('public');
    expect(
      containerAppToToolTile({ ...baseContainerApp, visibility: undefined }).tier,
    ).toBe('public');
  });
});
