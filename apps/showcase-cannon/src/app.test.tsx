import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from './App';

// Tell React this is a proper act() environment (silences jsdom warnings).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Minimal integration smoke: mount the real app in jsdom and drive every
// screen. The API client degrades to the seeded launch data when fetch
// fails (jsdom has no platform server), which is exactly the offline path.

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<App />);
  });
  // Let the data layer settle (fetch rejection → fallback state).
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function clickButton(matcher: (b: HTMLButtonElement) => boolean) {
  const btn = [...container.querySelectorAll('button')].find(matcher);
  if (!btn) throw new Error('button not found');
  act(() => {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function nav(label: string) {
  clickButton((b) => b.classList.contains('nav-tab') && (b.textContent ?? '').includes(label));
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
});

describe('App smoke', () => {
  it('boots on the Oracle with countdown, briefing, and this-day card', async () => {
    await mount();
    expect(container.textContent).toContain('ORACLE');
    expect(container.textContent).toContain('Next Match');
    expect(container.textContent).toContain('Man City');
    expect(container.textContent).toContain('Fan Confidence');
    expect(container.textContent).toContain('Rice vs Rodri');
    expect(container.textContent).toContain('This Day in Arsenal');
  });

  it('terrace renders seeded takes and an upvote sticks optimistically', async () => {
    await mount();
    nav('TERRACE');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container.textContent).toContain('NorthBankNelson');
    expect(container.textContent).toContain('Scorching');

    expect(container.textContent).toContain('1,247');
    clickButton((b) => (b.textContent ?? '').includes('1,247'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container.textContent).toContain('1,248');
  });

  it('terrace composes a take under my handle', async () => {
    await mount();
    nav('TERRACE');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const input = container.querySelector<HTMLInputElement>('input[placeholder="Leave your take…"]');
    expect(input).not.toBeNull();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'COYG. Title defence loading.');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    clickButton((b) => b.getAttribute('aria-label') === 'Post take');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container.textContent).toContain('COYG. Title defence loading.');
  });

  it('gauge renders the dial, verdict, moods, and rating row', async () => {
    await mount();
    nav('GAUGE');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container.querySelector('svg defs linearGradient')).not.toBeNull();
    expect(container.textContent).toContain('7.4');
    expect(container.textContent).toContain('Optimistic Gunners');
    expect(container.textContent).toContain('Buzzing');
    expect(container.textContent).toContain('Your Rating');
    expect(container.textContent).toContain('Gunners rated');
  });

  it('fixtures filters by month and drills into H2H and back', async () => {
    await mount();
    nav('FIXTURES');
    expect(container.textContent).toContain('Season Difficulty');
    expect(container.textContent).toContain('Fulham');

    // Month filter
    clickButton((b) => b.classList.contains('tab-pill') && b.textContent === 'Sep');
    expect(container.textContent).toContain('Liverpool');
    expect(container.textContent).not.toContain('Fulham');

    // Expand a row, then H2H
    const row = [...container.querySelectorAll('div')].find((d) => d.textContent === 'Liverpool');
    act(() => {
      row!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('Kick-off');
    clickButton((b) => (b.textContent ?? '').includes('H2H'));
    expect(container.textContent).toContain('Arsenal vs Liverpool');
    expect(container.textContent).toContain('Last 5 Meetings');

    clickButton((b) => b.getAttribute('aria-label') === 'Back to fixtures');
    expect(container.textContent).toContain('Season Difficulty');
  });

  it('club shows the squad, player drill-down and back, season, history', async () => {
    await mount();
    nav('CLUB');
    expect(container.textContent).toContain('Goalkeepers');
    expect(container.textContent).toContain('Saka');

    clickButton((b) => (b.textContent ?? '').includes('Saka'));
    expect(container.textContent).toContain('Bukayo Saka');
    expect(container.textContent).toContain('Recent Form');
    clickButton((b) => b.getAttribute('aria-label') === 'Back to squad');
    expect(container.textContent).toContain('Goalkeepers');

    clickButton((b) => b.textContent === 'Season');
    expect(container.textContent).toContain('Premier League · 2025/26 · Champions');
    expect(container.textContent).toContain('xG per Game');

    clickButton((b) => b.textContent === 'History');
    expect(container.textContent).toContain('Twenty-two years.');
    expect(container.textContent).toContain('Trophy Timeline');
    expect(container.textContent).toContain('1989');
  });

  it('remembers the active tab across mounts', async () => {
    await mount();
    nav('FIXTURES');
    act(() => root.unmount());
    container.remove();
    await mount();
    expect(container.textContent).toContain('Season Difficulty');
  });
});
