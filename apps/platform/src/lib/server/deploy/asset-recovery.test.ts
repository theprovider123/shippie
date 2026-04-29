import { describe, expect, test } from 'vitest';
import { recoverAssetReferences } from './asset-recovery';

const enc = new TextEncoder();
const file = (text: string) => enc.encode(text);
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('recoverAssetReferences', () => {
  test('repairs an unambiguous broken HTML image path', () => {
    const result = recoverAssetReferences(
      new Map([
        ['index.html', file('<img src="/images/hero.png">')],
        ['assets/images/hero.png', file('png')],
      ]),
    );

    expect(result.fixes).toEqual([
      {
        file: 'index.html',
        before: '/images/hero.png',
        after: '/assets/images/hero.png',
        kind: 'broken_path',
      },
    ]);
    expect(text(result.files.get('index.html')!)).toContain('src="/assets/images/hero.png"');
  });

  test('repairs CSS url() references', () => {
    const result = recoverAssetReferences(
      new Map([
        ['styles/app.css', file('.hero{background:url("../img/bg.webp")}')],
        ['assets/bg.webp', file('webp')],
      ]),
    );

    expect(result.fixes[0]).toMatchObject({
      file: 'styles/app.css',
      before: '../img/bg.webp',
      after: '/assets/bg.webp',
    });
    expect(text(result.files.get('styles/app.css')!)).toContain('url("/assets/bg.webp")');
  });

  test('does not rewrite when the original reference already resolves', () => {
    const result = recoverAssetReferences(
      new Map([
        ['index.html', file('<script src="/app.js"></script>')],
        ['app.js', file('console.log(1)')],
      ]),
    );

    expect(result.fixes).toHaveLength(0);
    expect(text(result.files.get('index.html')!)).toContain('/app.js');
  });

  test('does not guess when multiple files share a basename', () => {
    const result = recoverAssetReferences(
      new Map([
        ['index.html', file('<img src="/missing/logo.svg">')],
        ['assets/light/logo.svg', file('svg')],
        ['assets/dark/logo.svg', file('svg')],
      ]),
    );

    expect(result.fixes).toHaveLength(0);
    expect(text(result.files.get('index.html')!)).toContain('/missing/logo.svg');
  });

  test('does not rewrite navigation hrefs or external URLs', () => {
    const result = recoverAssetReferences(
      new Map([
        [
          'index.html',
          file('<a href="/about">About</a><img src="https://cdn.example.com/hero.png">'),
        ],
        ['assets/about.png', file('png')],
        ['assets/hero.png', file('png')],
      ]),
    );

    expect(result.fixes).toHaveLength(0);
  });
});
