import { describe, expect, test } from 'vitest';
import { inlinePackageAssets } from './app-srcdoc';

describe('inlinePackageAssets', () => {
  test('inlines same-package stylesheet and script references', () => {
    const html = `<!doctype html><html><head><link rel="stylesheet" href="./style.css"></head><body><script src="app.js"></script></body></html>`;
    const out = inlinePackageAssets(html, 'app/index.html', {
      'app/style.css': textFile('text/css; charset=utf-8', 'body { color: red; }'),
      'app/app.js': textFile('application/javascript', 'window.__ran = true;'),
    });

    expect(out).toContain('<style data-shippie-inlined="./style.css">');
    expect(out).toContain('body { color: red; }');
    expect(out).toContain('<script');
    expect(out).toContain('data-shippie-inlined="app.js"');
    expect(out).toContain('window.__ran = true;');
    expect(out).not.toContain('href="./style.css"');
    expect(out).not.toContain('src="app.js"');
  });

  test('leaves external references untouched', () => {
    const html = `<link rel="stylesheet" href="https://cdn.example.com/app.css"><script src="https://cdn.example.com/app.js"></script>`;
    const out = inlinePackageAssets(html, 'app/index.html', {});

    expect(out).toBe(html);
  });

  test('rewrites package images and CSS url references to data URLs', () => {
    const html = `<!doctype html><html><head><style>.logo { background: url("./logo.png"); }</style></head><body><img src="./logo.png" srcset="./logo.png 1x, ./logo@2x.png 2x"></body></html>`;
    const out = inlinePackageAssets(html, 'app/index.html', {
      'app/logo.png': binaryFile('image/png', 'data:image/png;base64,AAA='),
      'app/logo@2x.png': binaryFile('image/png', 'data:image/png;base64,BBB='),
    });

    expect(out).toContain('src="data:image/png;base64,AAA="');
    expect(out).toContain('srcset="data:image/png;base64,AAA= 1x, data:image/png;base64,BBB= 2x"');
    expect(out).toContain('background: url("data:image/png;base64,AAA=")');
  });
});

function textFile(mimeType: string, text: string) {
  return {
    mimeType,
    text,
    dataUrl: `data:${mimeType};base64,${Buffer.from(text).toString('base64')}`,
  };
}

function binaryFile(mimeType: string, dataUrl: string) {
  return { mimeType, dataUrl };
}
