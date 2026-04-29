<script lang="ts">
  import type { PageProps } from './$types';
  import { enhance } from '$app/forms';

  let { data, form }: PageProps = $props();

  // Local editor state, seeded from the loader's serialized JSON.
  let text = $state(data.initialJsonText);
  let saving = $state(false);
  let resetting = $state(false);

  // Friendly labels for the auto-detected enhance rules.
  const RULE_LABEL: Record<string, string> = {
    textures: 'Sensory textures (haptic + sound + visual)',
    wakelock: 'Keep screen awake during use',
    'share-target': 'Receive shared content from other apps'
  };
</script>

<svelte:head>
  <title>Enhancements · {data.app.name}</title>
</svelte:head>

<header class="head">
  <h1>Enhancements</h1>
  {#if data.profile}
    <p class="lede">
      Shippie auto-detected the following capabilities for
      <strong>{data.profile.inferredName}</strong>. Override anything in
      <code>shippie.json</code> below.
    </p>
    <p class="meta">
      Inferred category: <strong>{data.profile.category.primary}</strong>
      {#if data.profile.category.confidence > 0}
        · {Math.round(data.profile.category.confidence * 100)}% confidence
      {/if}
    </p>
  {:else}
    <p class="lede">
      This app hasn't been analysed yet. The next deploy will populate this view.
    </p>
  {/if}
</header>

{#if data.profile}
  <section class="section">
    <h2>Active (auto-detected)</h2>
    {#if data.detected.length === 0}
      <p class="muted">No enhancements active.</p>
    {:else}
      <ul class="detected">
        {#each data.detected as { selector, rule } (`${selector}::${rule}`)}
          <li>
            <span class="rule">{RULE_LABEL[rule] ?? rule}</span>
            <code class="selector">{selector}</code>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="section">
    <h2>Available (opt-in)</h2>
    {#if data.available.length === 0}
      <p class="muted">You've enabled every available capability.</p>
    {:else}
      <ul class="available">
        {#each data.available as cap (cap.id)}
          <li class="cap-card">
            <h3>{cap.label}</h3>
            <p>{cap.blurb}</p>
            <a href={cap.docsHref}>Docs →</a>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<section class="section">
  <h2>shippie.json</h2>
  <p class="muted">Override anything Shippie auto-detected. Saves apply on the next deploy.</p>

  <form
    method="POST"
    action="?/save"
    use:enhance={() => {
      saving = true;
      return async ({ update }) => {
        await update({ reset: false });
        saving = false;
      };
    }}
  >
    <textarea
      name="shippieJson"
      bind:value={text}
      rows="14"
      spellcheck="false"
      autocomplete="off"
    ></textarea>

    {#if form?.error}
      <p class="error">{form.error}</p>
    {:else if form?.saved}
      <p class="ok">
        {form.reset ? 'Reset. Next deploy uses auto-detected defaults.' : 'Saved. Next deploy uses the new config.'}
      </p>
    {/if}

    <div class="actions">
      <button type="submit" class="btn primary" disabled={saving || resetting}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button
        type="submit"
        formaction="?/reset"
        class="btn secondary"
        disabled={saving || resetting}
        onclick={(e) => {
          if (!confirm('Reset to auto-detected enhancements? This clears your shippie.json overrides.')) {
            e.preventDefault();
            return;
          }
          resetting = true;
          // After the form submit, reset the local state so the textarea
          // clears too; SvelteKit re-runs the loader so data.initialJsonText
          // updates on the next render.
          text = '{}';
        }}
      >
        Reset to auto
      </button>
    </div>
  </form>
</section>

<style>
  .head {
    margin-bottom: var(--space-xl);
  }
  .head h1 {
    font-family: var(--font-heading);
    font-size: var(--h2-size);
    margin: 0 0 0.5rem;
    letter-spacing: -0.01em;
  }
  .lede {
    color: var(--text-secondary);
    margin: 0;
    font-size: var(--body-size);
  }
  .meta {
    color: var(--text-light);
    font-family: var(--font-mono);
    font-size: var(--small-size);
    margin: 0.25rem 0 0;
  }
  code {
    font-family: var(--font-mono);
    font-size: 0.95em;
    color: var(--marigold);
  }

  .section {
    margin-bottom: var(--space-xl);
  }
  .section h2 {
    font-family: var(--font-heading);
    font-size: 1.25rem;
    margin: 0 0 var(--space-sm);
  }

  .muted {
    color: var(--text-light);
    margin: 0 0 0.75rem;
  }

  .detected {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .detected li {
    padding: 10px 14px;
    border: 1px solid var(--border-light);
    border-radius: 0;
    background: var(--surface);
    font-size: var(--small-size);
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    align-items: center;
  }
  .selector {
    color: var(--text-light);
    font-size: 12px;
  }

  .available {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: var(--space-md);
  }
  .cap-card {
    padding: 14px 16px;
    border: 1px solid var(--border-light);
    border-radius: 0;
    background: var(--surface);
  }
  .cap-card h3 {
    margin: 0 0 0.25rem;
    font-size: 1rem;
    font-weight: 600;
  }
  .cap-card p {
    margin: 0 0 0.5rem;
    font-size: var(--small-size);
    color: var(--text-secondary);
    line-height: 1.5;
  }
  .cap-card a {
    color: var(--sunset);
    font-size: var(--small-size);
    font-weight: 500;
  }
  .cap-card a:hover { text-decoration: underline; }

  textarea {
    width: 100%;
    font-family: var(--font-mono);
    font-size: 13px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 0;
    background: var(--surface);
    color: var(--text);
    resize: vertical;
    min-height: 280px;
  }
  textarea:focus {
    outline: none;
    border-color: var(--sunset);
  }

  .error {
    color: #B43F2A;
    font-size: var(--small-size);
    margin: 8px 0 0;
  }
  .ok {
    color: var(--sage-leaf);
    font-size: var(--small-size);
    margin: 8px 0 0;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 12px;
  }
  .btn {
    padding: 0.5rem 1rem;
    border-radius: 0;
    font-size: var(--small-size);
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
  }
  .btn:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn.primary {
    background: var(--sunset);
    color: var(--bg-pure);
  }
  .btn.primary:hover:not(:disabled) { background: var(--sunset-hover); }
  .btn.secondary {
    background: transparent;
    color: var(--text);
    border-color: var(--border);
  }
  .btn.secondary:hover:not(:disabled) { border-color: var(--text-secondary); }
</style>
