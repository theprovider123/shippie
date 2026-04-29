<!--
  /dev/gesture-prototype — real-phone tuning ground for the
  AppSwitcherGesture component.

  Open this on a real iPhone Safari + real Android Chrome PWA, then:
    - Pull from the left edge → drawer should slide in like opening
      a drawer in a beautifully-built piece of furniture. Smooth,
      weighted, satisfying.
    - Tap the bottom pill → drawer should rise up from the bottom
      with the same feel.
    - Tap a tile → the "app" should switch instantly (visible
      transition &lt; 50ms because both panes are mounted).
    - Tap the dimmed backdrop → drawer dismisses with a slightly
      faster reverse curve.
    - Press Escape on a hardware keyboard → drawer closes.

  Tune the constants in AppSwitcherGesture.svelte until each of
  these moments feels right. Don't ship the rest of the unification
  plan until this gesture is right.
-->
<script lang="ts">
  import AppSwitcherGesture from '$lib/container/AppSwitcherGesture.svelte';

  const FAKE_APPS = [
    { id: 'recipe', name: 'Recipe Saver', accent: '#E8603C', body: '🍝 Carbonara — 4 servings' },
    { id: 'pantry', name: 'Pantry Scanner', accent: '#74A57F', body: '🥫 12 items in stock' },
    { id: 'meal', name: 'Meal Planner', accent: '#E8603C', body: '📅 5 of 7 days planned' },
    { id: 'budget', name: 'Budget Tracker', accent: '#4E7C9A', body: '💰 82% of weekly budget' },
    { id: 'workout', name: 'Workout Logger', accent: '#5EA777', body: '💪 8 sessions this week' },
    { id: 'sleep', name: 'Sleep Logger', accent: '#4E7C9A', body: '🛌 Avg 7.2h last 14 nights' },
  ];

  let drawerOpen = $state(false);
  let activeAppId = $state(FAKE_APPS[0]!.id);
  let edge = $state<'left' | 'bottom'>('left');

  const activeApp = $derived(FAKE_APPS.find((a) => a.id === activeAppId)!);

  function pickApp(id: string) {
    activeAppId = id;
    drawerOpen = false;
  }
</script>

<svelte:head>
  <title>Gesture Prototype — Shippie</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
</svelte:head>

<div
  class="fake-app"
  style:--accent={activeApp.accent}
  style:transform={drawerOpen ? 'scale(0.95)' : 'scale(1)'}
  style:opacity={drawerOpen ? '0.5' : '1'}
  style:transition="transform 200ms cubic-bezier(0.32, 1.03, 0.4, 1), opacity 200ms cubic-bezier(0.32, 1.03, 0.4, 1)"
>
  <header>
    <h1>{activeApp.name}</h1>
    <p>This pretends to be a maker app full-bleed. The container chrome is invisible.</p>
  </header>
  <main>
    <p class="big">{activeApp.body}</p>
    <p class="hint">
      Swipe from the left edge, tap the bottom pill, or press Escape to open the
      app switcher.
    </p>
    <fieldset>
      <legend>Tuning</legend>
      <label>
        <input type="radio" name="edge" value="left" checked={edge === 'left'} onchange={() => (edge = 'left')} />
        Left edge
      </label>
      <label>
        <input type="radio" name="edge" value="bottom" checked={edge === 'bottom'} onchange={() => (edge = 'bottom')} />
        Bottom pill (only)
      </label>
    </fieldset>
  </main>
</div>

<AppSwitcherGesture
  open={drawerOpen}
  onOpenChange={(value) => (drawerOpen = value)}
  {edge}
>
  <div class="drawer-content">
    <h2>Apps</h2>
    <p class="drawer-hint">Tap to switch. Should feel &lt; 50ms because both panes are mounted.</p>
    <div class="grid">
      {#each FAKE_APPS as app (app.id)}
        <button
          class="tile"
          class:active={app.id === activeAppId}
          style:--accent={app.accent}
          onclick={() => pickApp(app.id)}
        >
          <span class="dot" aria-hidden="true"></span>
          <strong>{app.name}</strong>
          <small>{app.body}</small>
        </button>
      {/each}
    </div>
  </div>
</AppSwitcherGesture>

<style>
  :root {
    color-scheme: light;
  }
  :global(html, body, #root, #svelte) {
    margin: 0;
    padding: 0;
    height: 100%;
    background: #faf7ef;
    color: #14120f;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
  }
  .fake-app {
    position: fixed;
    inset: 0;
    background: var(--accent);
    color: #fff;
    display: flex;
    flex-direction: column;
    padding: env(safe-area-inset-top, 24px) 24px env(safe-area-inset-bottom, 24px);
    box-sizing: border-box;
    transform-origin: 50% 40%;
  }
  header h1 {
    margin: 0 0 4px;
    font-size: 28px;
    font-weight: 600;
  }
  header p {
    margin: 0 0 32px;
    opacity: 0.85;
    font-size: 14px;
  }
  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 24px;
    max-width: 480px;
    margin: 0 auto;
    width: 100%;
  }
  .big {
    margin: 0;
    font-size: 32px;
    font-weight: 600;
  }
  .hint {
    margin: 0;
    opacity: 0.85;
    font-size: 15px;
    line-height: 1.5;
  }
  fieldset {
    border: 1px solid rgba(255, 255, 255, 0.3);
    padding: 12px 16px;
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    background: rgba(255, 255, 255, 0.1);
  }
  fieldset legend {
    padding: 0 8px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    opacity: 0.85;
  }
  label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    cursor: pointer;
  }

  .drawer-content {
    padding: 24px 20px env(safe-area-inset-bottom, 24px);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .drawer-content h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 600;
  }
  .drawer-hint {
    margin: 0;
    color: rgba(0, 0, 0, 0.55);
    font-size: 13px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 8px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 12px;
    border: 1px solid rgba(0, 0, 0, 0.08);
    background: rgba(255, 255, 255, 0.85);
    cursor: pointer;
    text-align: left;
    color: #14120f;
    font: inherit;
  }
  .tile.active {
    border-color: var(--accent);
    background: #fff;
    box-shadow: 0 0 0 2px var(--accent);
  }
  .tile strong {
    font-size: 14px;
  }
  .tile small {
    color: rgba(0, 0, 0, 0.55);
    font-size: 12px;
  }
  .dot {
    width: 24px;
    height: 24px;
    background: var(--accent);
    border-radius: 50%;
    margin-bottom: 4px;
  }
</style>
