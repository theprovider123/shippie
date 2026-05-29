<script lang="ts">
  import type { ActionData, PageData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  const cover = $derived(data.app.screenshotUrls?.[0] ?? '');
</script>

<svelte:head><title>Profile · {data.app.name}</title></svelte:head>

<header>
  <p><a href={`/dashboard/apps/${data.app.slug}`}>Dashboard</a> · app profile</p>
  <h1>{data.app.name}</h1>
  <span>Listing details, media, trust links</span>
</header>

{#if form?.ok}<p class="ok">Profile saved.</p>{/if}
{#if form?.error}<p class="err">{form.error}</p>{/if}

<form method="POST" action="?/save">
  <section>
    <label>
      Name
      <input name="name" value={data.app.name} maxlength="80" required />
    </label>
    <label>
      Tagline
      <input name="tagline" value={data.app.tagline ?? ''} maxlength="160" />
    </label>
    <label>
      Category
      <input name="category" value={data.app.category} maxlength="48" required />
    </label>
    <label class="wide">
      Description
      <textarea name="description" rows="7" maxlength="2000">{data.app.description ?? ''}</textarea>
    </label>
  </section>

  <section>
    <label>
      Icon URL
      <input name="iconUrl" value={data.app.iconUrl ?? ''} inputmode="url" />
    </label>
    <label>
      Cover image URL
      <input name="coverUrl" value={cover} inputmode="url" />
    </label>
    <label>
      Source repo
      <input name="sourceRepo" value={data.lineage?.sourceRepo ?? data.app.githubRepo ?? ''} inputmode="url" />
    </label>
    <label>
      License
      <input name="license" value={data.lineage?.license ?? ''} placeholder="MIT, AGPL-3.0, Apache-2.0" />
    </label>
  </section>

  <section>
    <label>
      Support email
      <input name="supportEmail" value={data.app.supportEmail ?? ''} />
    </label>
    <label>
      Privacy policy URL
      <input name="privacyPolicyUrl" value={data.app.privacyPolicyUrl ?? ''} inputmode="url" />
    </label>
    <label>
      Terms URL
      <input name="termsUrl" value={data.app.termsUrl ?? ''} inputmode="url" />
    </label>
    <label class="check">
      <input name="remixAllowed" type="checkbox" checked={data.lineage?.remixAllowed ?? false} />
      Allow remixing when source and license are present
    </label>
  </section>

  <button type="submit">Save profile</button>
</form>

<style>
  header { margin-bottom: 1.5rem; }
  header p { margin: 0; color: var(--sunset); font-family: ui-monospace, monospace; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; }
  header a { color: inherit; text-decoration: none; }
  h1 { margin: 0.25rem 0; font-size: 2rem; }
  header span, .ok, .err { color: var(--text-muted-warm); }
  .ok { color: var(--success); }
  .err { color: var(--danger); }
  form { display: flex; flex-direction: column; gap: 1.25rem; max-width: 920px; }
  section { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; border-top: 1px solid var(--paper-cream); padding-top: 1rem; }
  label { display: flex; flex-direction: column; gap: 0.35rem; color: var(--ink-soft-warm); font-size: 0.85rem; font-weight: 700; }
  label.wide { grid-column: 1 / -1; }
  label.check { flex-direction: row; align-items: center; grid-column: 1 / -1; font-weight: 500; }
  input, textarea { border: 1px solid var(--border-cream-soft); background: transparent; padding: 0.7rem; font: inherit; color: inherit; }
  button { align-self: flex-start; border: 0; background: var(--sunset); color: white; padding: 0.75rem 1rem; cursor: pointer; }
  @media (max-width: 640px) {
    section { grid-template-columns: 1fr; }
  }
</style>
