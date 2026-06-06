<script lang="ts">
  import LauncherCard from '$lib/components/marketplace/LauncherCard.svelte';
  import LauncherCardV2 from '$lib/components/marketplace/LauncherCardV2.svelte';
  import {
    ToolCard,
    ToolRow,
    launcherAppToToolDisplay,
    toolState,
  } from '$lib/components/tool-surface';
  import {
    displayCategory,
    formatRecency,
    normaliseBlurb,
    titleCap,
  } from '$lib/marketplace/display-text';
  import { LAB_FIXTURES } from './fixtures';

  let variant = $state<'v1' | 'v2' | 'primitives' | 'split'>('split');
  let containerWidth = $state<'narrow' | 'standard' | 'wide'>('standard');

  const widthPx = $derived(
    containerWidth === 'narrow' ? 280 : containerWidth === 'wide' ? 520 : 360,
  );
  const EMPTY_SLUGS: ReadonlySet<string> = new Set();

  function previewState(slug: string, pinned: boolean, recentLabel: string) {
    return toolState({
      slug,
      isRunning: false,
      savedSlugs: pinned ? new Set([slug]) : EMPTY_SLUGS,
      recentSlugs: recentLabel ? new Set([slug]) : EMPTY_SLUGS,
      download: pinned ? 'saved' : 'idle',
      updateSeverity: null,
      surface: 'tools',
    });
  }
</script>

<svelte:head>
  <title>Launcher lab · Shippie</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="lab">
  <header class="lab-head">
    <p class="eyebrow">/dev/launcher-lab</p>
    <h1>Launcher lab</h1>
    <p class="lede">
      Worst-case fixtures for the launcher card. Edit
      <code>src/routes/dev/launcher-lab/fixtures.ts</code> to add cases. Use the
      width selector to see container-query behaviour without resizing the browser.
    </p>
    <div class="controls">
      <fieldset>
        <legend>Variant</legend>
        <label><input type="radio" bind:group={variant} value="v1" /> v1 (legacy)</label>
        <label><input type="radio" bind:group={variant} value="v2" /> v2 (interim)</label>
        <label><input type="radio" bind:group={variant} value="primitives" /> primitives</label>
        <label><input type="radio" bind:group={variant} value="split" /> split (all)</label>
      </fieldset>
      <fieldset>
        <legend>Container width</legend>
        <label><input type="radio" bind:group={containerWidth} value="narrow" /> narrow (280)</label>
        <label><input type="radio" bind:group={containerWidth} value="standard" /> standard (360)</label>
        <label><input type="radio" bind:group={containerWidth} value="wide" /> wide (520)</label>
      </fieldset>
    </div>
  </header>

  {#each LAB_FIXTURES as fixture (fixture.id)}
    {@const displayed = {
      ...fixture.app,
      name: titleCap(fixture.app.name),
      tagline: normaliseBlurb(fixture.app.tagline),
      description: normaliseBlurb(fixture.app.description),
      category: displayCategory(fixture.app.category),
    }}
    {@const primitiveApp = launcherAppToToolDisplay(displayed)}
    {@const primitiveState = previewState(displayed.slug, fixture.pinned, fixture.recentLabel || '')}
    <section class="case">
      <header class="case-head">
        <h2>{fixture.label}</h2>
        <p class="case-notes">{fixture.notes}</p>
        <dl class="case-data">
          <dt>slug</dt><dd><code>{fixture.app.slug}</code></dd>
          <dt>raw title</dt><dd><code>{fixture.app.name}</code></dd>
          <dt>display title</dt><dd><code>{displayed.name}</code></dd>
          <dt>raw category</dt><dd><code>{fixture.app.category}</code></dd>
          <dt>display category</dt><dd><code>{displayed.category}</code></dd>
          <dt>raw blurb len</dt><dd><code>{(fixture.app.tagline ?? '').length}</code></dd>
          <dt>display blurb len</dt><dd><code>{(displayed.tagline ?? '').length}</code></dd>
          <dt>recency</dt><dd><code>{fixture.recentLabel || '—'}</code></dd>
        </dl>
      </header>

      <div class="case-frames">
        {#if variant === 'v1' || variant === 'split'}
          <figure class="frame" style="--frame-w: {widthPx}px">
            <figcaption>v1 — current LauncherCard.svelte</figcaption>
            <div class="frame-body">
              <LauncherCard
                app={displayed}
                pinned={fixture.pinned}
                recentLabel={fixture.recentLabel || ''}
                compact
              />
            </div>
          </figure>
        {/if}
        {#if variant === 'v2' || variant === 'split'}
          <figure class="frame v2" style="--frame-w: {widthPx}px">
            <figcaption>v2 — LauncherCardV2.svelte</figcaption>
            <div class="frame-body">
              <LauncherCardV2
                app={displayed}
                pinned={fixture.pinned}
                recentLabel={fixture.recentLabel || ''}
              />
            </div>
          </figure>
        {/if}
        {#if variant === 'primitives' || variant === 'split'}
          <figure class="frame primitive-card" style="--frame-w: {widthPx}px">
            <figcaption>primitive — ToolCard</figcaption>
            <div class="frame-body">
              <ToolCard
                app={primitiveApp}
                state={primitiveState}
              />
            </div>
          </figure>
          <figure class="frame primitive-row" style="--frame-w: {widthPx}px">
            <figcaption>primitive — ToolRow</figcaption>
            <div class="frame-body cream">
              <ToolRow
                app={primitiveApp}
                state={primitiveState}
                caption={fixture.recentLabel || ''}
              />
            </div>
          </figure>
        {/if}
      </div>
    </section>
  {/each}
</main>

<style>
  .lab {
    max-width: 1180px;
    margin: 0 auto;
    padding: var(--space-xl) clamp(1rem, 3vw, 2rem) var(--space-3xl);
    color: var(--text);
  }
  .lab-head { margin-bottom: var(--space-2xl); }
  .lab-head .eyebrow {
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    color: var(--text-light);
    margin: 0;
  }
  .lab-head h1 {
    font-family: var(--font-heading);
    font-size: 2.25rem;
    margin: 0.25rem 0 var(--space-sm);
    letter-spacing: 0;
  }
  .lab-head .lede {
    color: var(--text-secondary);
    max-width: 56ch;
    margin: 0 0 var(--space-lg);
    line-height: 1.55;
  }
  .lab-head code {
    font-family: var(--font-mono);
    font-size: 0.9em;
    background: var(--surface);
    padding: 1px 6px;
    border: 1px solid var(--border-light);
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-lg);
    padding: var(--space-md);
    border: 1px solid var(--border);
    background: var(--surface);
  }
  .controls fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }
  .controls legend {
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    color: var(--text-light);
    padding: 0;
    margin-right: 8px;
  }
  .controls label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    min-height: var(--touch-min);
    cursor: pointer;
  }
  .controls input[type='radio'] {
    width: 18px;
    height: 18px;
    accent-color: var(--sunset);
  }
  .case {
    margin-top: var(--space-2xl);
    padding-top: var(--space-lg);
    border-top: 1px solid var(--border-light);
  }
  .case-head h2 {
    font-family: var(--font-heading);
    font-size: 1.25rem;
    margin: 0;
    letter-spacing: 0;
  }
  .case-notes {
    color: var(--text-secondary);
    margin: 6px 0 var(--space-md);
    font-size: 14px;
    max-width: 64ch;
  }
  .case-data {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 4px 12px;
    margin: 0 0 var(--space-md);
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-light);
  }
  .case-data dt { color: var(--text-light); }
  .case-data dd { margin: 0; color: var(--text-secondary); }
  .case-data code { font-family: inherit; background: transparent; padding: 0; border: 0; color: var(--text); }

  .case-frames {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-lg);
  }
  .frame {
    margin: 0;
    flex: 0 0 auto;
    width: var(--frame-w);
    max-width: 100%;
  }
  .frame figcaption {
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    color: var(--text-light);
    margin-bottom: 8px;
  }
  .frame-body {
    width: 100%;
    outline: 1px dashed var(--border-light);
    outline-offset: 4px;
    padding: 0;
    background: var(--bg);
  }
  .frame-body.cream {
    /* Mirror the focused-mode drawer palette so v3 drawer
       density is readable against its real backdrop, not the
       dark launcher. */
    background: var(--cream-bg, #faf7ef);
    color: var(--cream-text, #14120f);
    --bg: var(--cream-bg, #faf7ef);
    --surface: var(--cream-bg, #faf7ef);
    --surface-alt: rgba(0, 0, 0, 0.04);
    --text: var(--cream-text, #14120f);
    --text-secondary: rgba(0, 0, 0, 0.6);
    --text-light: rgba(0, 0, 0, 0.48);
    --border: rgba(0, 0, 0, 0.12);
    --border-light: rgba(0, 0, 0, 0.08);
  }
</style>
