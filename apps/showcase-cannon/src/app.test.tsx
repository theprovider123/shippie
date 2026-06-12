import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from './App';

// The suite exercises the OFFLINE ladder deterministically — a developer's
// platform server on :4101 must never leak into these tests.
beforeAll(() => {
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline (stubbed)')));
});

// Tell React this is a proper act() environment (silences jsdom warnings).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Minimal integration smoke: mount the real app in jsdom and drive every
// tab. jsdom has no platform server, so every fetch rejects and the app
// runs the full offline ladder — bundled season seeds + seeded takes —
// which is exactly the path a fan on a train hits.

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
  clickButton((b) => b.classList.contains('tab-bar-item') && (b.textContent ?? '').includes(label));
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('App smoke (offline ladder)', () => {
  it('boots on Now answering "what is happening" from the season seed', async () => {
    await mount();
    // Idle phase from the seed: next-up hero + opponent + honest seed badge.
    expect(container.textContent).toContain('Next up');
    expect(container.textContent).toContain('Man City');
    expect(container.textContent).toContain('Arsenal');
    // Provenance label for seed-only data.
    expect(container.textContent).toContain('season guide data');
    // Last result strip from the seed's lastResult.
    expect(container.textContent).toContain('Last time out');
  });

  it('never fabricates a crowd number: empty prediction shows a call to action', async () => {
    await mount();
    expect(container.textContent).toContain('No calls yet');
  });

  it('matches tab lists the season from the fixtures seed with month chips', async () => {
    await mount();
    nav('Matches');
    expect(container.textContent).toContain('2026/27');
    expect(container.textContent).toContain('Fulham');
    expect(container.textContent).toContain('Chelsea');
    // Month chips derived from kickoff dates, not hardcoded.
    expect(container.textContent).toContain('Aug');
    expect(container.textContent).toContain('Dec');
  });

  it('opens a match detail with H2H from the feed', async () => {
    await mount();
    nav('Matches');
    clickButton((b) => b.classList.contains('fixture-row') && (b.textContent ?? '').includes('Chelsea'));
    expect(container.textContent).toContain('Head to head');
    expect(container.textContent).toContain('Last five meetings');
    expect(container.textContent).toContain('Add to calendar');
  });

  it('terrace renders seeded takes and an upvote sticks optimistically', async () => {
    await mount();
    nav('Terrace');
    expect(container.textContent).toContain('Rice has been the most underrated');
    const before = [...container.querySelectorAll('.vote-btn')][0]?.textContent ?? '';
    clickButton((b) => b.classList.contains('vote-btn'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const after = [...container.querySelectorAll('.vote-btn')][0]?.textContent ?? '';
    expect(after).not.toBe(before);
  });

  it('composing a take shows it instantly and queues it offline', async () => {
    await mount();
    nav('Terrace');
    const input = container.querySelector<HTMLInputElement>('.compose-input');
    if (!input) throw new Error('compose input missing');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'Saka season incoming.');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    clickButton((b) => b.classList.contains('compose-send'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(container.textContent).toContain('Saka season incoming.');
    // Queued for replay.
    expect(localStorage.getItem('cannon_local_takes')).toContain('Saka season incoming.');
  });

  it('squad tab shows availability truthfully, including the treatment room', async () => {
    await mount();
    nav('Squad');
    expect(container.textContent).toContain('Treatment room');
    expect(container.textContent).toContain('Tomiyasu');
    expect(container.textContent).toContain('Injured');
    expect(container.textContent).toContain('Goalkeepers');
  });

  it('opens a player detail with stats and form', async () => {
    await mount();
    nav('Squad');
    clickButton((b) => b.classList.contains('player-card') && (b.textContent ?? '').includes('Saka'));
    expect(container.textContent).toContain('Bukayo Saka');
    expect(container.textContent).toContain('Recent form');
    expect(container.textContent).toContain('Assists');
  });

  it('club sub-view carries the title season and trophy timeline', async () => {
    await mount();
    nav('Squad');
    clickButton((b) => b.classList.contains('chip') && (b.textContent ?? '').trim() === 'Club');
    expect(container.textContent).toContain('Twenty-two years');
    expect(container.textContent).toContain('Trophy timeline');
    expect(container.textContent).toContain('The Invincibles');
  });

  it('deep link ?m= opens the match detail directly', async () => {
    window.history.replaceState(null, '', '/?m=pl-liv-2026-09-13');
    await mount();
    expect(container.textContent).toContain('Liverpool');
    expect(container.textContent).toContain('Head to head');
  });

  it('deep link ?p= opens the player directly', async () => {
    window.history.replaceState(null, '', '/?p=odegaard');
    await mount();
    expect(container.textContent).toContain('Martin Ødegaard');
  });
});
