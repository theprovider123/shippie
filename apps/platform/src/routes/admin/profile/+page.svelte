<script lang="ts">
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  const publicPath = $derived(data.profile.username ? `/@${data.profile.username}` : null);
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
          <input name="x" value={data.profile.xUrl ?? ''} placeholder="@username or https://x.com/username" />
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
  .preview {
    border: 1px solid var(--border-light, #2A251E);
    background: rgba(255,255,255,0.02);
  }
  .notice { padding: 0.75rem 1rem; margin-bottom: 1rem; }
  .notice.ok { border-color: rgba(122, 154, 110, 0.55); color: var(--sage-highlight, #A8C491); }
  .notice.error { border-color: rgba(232, 96, 60, 0.6); color: var(--sunset, #E8603C); }
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
    border: 1px solid var(--sunset, #E8603C);
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
  }
  @media (max-width: 640px) {
    .grid { grid-template-columns: 1fr; }
  }
</style>
