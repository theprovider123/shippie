import { describe, expect, it } from 'vitest';
import { containerAppToToolDisplay, launcherAppToToolDisplay } from './adapters';
import type { ContainerApp } from '$lib/container/state';
import { SHIPPIE_PERMISSIONS_SCHEMA } from '@shippie/app-package-contract';

describe('launcherAppToToolDisplay', () => {
  it('prefers tagline as blurb, falls back to description', () => {
    expect(
      launcherAppToToolDisplay({
        slug: 'a',
        name: 'A',
        tagline: 'tag',
        description: 'desc',
        themeColor: '#000',
      }).blurb,
    ).toBe('tag');

    expect(
      launcherAppToToolDisplay({
        slug: 'a',
        name: 'A',
        tagline: null,
        description: 'desc',
        themeColor: '#000',
      }).blurb,
    ).toBe('desc');
  });

  it('treats absent badges as an empty array', () => {
    const result = launcherAppToToolDisplay({
      slug: 'a',
      name: 'A',
      themeColor: '#000',
    });
    expect(result.badges).toEqual([]);
    expect(result.firstPartySigned).toBe(false);
  });
});

describe('containerAppToToolDisplay', () => {
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
    const result = containerAppToToolDisplay(baseContainerApp);
    expect(result.themeColor).toBe('#cc4444');
    expect(result.glyph).toBe('⊕');
    expect(result.iconUrl).toBeNull();
  });

  it('propagates visibility into the tier field', () => {
    expect(containerAppToToolDisplay(baseContainerApp).tier).toBe('private');
    expect(
      containerAppToToolDisplay({ ...baseContainerApp, visibility: 'public' }).tier,
    ).toBe('public');
    expect(
      containerAppToToolDisplay({ ...baseContainerApp, visibility: undefined }).tier,
    ).toBe('public');
  });
});
