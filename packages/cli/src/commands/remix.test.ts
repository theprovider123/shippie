import { describe, expect, test } from 'bun:test';
import { buildRemixClonePlan, cloneRemixSource } from './remix';
import type { RemixHandoff } from '@shippie/core';

const baseRemix: RemixHandoff = {
  slug: 'snake',
  targetSlug: 'snake-remix',
  name: 'Snake',
  tagline: null,
  sourceRepo: 'https://github.com/theprovider123/shippie/tree/main/apps/showcase-snake',
  source: {
    webUrl: 'https://github.com/theprovider123/shippie/tree/main/apps/showcase-snake',
    cloneUrl: 'https://github.com/theprovider123/shippie.git',
    forkUrl: 'https://github.com/theprovider123/shippie/fork',
    owner: 'theprovider123',
    repo: 'shippie',
    ref: 'main',
    path: 'apps/showcase-snake',
  },
  license: 'AGPL-3.0-or-later',
  latestVersion: null,
  forkUrl: 'https://github.com/theprovider123/shippie/fork',
  deploy: {
    cli: 'shippie deploy ./dist --slug snake-remix --remix snake',
    mcp: {
      tool: 'deploy',
      arguments: {
        directory: '/absolute/path/to/dist',
        slug: 'snake-remix',
        remix_from: 'snake',
      },
    },
    workspace: {
      slug: 'snake-remix',
      directory: 'dist',
      remixFrom: 'snake',
    },
  },
};

describe('remix clone workflow', () => {
  test('builds a sparse clone plan for first-party monorepo paths', () => {
    const plan = buildRemixClonePlan(baseRemix, true, '/tmp');

    expect(plan.cloneArgs).toEqual([
      'clone',
      '--filter=blob:none',
      '--sparse',
      '--branch',
      'main',
      'https://github.com/theprovider123/shippie.git',
      'snake-remix',
    ]);
    expect(plan.sparseArgs).toEqual(['sparse-checkout', 'set', 'apps/showcase-snake']);
    expect(plan.workspaceDirectory).toBe('apps/showcase-snake/dist');
    expect(plan.commands).toContain('cd snake-remix/apps/showcase-snake');
    expect(plan.commands).toContain('shippie deploy ./dist --slug snake-remix --remix snake');
  });

  test('runs clone, sparse checkout, and writes workspace metadata', () => {
    const runs: Array<{ command: string; args: string[]; cwd?: string }> = [];
    const writes: Record<string, string> = {};

    const plan = cloneRemixSource(baseRemix, 'local-snake', {
      cwd: '/tmp',
      exists: () => false,
      run: (command, args, opts) => runs.push({ command, args, cwd: opts?.cwd }),
      writeFile: (path, data) => {
        writes[path] = data;
      },
    });

    expect(runs).toEqual([
      {
        command: 'git',
        args: [
          'clone',
          '--filter=blob:none',
          '--sparse',
          '--branch',
          'main',
          'https://github.com/theprovider123/shippie.git',
          'local-snake',
        ],
        cwd: '/tmp',
      },
      {
        command: 'git',
        args: ['sparse-checkout', 'set', 'apps/showcase-snake'],
        cwd: '/tmp/local-snake',
      },
    ]);
    expect(writes[plan.workspacePath]).toContain('"slug": "snake-remix"');
    expect(writes[plan.workspacePath]).toContain('"directory": "apps/showcase-snake/dist"');
    expect(writes[plan.workspacePath]).toContain('"remixFrom": "snake"');
  });
});
