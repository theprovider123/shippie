import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import {
  mountInsightCards,
  unmountInsightCards,
  type InsightCardData,
} from './insight-card.ts';

let win: Window;
const originalDocument = (globalThis as { document?: unknown }).document;

beforeEach(() => {
  win = new Window({ url: 'https://shippie.app/' });
  // @ts-expect-error test
  globalThis.document = win.document;
  // Ensure a clean slate between tests in case a prior test leaked nodes.
  unmountInsightCards();
});

afterAll(() => {
  (globalThis as { document?: unknown }).document = originalDocument;
});

const sample: InsightCardData[] = [
  { id: 'a', title: 'Mood trending down', summary: 'Last 7 days lower than prior week.' },
  { id: 'b', title: 'Spending up 40%', summary: 'Dining-out is up.', href: '/budget' },
];

describe('mountInsightCards', () => {
  test('renders one card per insight', () => {
    mountInsightCards({ insights: sample });
    const cards = win.document.querySelectorAll('aside[data-shippie-insight]');
    expect(cards.length).toBe(2);
    const titles = Array.from(cards).map((c) => c.querySelector('h3')?.textContent);
    expect(titles).toContain('Mood trending down');
    expect(titles).toContain('Spending up 40%');
  });

  test('dismiss button removes the card and calls onDismiss', () => {
    const dismissed: string[] = [];
    mountInsightCards({
      insights: [sample[0]!],
      onDismiss: (id) => dismissed.push(id),
    });
    const card = win.document.querySelector('aside[data-shippie-insight="a"]');
    expect(card).not.toBeNull();
    const btn = card?.querySelector(
      'button[data-shippie-insight-dismiss]',
    ) as unknown as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    expect(dismissed).toEqual(['a']);
    // Fade-out runs on a 200ms timer; the opacity is set immediately, the
    // removal is scheduled. The DOM-level effect we care about is that
    // unmountInsightCards still drops it (covered below) and that the
    // onDismiss callback fires synchronously.
    expect((card as unknown as HTMLElement).style.opacity).toBe('0');
  });

  test('teardown clears all cards', () => {
    const teardown = mountInsightCards({ insights: sample });
    expect(win.document.querySelectorAll('aside[data-shippie-insight]').length).toBe(2);
    teardown();
    expect(win.document.querySelectorAll('aside[data-shippie-insight]').length).toBe(0);
  });

  test('no-op when insights array is empty', () => {
    const teardown = mountInsightCards({ insights: [] });
    expect(win.document.querySelectorAll('aside[data-shippie-insight]').length).toBe(0);
    // Teardown on an empty mount must still be safely callable.
    teardown();
    expect(win.document.querySelectorAll('aside[data-shippie-insight]').length).toBe(0);
  });

  test('cards prepend so the first insight ends up at the top', () => {
    mountInsightCards({ insights: sample });
    const first = win.document.body.firstElementChild;
    expect(first?.getAttribute('data-shippie-insight')).toBe('a');
  });

  test('renders an Open link when href is provided', () => {
    mountInsightCards({ insights: [sample[1]!] });
    const link = win.document.querySelector('aside[data-shippie-insight="b"] a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('/budget');
  });
});
