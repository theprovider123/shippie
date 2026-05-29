import { describe, expect, test } from 'bun:test';
import { runLocalToolPolicyScan } from './local-tool-policy.ts';

const enc = new TextEncoder();

function files(entries: Record<string, string>): Map<string, Uint8Array> {
  return new Map(Object.entries(entries).map(([path, body]) => [path, enc.encode(body)]));
}

describe('local-tool-policy scan', () => {
  test('passes a local Shippie tool that uses local db and intents', () => {
    const report = runLocalToolPolicyScan(files({
      'index.html': '<main>Receipt Snap</main>',
      'app.js': `
        await shippie.local.db.save('receipts', { total: 1200 });
        await shippie.intent.broadcast('expense-logged', []);
      `,
    }));

    expect(report.passed).toBe(true);
    expect(report.status).toBe('eligible-local');
    expect(report.blocks).toBe(0);
    expect(report.capabilityHints.localDb).toBe(true);
    expect(report.capabilityHints.sharesIntents).toBe(true);
  });

  test('blocks third-party storage, auth, and analytics clients', () => {
    const report = runLocalToolPolicyScan(files({
      'app.ts': `
        import { createClient } from '@supabase/supabase-js';
        import { ClerkProvider } from '@clerk/clerk-react';
        gtag('event', 'signup');
        const supabase = createClient(url, key);
        await supabase.from('recipes').insert({ name: 'private' });
      `,
    }));

    expect(report.passed).toBe(false);
    expect(report.status).toBe('needs-conversion');
    const ids = report.findings.map((f) => f.id);
    expect(ids).toContain('cloud-storage-supabase');
    expect(ids).toContain('third-party-auth');
    expect(ids).toContain('analytics-tracker');
  });

  test('warns on external writes and discloses the destination domain', () => {
    const report = runLocalToolPolicyScan(files({
      'app.js': `
        const forecast = await fetch('https://api.weather.test/forecast?lat=51&lon=0');
        await fetch('https://api.vendor.test/receipts', {
          method: 'POST',
          body: JSON.stringify(receipt)
        });
      `,
    }));

    expect(report.passed).toBe(true);
    expect(report.status).toBe('eligible-reference-network');
    expect(report.referenceDomains).toEqual(['api.vendor.test', 'api.weather.test']);
    const writeFinding = report.findings.find((f) => f.id === 'external-user-data-write');
    expect(writeFinding?.severity).toBe('warn');
  });

  test('allows external AI endpoints with disclosure warnings', () => {
    const report = runLocalToolPolicyScan(files({
      'ai.js': `
        await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          body: JSON.stringify({ input: noteText })
        });
      `,
    }));

    expect(report.passed).toBe(true);
    expect(report.blocks).toBe(0);
    expect(report.referenceDomains).toEqual(['api.openai.com']);
    expect(report.findings.find((f) => f.id === 'external-llm-silent')?.severity).toBe('warn');
    expect(report.findings.find((f) => f.id === 'external-user-data-write')?.severity).toBe('warn');
  });

  test('warns on GET query strings that may carry personal context', () => {
    const report = runLocalToolPolicyScan(files({
      'search.js': `await fetch('https://recipes.example/search?q=birthday+cake+for+sam');`,
    }));

    expect(report.passed).toBe(true);
    expect(report.status).toBe('eligible-reference-network');
    expect(report.warns).toBe(1);
    expect(report.findings[0]?.id).toBe('reference-query-risk');
  });

  test('treats Shippie relay and checkpoint endpoints as allowed transport', () => {
    const report = runLocalToolPolicyScan(files({
      'room.js': `
        await fetch('https://shippie.app/__shippie/signal/room-1', {
          method: 'POST',
          body: encryptedEnvelope
        });
        await fetch('https://shippie.app/__shippie/checkpoints/room-1', {
          method: 'PUT',
          body: encryptedCheckpoint
        });
      `,
    }));

    expect(report.passed).toBe(true);
    expect(report.blocks).toBe(0);
    expect(report.capabilityHints.privateRelay).toBe(true);
    expect(report.capabilityHints.secureBackup).toBe(true);
  });

  test('ignores source metadata URLs when deriving runtime reference domains', () => {
    const report = runLocalToolPolicyScan(files({
      'shippie.json': JSON.stringify({
        source_repo: 'https://github.com/acme/local-tool',
        repository: 'https://github.com/acme/local-tool',
        data_passport: { family: 'local-tool', schema: 'local-tool.v1' },
      }),
      'app.js': `await shippie.local.db.save('notes', note);`,
    }));

    expect(report.passed).toBe(true);
    expect(report.status).toBe('eligible-local');
    expect(report.referenceDomains).toEqual([]);
  });

  test('ignores template-literal placeholder URLs that are not concrete domains', () => {
    const report = runLocalToolPolicyScan(files({
      'app.js': `
        const trimmed = input.trim();
        const url = \`https://\${trimmed}/playlist\`;
      `,
    }));

    expect(report.passed).toBe(true);
    expect(report.referenceDomains).toEqual([]);
  });
});
