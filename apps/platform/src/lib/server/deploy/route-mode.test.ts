import { describe, expect, test } from 'vitest';
import { detectRouteMode } from './route-mode';

const enc = new TextEncoder();
const file = (text: string) => enc.encode(text);

describe('detectRouteMode', () => {
  test('classifies a single index.html bundle as SPA', () => {
    const decision = detectRouteMode(new Map([['index.html', file('<html></html>')]]));
    expect(decision.mode).toBe('spa');
    expect(decision.confidence).toBeGreaterThan(0.7);
  });

  test('classifies React Router style bundles as SPA', () => {
    const decision = detectRouteMode(
      new Map([
        ['index.html', file('<script src="/assets/app.js"></script>')],
        ['assets/app.js', file('import { createBrowserRouter } from "react-router-dom";')],
      ]),
    );
    expect(decision.mode).toBe('spa');
    expect(decision.reasons.join(' ')).toContain('createBrowserRouter');
  });

  test('classifies multiple HTML pages as MPA', () => {
    const decision = detectRouteMode(
      new Map([
        ['index.html', file('<html>home</html>')],
        ['about/index.html', file('<html>about</html>')],
        ['pricing/index.html', file('<html>pricing</html>')],
      ]),
    );
    expect(decision.mode).toBe('mpa');
    expect(decision.htmlFiles).toEqual(['about/index.html', 'index.html', 'pricing/index.html']);
  });

  test('treats explicit 404.html as a strong MPA signal', () => {
    const decision = detectRouteMode(
      new Map([
        ['index.html', file('<html>home</html>')],
        ['404.html', file('<html>not found</html>')],
        ['assets/app.js', file('history.pushState({}, "", "/x")')],
      ]),
    );
    expect(decision.mode).toBe('mpa');
    expect(decision.confidence).toBeGreaterThanOrEqual(0.9);
  });

  test('does not enable SPA fallback without root index.html', () => {
    const decision = detectRouteMode(new Map([['dist/index.html', file('<html></html>')]]));
    expect(decision.mode).toBe('mpa');
    expect(decision.confidence).toBeLessThan(0.5);
  });
});
