<script lang="ts">
  /**
   * Randomiser — Shippie Home capstone.
   *
   * Pulls cross-app observation events out of the local intent-store
   * (populated by the container's `recordIntentForToday` tap) and
   * surfaces a "spin the wheel" UI that picks a random item the user
   * has already produced via other apps. Tapping the result opens the
   * source app at its canonical URL.
   *
   * **Data path**: container → intent-store IndexedDB → this component.
   * No network call. No second permission prompt: the user has already
   * granted these intents in the original cross-app permission modal.
   *
   * **Filtering**: only observations the user can plausibly act on get
   * included — recipes to cook, places they snapped, mood colours,
   * preference choices. Game completions and voice-recorded durations
   * are filtered out (they aren't "things to spin to").
   */
  import { onMount } from 'svelte';
  import { listEventsSince, type IntentEvent } from '$lib/intent-store/store';
  import { canonicalAppUrl } from '$lib/showcase-slugs';

  // Observation kinds whose payloads make sense as wheel items.
  const ACTIONABLE_KINDS = new Set([
    'place.snapped',
    'recipe.cooked',
    'mood.color_picked',
    'preference.choice',
    'photo.labelled',
  ]);

  interface WheelItem {
    /** Display label (the part the user sees on the wheel face). */
    label: string;
    /** Where to send them when they tap "open". */
    sourceSlug: string;
    /** Tooltip / explainer text. */
    detail: string;
  }

  let items = $state<WheelItem[]>([]);
  let pick = $state<WheelItem | null>(null);
  let spinning = $state(false);
  let loaded = $state(false);

  function asLabel(event: IntentEvent): WheelItem | null {
    const row = event.row as Record<string, unknown> | null;
    if (!row || typeof row !== 'object') return null;
    switch (event.intent) {
      case 'place.snapped': {
        const labels = Array.isArray((row as { labels?: unknown[] }).labels)
          ? ((row as { labels: unknown[] }).labels.filter((l) => typeof l === 'string') as string[])
          : [];
        if (labels.length === 0) return null;
        return {
          label: labels[0]!,
          sourceSlug: event.appId,
          detail: `you snapped this in ${event.appId}`,
        };
      }
      case 'recipe.cooked': {
        const title = typeof (row as { title?: unknown }).title === 'string'
          ? (row as { title: string }).title
          : null;
        if (!title) return null;
        return { label: title, sourceSlug: event.appId, detail: `a recipe you cooked` };
      }
      case 'mood.color_picked': {
        const color = typeof (row as { color?: unknown }).color === 'string'
          ? (row as { color: string }).color
          : null;
        if (!color) return null;
        return { label: `colour ${color}`, sourceSlug: event.appId, detail: `from your colour ribbon` };
      }
      case 'preference.choice': {
        const qid = typeof (row as { question_id?: unknown }).question_id === 'string'
          ? (row as { question_id: string }).question_id
          : 'a question';
        return {
          label: `your answer to ${qid}`,
          sourceSlug: event.appId,
          detail: 'from Would You Rather',
        };
      }
      case 'photo.labelled': {
        const labels = Array.isArray((row as { labels?: unknown[] }).labels)
          ? ((row as { labels: unknown[] }).labels.filter((l) => typeof l === 'string') as string[])
          : [];
        if (labels.length === 0) return null;
        return { label: labels[0]!, sourceSlug: event.appId, detail: `a labelled photo` };
      }
      default:
        return null;
    }
  }

  onMount(async () => {
    try {
      const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const events = await listEventsSince(since, 500);
      items = events
        .filter((e) => ACTIONABLE_KINDS.has(e.intent))
        .map(asLabel)
        .filter((w): w is WheelItem => w !== null)
        .slice(0, 60);
    } catch {
      // IDB unavailable / first-visit empty — silent. The component
      // simply doesn't render its main affordance.
      items = [];
    }
    loaded = true;
  });

  // appId in the intent store is the SDK's `app_<slug>` namespace; the
  // canonical URL helper expects the bare slug. Strip the prefix here.
  function urlForSource(sourceAppId: string): string {
    const slug = sourceAppId.replace(/^app_/, '').replace(/_/g, '-');
    return canonicalAppUrl(slug);
  }

  function spin() {
    if (items.length === 0) return;
    spinning = true;
    let ticks = 0;
    const totalTicks = 14 + Math.floor(Math.random() * 6);
    let interval: number;
    function tick() {
      ticks += 1;
      pick = items[Math.floor(Math.random() * items.length)] ?? null;
      if (ticks >= totalTicks) {
        window.clearInterval(interval);
        spinning = false;
      }
    }
    interval = window.setInterval(tick, 80);
  }
</script>

{#if loaded && items.length === 0}
  <!-- First-visit empty state — keep silent on the home page. The plan
       says Randomiser is a *capstone*; surfacing an empty wheel is
       worse than not surfacing one. -->
{:else if loaded && items.length > 0}
  <section class="randomiser" aria-label="Randomiser — spin to revisit something you made">
    <header>
      <h2>Spin the wheel</h2>
      <p class="muted">Your other apps put these here. Tap to revisit one at random.</p>
    </header>

    <div class="dial" class:spinning>
      <div class="face">
        {#if pick}
          <strong>{pick.label}</strong>
          <span class="muted small">{pick.detail}</span>
        {:else}
          <span class="muted">Spin to start</span>
        {/if}
      </div>
    </div>

    <div class="actions">
      <button type="button" class="primary" onclick={spin} disabled={spinning}>
        {spinning ? 'Spinning…' : pick ? 'Spin again' : 'Spin'}
      </button>
      {#if pick && !spinning}
        <a class="ghost-link" href={urlForSource(pick.sourceSlug)}>Open {pick.sourceSlug.replace(/^app_/, '').replace(/_/g, ' ')}</a>
      {/if}
    </div>

    <p class="muted small footnote">
      You didn't add anything to this wheel — your other apps did. Filled from {items.length} cross-app moments.
    </p>
  </section>
{/if}

<style>
  .randomiser {
    /* Component-scoped locals for the two paper shades + dial accent.
       Hoisted so no raw hex lives in the rule bodies. */
    --randomiser-paper-light: #FBF6E8;
    --randomiser-paper-deep: var(--paper-warm-strong);
    --randomiser-dial: #C97B2D;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 24px 22px;
    background: linear-gradient(135deg, var(--randomiser-paper-light) 0%, var(--randomiser-paper-deep) 100%);
    border: 1px solid rgba(42, 31, 22, 0.16);
    margin: 0 0 18px;
  }

  header h2 {
    margin: 0 0 4px;
    font-family: 'Fraunces', serif;
    font-weight: 600;
    font-size: 20px;
    letter-spacing: -0.01em;
  }
  .muted { color: rgba(42, 31, 22, 0.6); font-size: 13px; margin: 0; }
  .muted.small { font-size: 12px; }

  .dial {
    min-height: 96px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fff;
    border: 1px solid rgba(42, 31, 22, 0.16);
    padding: 18px 16px;
    transition: transform 0.12s ease;
  }
  .dial.spinning { animation: jitter 0.16s ease-in-out infinite; }

  .face {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    text-align: center;
  }
  .face strong {
    font-family: 'Fraunces', serif;
    font-size: 22px;
    font-weight: 600;
    color: var(--ink-warm-deep);
    letter-spacing: -0.01em;
  }

  .actions {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .primary {
    height: 42px;
    padding: 0 22px;
    background: var(--randomiser-dial);
    color: var(--paper-warm-strong);
    border: 0;
    cursor: pointer;
    font-weight: 500;
  }
  .primary:disabled { opacity: 0.5; cursor: not-allowed; }

  .ghost-link {
    color: var(--ink-warm-deep);
    text-decoration: underline;
    font-size: 14px;
  }

  .footnote { font-style: italic; }

  @keyframes jitter {
    0%   { transform: translateX(-1px); }
    50%  { transform: translateX(1px); }
    100% { transform: translateX(-1px); }
  }
</style>
