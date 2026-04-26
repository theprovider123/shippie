<script lang="ts">
  type Scope = 'public' | 'unlisted' | 'private';

  let { slug, initial }: { slug: string; initial: Scope } = $props();

  let scope = $state<Scope>(initial);
  let saving = $state(false);
  let error = $state<string | null>(null);

  const OPTIONS: Array<{ value: Scope; label: string; blurb: string }> = [
    { value: 'public', label: 'Public', blurb: 'Listed on /apps and /leaderboards.' },
    { value: 'unlisted', label: 'Unlisted', blurb: 'Anyone with the URL can open. Not listed.' },
    { value: 'private', label: 'Private', blurb: 'Invitees only. Hidden from search.' },
  ];

  async function onChange(next: Scope) {
    if (next === scope) return;
    error = null;
    saving = true;
    const res = await fetch(`/api/apps/${encodeURIComponent(slug)}/visibility`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ visibility_scope: next }),
    });
    saving = false;
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      error = j.error ?? 'Save failed';
      return;
    }
    scope = next;
  }
</script>

<div class="picker">
  {#each OPTIONS as opt (opt.value)}
    <label class:active={scope === opt.value}>
      <input
        type="radio"
        name="visibility"
        value={opt.value}
        checked={scope === opt.value}
        disabled={saving}
        onchange={() => onChange(opt.value)}
      />
      <div>
        <strong>{opt.label}</strong>
        <p>{opt.blurb}</p>
      </div>
    </label>
  {/each}
  {#if error}
    <p class="error">{error}</p>
  {/if}
</div>

<style>
  .picker { display: flex; flex-direction: column; gap: 0.5rem; }
  label {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    padding: 0.875rem 1rem;
    border: 1px solid #E5DDC8;
    border-radius: 8px;
    cursor: pointer;
  }
  label.active { border-color: #E8603C; background: rgba(232,96,60,0.04); }
  label p { margin: 2px 0 0 0; font-size: 13px; color: #8B847A; }
  .error { color: #B43F2A; font-size: 13px; margin: 0; }
  input[type='radio'] { margin-top: 4px; }
  @media (prefers-color-scheme: dark) {
    label { border-color: #2A251E; }
  }
</style>
