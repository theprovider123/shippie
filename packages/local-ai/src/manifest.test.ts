import { describe, expect, test } from 'bun:test';
import { manifestDownloadBytes, parseLocalAiManifest, resolveModel } from './manifest.ts';

const manifest = {
  schemaVersion: 1,
  generatedAt: '2026-04-24T00:00:00.000Z',
  baseUrl: 'https://models.shippie.app/v1/',
  models: [
    {
      id: 'gte-small',
      version: '1.0.0',
      kind: 'embedding',
      runtime: 'transformers-js',
      features: ['embeddings', 'classification'],
      bytes: 300,
      chunks: [
        { path: 'gte-small/model-000.bin', bytes: 100, integrity: 'sha256-abc=' },
        { path: 'gte-small/model-001.bin', bytes: 200, integrity: 'sha256-def=' },
      ],
      dimensions: 384,
      recommended: true,
    },
    {
      id: 'sentiment-tiny',
      version: '1.0.0',
      kind: 'sentiment',
      runtime: 'transformers-js',
      features: ['sentiment'],
      bytes: 100,
      chunks: [{ path: 'sentiment/model.bin', bytes: 100, integrity: 'sha384-ghi=' }],
    },
  ],
};

describe('@shippie/local-ai model manifest', () => {
  test('parses and resolves immutable chunk URLs', () => {
    const parsed = parseLocalAiManifest(manifest);
    const model = resolveModel(parsed, 'embeddings');
    expect(model?.id).toBe('gte-small');
    expect(model?.chunks[0]?.url).toBe('https://models.shippie.app/v1/gte-small/model-000.bin');
  });

  test('counts each selected model once', () => {
    const parsed = parseLocalAiManifest(manifest);
    expect(manifestDownloadBytes(parsed, ['embeddings', 'classification', 'sentiment'])).toBe(400);
  });

  test('rejects unsafe chunk paths and mismatched byte totals', () => {
    expect(() =>
      parseLocalAiManifest({
        ...manifest,
        models: [{ ...manifest.models[0], bytes: 999 }],
      }),
    ).toThrow(/byte total/);
    expect(() =>
      parseLocalAiManifest({
        ...manifest,
        models: [{ ...manifest.models[0], chunks: [{ path: '../x', bytes: 300, integrity: 'sha256-abc=' }] }],
      }),
    ).toThrow(/relative/);
  });
});
