import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanFilesForDomains } from './domain-scan';

function files(entries: Record<string, string>): Map<string, Buffer> {
  return new Map(Object.entries(entries).map(([k, v]) => [k, Buffer.from(v)]));
}

test('extracts domain from JS fetch call', () => {
  const r = scanFilesForDomains(files({ 'app.js': 'fetch("https://api.example.com/data")' }));
  assert.ok(r.uniqueDomains.includes('api.example.com'));
  assert.equal(r.hits[0]?.source, 'js');
});

test('filters safe domains', () => {
  const r = scanFilesForDomains(files({ 'app.js': 'fetch("https://localhost/x"); fetch("https://developer.mozilla.org/docs")' }));
  assert.equal(r.uniqueDomains.length, 0);
});

test('classifies sources correctly', () => {
  const r = scanFilesForDomains(files({
    'index.html': 'https://html.example.com',
    'app.js': 'https://js.example.com',
    'shippie.json': '"url":"https://manifest.example.com"',
    'functions/handler.js': 'https://fn.example.com',
  }));
  const byDomain = new Map(r.hits.map((h) => [h.domain, h.source]));
  assert.equal(byDomain.get('html.example.com'), 'html');
  assert.equal(byDomain.get('js.example.com'), 'js');
  assert.equal(byDomain.get('manifest.example.com'), 'manifest');
  assert.equal(byDomain.get('fn.example.com'), 'function');
});

test('uniqueDomains is sorted and deduped', () => {
  const r = scanFilesForDomains(files({
    'a.js': 'https://z.com/1 https://a.com/2 https://z.com/3',
  }));
  assert.deepEqual(r.uniqueDomains, ['a.com', 'z.com']);
});

test('empty file map returns empty', () => {
  const r = scanFilesForDomains(new Map());
  assert.equal(r.hits.length, 0);
  assert.equal(r.uniqueDomains.length, 0);
});
