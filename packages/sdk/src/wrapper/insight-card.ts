// packages/sdk/src/wrapper/insight-card.ts
/**
 * Top-of-page insight card renderer for the ambient-intelligence layer.
 *
 * Each undismissed `Insight` produced by `@shippie/ambient` becomes a
 * dismissible `<aside>` prepended into the maker's page. We intentionally
 * keep the DOM vanilla + inline-styled so any host page renders the card
 * the same way regardless of CSS framework.
 *
 * Mount returns a teardown that removes every card and detaches every
 * listener — callers (typically the wrapper bootstrap) hold onto it so
 * SPA navigations or HMR reboots don't leak nodes.
 */
export interface InsightCardData {
  id: string;
  title: string;
  summary: string;
  href?: string;
}

export interface MountInsightCardsOptions {
  /**
   * Where to insert the cards. Defaults to `document.body` and the cards
   * are prepended so they sit above the rest of the page content.
   */
  container?: HTMLElement;
  insights?: InsightCardData[];
  /**
   * Fired when the user taps the dismiss button. The card is removed
   * regardless — this is just the maker-side notification hook (typically
   * wired to `dismiss(insight.id)` from `@shippie/ambient`).
   */
  onDismiss?: (id: string) => void;
}

const CARD_ATTR = 'data-shippie-insight';
const FADE_OUT_MS = 200;

interface MountedCard {
  el: HTMLElement;
  cleanup: () => void;
}

const mounted: MountedCard[] = [];

export function mountInsightCards(opts: MountInsightCardsOptions = {}): () => void {
  const insights = opts.insights ?? [];
  if (insights.length === 0 || typeof document === 'undefined') {
    // Even with nothing to render we hand back a teardown so callers
    // don't have to type-narrow before invoking it.
    return () => {};
  }

  const container = opts.container ?? document.body;
  if (!container) return () => {};

  // Fresh mount: clear any leftovers (for example from a previous
  // bootstrap cycle on the same page).
  unmountInsightCards();

  // Prepend in reverse so the first insight in the array ends up at the
  // very top of the container.
  for (let i = insights.length - 1; i >= 0; i -= 1) {
    const insight = insights[i];
    if (!insight) continue;
    const card = buildCard(insight, opts.onDismiss);
    container.prepend(card.el);
    mounted.push(card);
  }

  return () => {
    teardownAll();
  };
}

export function unmountInsightCards(): void {
  teardownAll();
}

function teardownAll(): void {
  while (mounted.length > 0) {
    const card = mounted.pop();
    if (!card) continue;
    card.cleanup();
    if (card.el.parentNode) {
      card.el.parentNode.removeChild(card.el);
    }
  }
}

function buildCard(
  insight: InsightCardData,
  onDismiss?: (id: string) => void,
): MountedCard {
  const aside = document.createElement('aside');
  aside.setAttribute(CARD_ATTR, insight.id);
  aside.setAttribute('role', 'complementary');
  aside.setAttribute('style', cardStyle());

  const heading = document.createElement('h3');
  heading.textContent = insight.title;
  heading.setAttribute('style', headingStyle());

  const body = document.createElement('p');
  body.textContent = insight.summary;
  body.setAttribute('style', bodyStyle());

  aside.append(heading, body);

  if (insight.href) {
    const link = document.createElement('a');
    link.href = insight.href;
    link.textContent = 'Open';
    link.setAttribute('style', linkStyle());
    aside.append(link);
  }

  const dismiss = document.createElement('button');
  dismiss.setAttribute('data-shippie-insight-dismiss', '');
  dismiss.setAttribute('aria-label', 'Dismiss insight');
  dismiss.textContent = '✕'; // small "x"
  dismiss.setAttribute('style', dismissStyle());

  const handleDismiss = () => {
    try {
      onDismiss?.(insight.id);
    } catch {
      // Maker-supplied callback errors must not block the visual dismissal.
    }
    fadeOutAndRemove(aside);
  };
  dismiss.addEventListener('click', handleDismiss);

  aside.append(dismiss);

  const cleanup = () => {
    dismiss.removeEventListener('click', handleDismiss);
  };

  return { el: aside, cleanup };
}

function fadeOutAndRemove(el: HTMLElement): void {
  el.style.transition = `opacity ${FADE_OUT_MS}ms ease`;
  el.style.opacity = '0';
  const remove = () => {
    if (el.parentNode) el.parentNode.removeChild(el);
    // Drop from the mounted registry so a subsequent unmountInsightCards
    // doesn't try to remove a node that already went away.
    const idx = mounted.findIndex((m) => m.el === el);
    if (idx !== -1) {
      mounted[idx]?.cleanup();
      mounted.splice(idx, 1);
    }
  };
  if (typeof setTimeout !== 'undefined') {
    setTimeout(remove, FADE_OUT_MS);
  } else {
    remove();
  }
}

function cardStyle(): string {
  return [
    'display:block',
    'margin:12px auto',
    'max-width:640px',
    'padding:14px 44px 14px 16px',
    'position:relative',
    'background:#2A2520',
    'color:#EDE4D3',
    'border:1px solid #3D3530',
    'border-radius:12px',
    'font:14px/1.4 system-ui,sans-serif',
    'opacity:1',
  ].join(';');
}

function headingStyle(): string {
  return 'font:700 15px/1.3 system-ui,sans-serif;margin:0 0 4px';
}

function bodyStyle(): string {
  return 'margin:0;color:#B8A88F;font-size:13px;line-height:1.45';
}

function linkStyle(): string {
  return [
    'display:inline-block',
    'margin-top:8px',
    'color:#E8603C',
    'font:600 13px/1 system-ui,sans-serif',
    'text-decoration:none',
  ].join(';');
}

function dismissStyle(): string {
  return [
    'position:absolute',
    'top:8px',
    'right:8px',
    'width:24px',
    'height:24px',
    'padding:0',
    'border:0',
    'border-radius:6px',
    'background:transparent',
    'color:#B8A88F',
    'font:600 14px/1 system-ui,sans-serif',
    'cursor:pointer',
  ].join(';');
}
