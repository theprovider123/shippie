import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ShippieJson } from '@shippie/shared';
import type { PreflightReport } from '@/lib/preflight';
import { buildWrapperCompatibilityReport } from './wrapper-compat-report';

const manifest: ShippieJson = {
  version: 1,
  slug: 'recipes',
  type: 'app',
  name: 'Recipes',
  category: 'food',
  theme_color: '#E8603C',
  pwa: { display: 'standalone', categories: ['food'] },
};

const preflight: PreflightReport = {
  passed: true,
  findings: [],
  remediations: [],
  warnings: [],
  blockers: [],
  durationMs: 1,
};

test('wrapper compatibility report records green hosted-app basics', () => {
  const report = buildWrapperCompatibilityReport({
    manifest,
    preflight,
    files: new Map([
      ['index.html', Buffer.from('<h1>Hi</h1>')],
      ['app.js', Buffer.from('console.log("hi")')],
    ]),
    icon: { sourcePath: 'manifest-icon.png', generated: true },
    trust: {
      passed: true,
      blockers: [],
      warnings: [],
      malware: { passed: true, blockers: [], warnings: [] },
      domains: { hits: [], uniqueDomains: [] },
      gate: { allowed: true, violations: [] },
      csp: {
        header: "default-src 'self'",
        metaTag: '<meta>',
        connectSrc: ["'self'"],
        frameSrc: ['https://ai.shippie.app'],
        reason: 'tight-by-default',
      },
    },
  });

  assert.equal(report.summary.status, 'pass');
  assert.equal(report.service_worker.mode, 'shippie_root');
  assert.equal(report.manifest.icon.generated, true);
  assert.equal(report.offline.html_entry, true);
  assert.equal(report.storage.status, 'not_tested');
  assert.deepEqual(report.capability_badges.map((badge) => badge.label), ['Works Offline', 'Privacy First']);
});

test('wrapper compatibility report carries service worker conflicts', () => {
  const report = buildWrapperCompatibilityReport({
    manifest,
    preflight: {
      ...preflight,
      passed: false,
      blockers: [
        {
          rule: 'service-worker-ownership',
          severity: 'block',
          title: 'conflict',
          metadata: { files: ['sw.js'] },
        },
      ],
    },
    files: new Map([['index.html', Buffer.from('<h1>Hi</h1>')]]),
    icon: { generated: false },
    trust: {
      passed: true,
      blockers: [],
      warnings: [],
      malware: { passed: true, blockers: [], warnings: [] },
      domains: { hits: [], uniqueDomains: [] },
      gate: { allowed: true, violations: [] },
      csp: {
        header: "default-src 'self'",
        metaTag: '<meta>',
        connectSrc: ["'self'"],
        frameSrc: ['https://ai.shippie.app'],
        reason: 'tight-by-default',
      },
    },
  });

  assert.equal(report.summary.status, 'block');
  assert.equal(report.service_worker.mode, 'blocked_maker_root');
  assert.deepEqual(report.service_worker.conflicts, ['sw.js']);
  assert.equal(report.capability_badges.find((badge) => badge.label === 'Works Offline')?.status, 'warn');
});

test('wrapper compatibility report derives local runtime capability badges from manifest intent', () => {
  const report = buildWrapperCompatibilityReport({
    manifest: {
      ...manifest,
      permissions: {
        storage: 'rw',
        files: true,
        native_bridge: ['local-ai:embeddings'],
      },
    },
    preflight,
    files: new Map([['index.html', Buffer.from('<h1>Hi</h1>')]]),
    icon: { sourcePath: 'icon.png', generated: true },
    trust: {
      passed: true,
      blockers: [],
      warnings: [],
      malware: { passed: true, blockers: [], warnings: [] },
      domains: { hits: [], uniqueDomains: [] },
      gate: { allowed: true, violations: [] },
      csp: {
        header: "default-src 'self'",
        metaTag: '<meta>',
        connectSrc: ["'self'"],
        frameSrc: ['https://ai.shippie.app'],
        reason: 'tight-by-default',
      },
    },
  });

  assert.deepEqual(
    report.capability_badges.map((badge) => [badge.label, badge.status]),
    [
      ['Works Offline', 'pass'],
      ['Local Database', 'not_tested'],
      ['Local Files', 'not_tested'],
      ['Local AI', 'not_tested'],
      ['Privacy First', 'pass'],
    ],
  );
});
