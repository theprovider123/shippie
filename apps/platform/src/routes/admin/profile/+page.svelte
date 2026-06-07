<script lang="ts">
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const publicPath = $derived(data.profile.username ? `/@${data.profile.username}` : null);
  const maxDevice = $derived(Math.max(1, ...data.platformPulse.deviceSplit.map((row) => row.count)));

  function n(value: number | null | undefined): string {
    return Number(value ?? 0).toLocaleString();
  }

  function pct(value: number, max: number): number {
    return Math.max(4, Math.round((Number(value || 0) / max) * 100));
  }
</script>

<svelte:head><title>Admin · Builder Profile · Shippie</title></svelte:head>

<header class="header">
  <p class="eyebrow">Admin · Builder profile</p>
  <h1>Your public presence</h1>
  <p class="lede">
    The builder page should help people understand who shipped the work, where to follow it,
    and how to support it. This is public profile data, not analytics identity.
  </p>
</header>

{#if data.status === 'unavailable'}
  <section class="notice error">Database unavailable in this environment.</section>
{/if}
{#if form?.ok}
  <section class="notice ok">Profile saved.</section>
{/if}
{#if form?.error}
  <section class="notice error">{form.error}</section>
{/if}

<section class="platform-pulse">
  <div class="pulse-head">
    <div>
      <p class="eyebrow">Shippie analytics</p>
      <h2>Platform pulse</h2>
    </div>
    <a href="/admin/analytics">Open full analytics</a>
  </div>
  <div class="pulse-grid" aria-label="Anonymous platform pulse">
    <article>
      <span>Apps</span>
      <strong>{n(data.platformPulse.summary.totalApps)}</strong>
      <p>{n(data.platformPulse.summary.liveApps)} live</p>
    </article>
    <article>
      <span>Active apps</span>
      <strong>{n(data.platformPulse.summary.activeApps)}</strong>
      <p>last {data.platformPulse.rangeDays} days</p>
    </article>
    <article>
      <span>Events</span>
      <strong>{n(data.platformPulse.summary.totalEvents)}</strong>
      <p>{n(data.platformPulse.summary.openEvents)} opens</p>
    </article>
    <article>
      <span>Anon sessions</span>
      <strong>{n(data.platformPulse.summary.anonymousSessions)}</strong>
      <p>counted only</p>
    </article>
  </div>
  {#if data.platformPulse.deviceSplit.length > 0}
    <div class="device-list" aria-label="Coarse device split">
      {#each data.platformPulse.deviceSplit as row (row.deviceClass)}
        <div class="device-row">
          <span>{row.deviceClass}</span>
          <div class="bar-track" aria-label={`${row.count} ${row.deviceClass} samples`}>
            <span style={`width:${pct(row.count, maxDevice)}%`}></span>
          </div>
          <strong>{n(row.count)}</strong>
        </div>
      {/each}
    </div>
  {:else}
    <p class="muted">No coarse device samples in this window yet.</p>
  {/if}
</section>

<div class="layout">
  <form method="POST" action="?/save" class="panel">
    <section>
      <h2>Identity</h2>
      <div class="grid">
        <label>
          Display name
          <input name="displayName" value={data.profile.displayName ?? ''} maxlength="80" required />
        </label>
        <label>
          Username
          <span class="prefix">@</span>
          <input name="username" value={data.profile.username ?? ''} maxlength="32" required />
        </label>
        <label>
          Avatar URL
          <input name="avatarUrl" value={data.profile.avatarUrl ?? ''} inputmode="url" />
        </label>
        <label>
          Location
          <input name="location" value={data.profile.location ?? ''} maxlength="80" />
        </label>
        <label class="wide">
          Headline
          <input
            name="headline"
            value={data.profile.headline ?? ''}
            maxlength="140"
            placeholder="Open-source tools for local-first living"
          />
        </label>
        <label class="wide">
          Bio
          <textarea name="bio" rows="7" maxlength="1200">{data.profile.bio ?? ''}</textarea>
        </label>
      </div>
    </section>

    <section>
      <h2>Links</h2>
      <div class="grid">
        <label>
          Website
          <input name="websiteUrl" value={data.profile.websiteUrl ?? ''} inputmode="url" />
        </label>
        <label>
          GitHub
          <input name="github" value={data.profile.githubUrl ?? ''} placeholder="shippie-maker or https://github.com/shippie-maker" />
        </label>
        <label>
          X
          <input name="x" value={data.profile.xUrl ?? ''} placeholder="@username or full URL" />
        </label>
        <label>
          Bluesky
          <input name="bluesky" value={data.profile.blueskyUrl ?? ''} placeholder="name.bsky.social" />
        </label>
        <label>
          Mastodon
          <input name="mastodon" value={data.profile.mastodonUrl ?? ''} placeholder="@name@instance.social" />
        </label>
        <label>
          LinkedIn
          <input name="linkedin" value={data.profile.linkedinUrl ?? ''} placeholder="handle or full URL" />
        </label>
        <label>
          YouTube
          <input name="youtube" value={data.profile.youtubeUrl ?? ''} placeholder="@channel or full URL" />
        </label>
        <label>
          Sponsor / support
          <input name="sponsorUrl" value={data.profile.sponsorUrl ?? ''} inputmode="url" />
        </label>
      </div>
    </section>

    <button type="submit">Save profile</button>
  </form>

  <aside class="preview">
    <p class="eyebrow">Preview</p>
    <div class="avatar">
      {#if data.profile.avatarUrl}
        <img src={data.profile.avatarUrl} alt="" />
      {:else}
        <span>{(data.profile.displayName ?? data.profile.username ?? 'S').slice(0, 1).toUpperCase()}</span>
      {/if}
    </div>
    <h2>{data.profile.displayName ?? 'Unnamed builder'}</h2>
    <p class="handle">{data.profile.username ? `@${data.profile.username}` : 'No handle yet'}</p>
    {#if data.profile.headline}<p>{data.profile.headline}</p>{/if}
    {#if data.profile.location}<p class="muted">{data.profile.location}</p>{/if}
    {#if publicPath}
      <a class="public-link" href={publicPath}>Open public profile</a>
    {:else}
      <p class="muted">Choose a username to unlock a public profile URL.</p>
    {/if}
  </aside>
</div>

<style>
  .header { margin-bottom: 1.5rem; }
  .eyebrow {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--sunset, #E8603C);
    margin: 0;
  }
  h1,
  h2 {
    font-family: var(--font-heading, 'Fraunces', Georgia, serif);
    letter-spacing: -0.02em;
  }
  h1 { font-size: 2.25rem; margin: 0.25rem 0 0.5rem; }
  h2 { margin: 0 0 1rem; }
  .lede,
  .muted,
  .handle { color: var(--text-secondary, #B8A88F); }
  .notice,
  .panel,
  .preview,
  .platform-pulse {
    border: 1px solid var(--border-light, #2A251E);
    background: rgba(255,255,255,0.02);
  }
  .notice { padding: 0.75rem 1rem; margin-bottom: 1rem; }
  .notice.ok { border-color: rgba(122, 154, 110, 0.55); color: var(--sage-highlight, #A8C491); }
  .notice.error { border-color: rgba(232, 96, 60, 0.6); color: var(--sunset, #E8603C); }
  .platform-pulse {
    display: grid;
    gap: 1rem;
    padding: 1rem;
    margin-bottom: 1rem;
  }
  .pulse-head {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: start;
  }
  .pulse-head h2 { margin-bottom: 0; }
  .pulse-head a {
    color: var(--text-secondary, #B8A88F);
    text-decoration: none;
    font-size: 0.9rem;
  }
  .pulse-head a:hover { color: var(--sunset, #E8603C); }
  .pulse-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
  }
  .pulse-grid article {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }
  .pulse-grid span,
  .device-row span {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-secondary, #B8A88F);
  }
  .pulse-grid strong {
    font-family: var(--font-heading, Georgia, serif);
    font-size: 1.55rem;
  }
  .pulse-grid p {
    margin: 0;
    color: var(--text-secondary, #B8A88F);
    font-size: 0.82rem;
  }
  .device-list {
    display: grid;
    gap: 0.65rem;
  }
  .device-row {
    display: grid;
    grid-template-columns: 96px minmax(0, 1fr) 72px;
    gap: 0.75rem;
    align-items: center;
  }
  .bar-track {
    height: 9px;
    border: 1px solid var(--border-light, #2A251E);
  }
  .bar-track span {
    display: block;
    height: 100%;
    background: var(--sunset, #E8603C);
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(260px, 360px);
    gap: 1rem;
    align-items: start;
  }
  .panel { padding: 1.25rem; display: grid; gap: 1.5rem; }
  section { display: grid; gap: 1rem; }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }
  label {
    display: grid;
    gap: 0.35rem;
    position: relative;
    font-size: 0.85rem;
    color: var(--text-secondary, #B8A88F);
  }
  label.wide { grid-column: 1 / -1; }
  .prefix {
    position: absolute;
    left: 0.7rem;
    top: 2.1rem;
    color: var(--text-light, #7A6B58);
  }
  .prefix + input { padding-left: 1.6rem; }
  input,
  textarea {
    border: 1px solid var(--border-light, #2A251E);
    background: var(--surface, #1E1A15);
    color: var(--text, #EDE4D3);
    padding: 0.7rem;
    font: inherit;
  }
  textarea { resize: vertical; }
  button,
  .public-link {
    justify-self: start;
    border: 1px solid var(--sunset, var(--sunset));
    background: var(--sunset, #E8603C);
    color: white;
    padding: 0.75rem 1rem;
    font-weight: 700;
    cursor: pointer;
    text-decoration: none;
  }
  .preview { padding: 1.25rem; position: sticky; top: 1rem; }
  .avatar {
    width: 88px;
    height: 88px;
    display: grid;
    place-items: center;
    background: var(--sunset, #E8603C);
    color: var(--bg-pure, #0F0D0A);
    margin: 1rem 0;
    overflow: hidden;
    font-family: var(--font-heading, Georgia, serif);
    font-size: 2rem;
  }
  .avatar img { width: 100%; height: 100%; object-fit: cover; }
  .handle { font-family: var(--font-mono, ui-monospace, monospace); }
  @media (max-width: 1024px) {
    .layout { grid-template-columns: 1fr; }
    .preview { position: static; }
    .pulse-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 640px) {
    .grid { grid-template-columns: 1fr; }
    .pulse-grid,
    .device-row { grid-template-columns: 1fr; }
    .pulse-head { display: grid; }
  }
</style>
