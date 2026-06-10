<script lang="ts">
  import { toast } from '$lib/stores/toast';
  import Sheet from '$lib/components/ui/Sheet.svelte';

  interface Props {
    slug: string;
    name: string;
    themeColor: string;
    iconEmoji?: string | null;
    iconUrl?: string | null;
    onClose: () => void;
    onSaved: (newSlug: string, newName: string) => void;
  }

  let {
    slug,
    name,
    themeColor,
    iconEmoji = null,
    iconUrl = null,
    onClose,
    onSaved,
  }: Props = $props();

  let editName = $state(name);
  let editSlug = $state(slug);
  let editThemeColor = $state(themeColor);
  let editIconEmoji = $state(iconEmoji ?? '');
  let iconTab = $state<'colour' | 'emoji' | 'upload'>('colour');
  let slugAvailable = $state<boolean | null>(null);
  let checkingSlug = $state(false);
  let saving = $state(false);
  let uploadPreview = $state<string | null>(null);
  let newIconUrl = $state(iconUrl ?? '');

  const slugChanged = $derived(editSlug !== slug);
  const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  const slugValid = $derived(SLUG_RE.test(editSlug));

  const PRESET_COLORS = [
    '#e8603c', '#f5a623', '#2d9a6c', '#3b82f6',
    '#8b5cf6', '#ec4899', '#14120f', '#f8f4ed',
  ];

  const EMOJI_GRID = [
    '⚽','🏆','🎮','🎯','📱','💻','🎨','📚',
    '🌍','☀️','🌙','⭐','🔥','💎','🎵','🎲',
    '🚀','🌊','🌸','🍕','☕','🏠','🎭','🦁',
    '🐝','🌈','💡','🔮','🎪','🏔️','🌺','⚡',
    '🎸','🎹','🎺','🥁',
  ];

  let slugDebounce: ReturnType<typeof setTimeout> | null = null;

  async function checkSlug(val: string) {
    if (val === slug) { slugAvailable = null; return; }
    if (!SLUG_RE.test(val)) { slugAvailable = false; return; }
    checkingSlug = true;
    const res = await fetch(`/api/apps/slug-check?slug=${encodeURIComponent(val)}&exclude=${encodeURIComponent(slug)}`);
    const data = (await res.json()) as { available: boolean };
    slugAvailable = data.available;
    checkingSlug = false;
  }

  function onSlugInput(e: Event) {
    editSlug = (e.target as HTMLInputElement).value.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (slugDebounce) clearTimeout(slugDebounce);
    slugDebounce = setTimeout(() => checkSlug(editSlug), 400);
  }

  function onNameInput(e: Event) {
    editName = (e.target as HTMLInputElement).value.slice(0, 64);
    if (editSlug === slug) {
      editSlug = editName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
    }
  }

  async function handleFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0] ?? null;
    if (!file) return;
    uploadPreview = URL.createObjectURL(file);
    const fd = new FormData();
    fd.set('file', file);
    const res = await fetch(`/api/apps/${encodeURIComponent(slug)}/icon`, { method: 'POST', body: fd });
    if (res.ok) {
      const j = (await res.json()) as { iconUrl: string };
      newIconUrl = j.iconUrl;
    } else {
      toast.push({ kind: 'error', message: 'Icon upload failed' });
    }
  }

  async function save() {
    if (!editName.trim()) return;
    if (!slugValid) return;
    if (slugChanged && slugAvailable === false) return;
    saving = true;
    const body: Record<string, unknown> = { name: editName, slug: editSlug, themeColor: editThemeColor };
    if (iconTab === 'emoji' && editIconEmoji) body.iconEmoji = editIconEmoji;
    if (iconTab === 'upload' && newIconUrl) body.iconUrl = newIconUrl;
    const res = await fetch(`/api/apps/${encodeURIComponent(slug)}/identity`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    saving = false;
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      toast.push({ kind: 'error', message: j.error === 'slug_taken' ? 'That slug is already taken.' : 'Save failed.' });
      return;
    }
    const j = (await res.json()) as { slug: string; name: string };
    toast.push({ kind: 'success', message: 'Identity saved.' });
    onSaved(j.slug, j.name);
  }
</script>

<Sheet open={true} {onClose} label="Edit app identity">
  <header class="head">
    <p class="eyebrow">Maker</p>
    <h2>App identity</h2>
  </header>

  <label class="field">
    <span>Name</span>
    <input type="text" value={editName} oninput={onNameInput} maxlength="64" placeholder="App name" />
  </label>

  <label class="field">
    <span>Slug</span>
    <div class="slug-row">
      <input
        type="text"
        value={editSlug}
        oninput={onSlugInput}
        placeholder="my-app"
        class:invalid={editSlug && !slugValid}
        class:taken={slugChanged && slugAvailable === false}
      />
      {#if checkingSlug}
        <span class="slug-state">…</span>
      {:else if slugChanged && slugAvailable === true}
        <span class="slug-state ok">✓ available</span>
      {:else if slugChanged && slugAvailable === false}
        <span class="slug-state err">✗ taken</span>
      {/if}
    </div>
    {#if slugChanged}
      <p class="slug-warn">Old URL ({slug}.shippie.app) will redirect for 30 days.</p>
    {/if}
  </label>

  <fieldset class="icon-tabs">
    <legend class="tab-legend">Icon</legend>
    <div class="tab-row">
      <button type="button" class:active={iconTab === 'colour'} onclick={() => iconTab = 'colour'}>Colour</button>
      <button type="button" class:active={iconTab === 'emoji'} onclick={() => iconTab = 'emoji'}>Emoji</button>
      <button type="button" class:active={iconTab === 'upload'} onclick={() => iconTab = 'upload'}>Upload</button>
    </div>

    {#if iconTab === 'colour'}
      <div class="colour-picker">
        {#each PRESET_COLORS as c (c)}
          <button
            type="button"
            class="colour-swatch"
            class:selected={editThemeColor === c}
            style:background={c}
            onclick={() => editThemeColor = c}
            aria-label={`Colour ${c}`}
          ></button>
        {/each}
        <input type="color" bind:value={editThemeColor} title="Custom colour" class="colour-custom" />
      </div>
    {:else if iconTab === 'emoji'}
      <div class="emoji-grid">
        {#each EMOJI_GRID as em (em)}
          <button
            type="button"
            class="emoji-btn"
            class:selected={editIconEmoji === em}
            onclick={() => editIconEmoji = em}
          >{em}</button>
        {/each}
      </div>
    {:else}
      <label class="upload-zone">
        <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onchange={handleFileChange} class="sr-only" />
        {#if uploadPreview}
          <img src={uploadPreview} alt="Icon preview" class="upload-preview" />
          <span>Change</span>
        {:else}
          <span>Drop or tap to upload (PNG, JPG, WebP, SVG — max 1 MB)</span>
        {/if}
      </label>
    {/if}
  </fieldset>

  <div class="modal-actions">
    <button type="button" class="btn" onclick={onClose}>Cancel</button>
    <button
      type="button"
      class="btn btn-primary"
      onclick={save}
      disabled={saving || !editName.trim() || !slugValid || (slugChanged && slugAvailable === false)}
    >{saving ? 'Saving…' : 'Save'}</button>
  </div>
</Sheet>

<style>
  .head {
    display: grid;
    gap: 0.2rem;
  }
  .eyebrow {
    margin: 0;
    color: var(--sunset);
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .head h2 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: var(--text-subhead);
    line-height: 1.05;
  }
  .field {
    display: grid;
    gap: 0.35rem;
    font-size: var(--text-body);
  }
  .field > span {
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-light);
  }
  .field input {
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--border-light);
    background: var(--surface);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: var(--text-body);
    width: 100%;
    box-sizing: border-box;
    border-radius: 0;
  }
  .field input:focus {
    outline: none;
    border-color: var(--sunset);
  }
  .field input.invalid,
  .field input.taken {
    border-color: var(--danger, #b43f2a);
  }
  .slug-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .slug-row input { flex: 1; min-width: 0; }
  .slug-state {
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    white-space: nowrap;
    color: var(--text-secondary);
  }
  .slug-state.ok { color: var(--success, #2e7d5b); }
  .slug-state.err { color: var(--danger, #b43f2a); }
  .slug-warn {
    margin: 0.25rem 0 0;
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    color: var(--marigold, #e8c547);
  }
  .icon-tabs {
    border: 1px solid var(--border-light);
    padding: 0.85rem 0.9rem 1rem;
    margin: 0;
  }
  .tab-legend {
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-light);
    padding: 0 0.25rem;
  }
  .tab-row {
    display: flex;
    gap: 1px;
    margin-bottom: 0.85rem;
    background: var(--border-light);
  }
  .tab-row button {
    flex: 1;
    min-height: 36px;
    border: 0;
    background: var(--surface);
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .tab-row button.active {
    background: var(--sunset);
    color: #fff;
  }
  .colour-picker { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
  .colour-swatch {
    width: 32px;
    height: 32px;
    border: 2px solid transparent;
    cursor: pointer;
    flex-shrink: 0;
  }
  .colour-swatch.selected { border-color: var(--text); }
  .colour-custom {
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--border-light);
    cursor: pointer;
    border-radius: 0;
  }
  .emoji-grid { display: grid; grid-template-columns: repeat(9, 1fr); gap: 4px; }
  .emoji-btn {
    background: none;
    border: 1px solid transparent;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 4px;
    text-align: center;
    border-radius: 0;
  }
  .emoji-btn.selected {
    border-color: var(--sunset);
    background: rgba(232, 96, 60, 0.08);
  }
  .upload-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    border: 1px dashed var(--border-light);
    padding: 1.5rem;
    cursor: pointer;
    text-align: center;
    font-size: var(--text-small);
    color: var(--text-secondary);
  }
  .upload-preview { width: 80px; height: 80px; object-fit: contain; }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
  .btn {
    min-height: var(--touch-min, 44px);
    padding: 0 1.1rem;
    border: 1px solid var(--border-light);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text-small);
    cursor: pointer;
    border-radius: 0;
  }
  .btn:hover {
    border-color: var(--text-secondary);
  }
  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .btn-primary {
    border-color: var(--sunset);
    background: var(--sunset);
    color: #fff;
  }
  .btn-primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--sunset) 88%, #fff);
    border-color: color-mix(in srgb, var(--sunset) 88%, #fff);
  }
</style>
