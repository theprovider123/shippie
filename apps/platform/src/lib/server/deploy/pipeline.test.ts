import { describe, expect, test } from 'vitest';
import { containerEligibilityFromDeployReport, injectEssentials } from './pipeline';
import type { ShippieJsonLite } from './manifest';
import type { DeployReport } from './deploy-report';

const manifest = {
  name: 'Recipe Saver',
  description: 'Save & cook your recipes offline.',
  tagline: 'Local-first recipe app',
  theme_color: '#E8603C',
  type: 'app',
  category: 'cooking',
} as unknown as ShippieJsonLite;

const CSP_META = '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'">';

describe('injectEssentials', () => {
  test('injects CSP meta into <head>', () => {
    const out = injectEssentials('<html><head></head><body></body></html>', CSP_META, manifest);
    expect(out).toContain('Content-Security-Policy');
  });

  test('adds viewport meta when missing', () => {
    const out = injectEssentials('<html><head></head><body></body></html>', CSP_META, manifest);
    expect(out).toContain('name="viewport"');
    expect(out).toContain('width=device-width');
  });

  test('does not duplicate viewport meta when maker provided one', () => {
    const html =
      '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head></html>';
    const out = injectEssentials(html, CSP_META, manifest);
    const matches = out.match(/name="viewport"/g);
    expect(matches?.length).toBe(1);
  });

  test('adds charset utf-8 when missing', () => {
    const out = injectEssentials('<html><head></head></html>', CSP_META, manifest);
    expect(out).toContain('charset="utf-8"');
  });

  test('does not add charset when maker provided one', () => {
    const out = injectEssentials(
      '<html><head><meta charset="utf-8"></head></html>',
      CSP_META,
      manifest,
    );
    const matches = out.match(/charset=/g);
    expect(matches?.length).toBe(1);
  });

  test('adds lang to <html> when missing', () => {
    const out = injectEssentials('<html><head></head></html>', CSP_META, manifest);
    expect(out).toContain('<html lang="en">');
  });

  test('does not overwrite lang when present', () => {
    const out = injectEssentials('<html lang="fr"><head></head></html>', CSP_META, manifest);
    expect(out).toContain('<html lang="fr">');
    expect(out).not.toContain('<html lang="en">');
  });

  test('adds OG tags from manifest when missing', () => {
    const out = injectEssentials('<html><head></head></html>', CSP_META, manifest);
    expect(out).toContain('property="og:title"');
    expect(out).toContain('Recipe Saver');
    expect(out).toContain('property="og:description"');
    expect(out).toContain('og:type');
  });

  test('does not inject OG tags when maker already has them', () => {
    const html = '<html><head><meta property="og:title" content="My App"></head></html>';
    const out = injectEssentials(html, CSP_META, manifest);
    const matches = out.match(/property="og:title"/g);
    expect(matches?.length).toBe(1);
    expect(out).not.toContain('Recipe Saver');
  });

  test('adds theme-color when missing', () => {
    const out = injectEssentials('<html><head></head></html>', CSP_META, manifest);
    expect(out).toContain('name="theme-color"');
    expect(out).toContain('#E8603C');
  });

  test('adds favicon hints when missing', () => {
    const out = injectEssentials('<html><head></head></html>', CSP_META, manifest);
    expect(out).toContain('rel="icon"');
    expect(out).toContain('/__shippie/icons/32.png');
    expect(out).toContain('rel="apple-touch-icon"');
  });

  test('does not add favicon hints when maker provided one', () => {
    const html = '<html><head><link rel="icon" href="/favicon.ico"></head></html>';
    const out = injectEssentials(html, CSP_META, manifest);
    expect(out).toContain('/favicon.ico');
    expect(out).not.toContain('/__shippie/icons/32.png');
  });

  test('escapes special chars in attribute values', () => {
    const dangerous = {
      ...manifest,
      name: 'My "App" & <Co>',
      description: 'A description',
    } as unknown as ShippieJsonLite;
    const out = injectEssentials('<html><head></head></html>', CSP_META, dangerous);
    expect(out).toContain('&quot;App&quot;');
    expect(out).toContain('&amp;');
    expect(out).toContain('&lt;Co&gt;');
  });
});

function reportFor(
  overrides: Partial<Pick<DeployReport, 'kind' | 'security' | 'privacy'>> = {},
): Pick<DeployReport, 'kind' | 'security' | 'privacy'> {
  return {
    kind: {
      detected: 'local',
      declared: undefined,
      public: 'local',
      publicStatus: 'estimated',
      confidence: 0.9,
      reasons: [],
    },
    security: {
      findings: [],
      blocks: 0,
      warns: 0,
      infos: 0,
      scannedFiles: 1,
      score: { value: 100, deductions: [], blocks: 0 },
    },
    privacy: {
      domains: [],
      counts: {
        tracker: 0,
        feature: 0,
        cdn: 0,
        shippie: 0,
        'same-origin': 0,
        unknown: 0,
      },
      scannedFiles: 1,
      grade: {
        grade: 'A+',
        reason: 'No external network use detected. Everything stays on the device.',
        counts: {
          tracker: 0,
          feature: 0,
          cdn: 0,
          shippie: 0,
          'same-origin': 0,
          unknown: 0,
        },
      },
    },
    ...overrides,
  };
}

describe('containerEligibilityFromDeployReport', () => {
  test('marks clean Local/Connected apps as compatible', () => {
    expect(containerEligibilityFromDeployReport(reportFor())).toBe('compatible');
    expect(
      containerEligibilityFromDeployReport(
        reportFor({
          kind: {
            ...reportFor().kind,
            detected: 'connected',
            public: 'connected',
            reasons: ['declared external feature host'],
          },
          privacy: {
            ...reportFor().privacy,
            grade: {
              grade: 'B',
              reason: 'Declared feature host.',
              counts: reportFor().privacy.counts,
            },
          },
        }),
      ),
    ).toBe('compatible');
  });

  test('keeps cloud and unknown-domain apps standalone-only', () => {
    expect(
      containerEligibilityFromDeployReport(
        reportFor({
          kind: {
            ...reportFor().kind,
            detected: 'cloud',
            public: 'cloud',
            reasons: ['server state required'],
          },
        }),
      ),
    ).toBe('standalone_only');

    expect(
      containerEligibilityFromDeployReport(
        reportFor({
          privacy: {
            ...reportFor().privacy,
            grade: {
              grade: 'C',
              reason: 'Undeclared external host.',
              counts: reportFor().privacy.counts,
            },
          },
        }),
      ),
    ).toBe('standalone_only');
  });

  test('blocks container loading for hard security or tracker failures', () => {
    expect(
      containerEligibilityFromDeployReport(
        reportFor({
          security: {
            ...reportFor().security,
            blocks: 1,
            score: { value: 70, deductions: [], blocks: 1 },
          },
        }),
      ),
    ).toBe('blocked');

    expect(
      containerEligibilityFromDeployReport(
        reportFor({
          privacy: {
            ...reportFor().privacy,
            grade: {
              grade: 'F',
              reason: 'Tracker detected.',
              counts: reportFor().privacy.counts,
            },
          },
        }),
      ),
    ).toBe('blocked');
  });

  test('requires a strong enough security score before container loading', () => {
    expect(
      containerEligibilityFromDeployReport(
        reportFor({
          security: {
            ...reportFor().security,
            score: { value: 89, deductions: [], blocks: 0 },
          },
        }),
      ),
    ).toBe('standalone_only');

    expect(
      containerEligibilityFromDeployReport(
        reportFor({
          security: {
            ...reportFor().security,
            score: { value: 69, deductions: [], blocks: 0 },
          },
        }),
      ),
    ).toBe('blocked');
  });
});
