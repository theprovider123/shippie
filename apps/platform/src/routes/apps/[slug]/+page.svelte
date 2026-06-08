<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageProps } from './$types';
  import IconOrMonogram from '$lib/components/marketplace/IconOrMonogram.svelte';
  import RatingsSummary from '$lib/components/marketplace/RatingsSummary.svelte';
  import LocalAppActions from '$lib/components/marketplace/LocalAppActions.svelte';
  import FeedbackSheet from '$lib/components/feedback/FeedbackSheet.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import { toast } from '$lib/stores/toast';

  let { data, form }: PageProps = $props();
  let savingProfile = $state(false);
  let feedbackOpen = $state(false);

  // App-specific share/OG: a shared link shows THIS tool's name, pitch, and icon
  // — not the generic Shippie card. (Icon → absolute URL for crawlers.)
  const ogImage = $derived(
    data.app.iconUrl
      ? data.app.iconUrl.startsWith('http')
        ? data.app.iconUrl
        : `https://shippie.app${data.app.iconUrl}`
      : null,
  );
  // "What it does" body only when the description adds something beyond the tagline.
  const showDescription = $derived(
    Boolean(data.app.description) && data.app.description !== data.app.tagline,
  );

  // Share copy varies by viewer:
  //   public app, any viewer → public marketplace URL
  //   private app, owner    → link to access page (where invites live)
  //   private app, invitee  → marketplace detail page (their grant cookie
  //                           survives sharing within their own session
  //                           but not across users; this is a sane default
  //                           — for cross-user sharing, the maker uses the
  //                           invite QR/link in /access)
  function sharePayload(): { title: string; text: string; url: string } {
    const origin =
      typeof window === 'undefined' ? 'https://shippie.app' : window.location.origin;
    if (data.app.visibility === 'private' && data.isMaker) {
      return {
        title: `Share ${data.app.name}`,
        text: `Send a private invite to ${data.app.name}.`,
        url: `${origin}/maker/apps/${encodeURIComponent(data.app.slug)}/access`,
      };
    }
    if (data.app.visibility === 'private') {
      return {
        title: `Join me on ${data.app.name}`,
        text: data.app.tagline ?? `${data.app.name} on Shippie`,
        url: `${origin}/apps/${encodeURIComponent(data.app.slug)}`,
      };
    }
    return {
      title: `${data.app.name} on Shippie`,
      text: data.app.tagline ?? `${data.app.name} on Shippie`,
      url: `${origin}/apps/${encodeURIComponent(data.app.slug)}`,
    };
  }

  async function shareApp() {
    const payload = sharePayload();
    if ('share' in navigator) {
      try {
        await navigator.share(payload);
        return;
      } catch {
        // User cancelled — fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(payload.url);
      toast.push({ kind: 'success', message: 'Link copied to clipboard.' });
    } catch {
      toast.push({ kind: 'error', message: 'Could not copy. Long-press the link to copy.' });
    }
  }

  function eligibilityLabel(value: string): string {
    if (value === 'first_party') return 'First-party container tool';
    if (value === 'curated') return 'Curated for Shippie';
    if (value === 'compatible') return 'Container compatible';
    if (value === 'standalone_only') return 'Standalone only';
    if (value === 'blocked') return 'Blocked from container';
    return value.replaceAll('_', ' ');
  }

  function securityLabel(score: number | null): string {
    return score === null ? 'Unscored' : `${score}/100`;
  }

  const typeLabel = $derived(data.app.type.toLowerCase() === 'app' ? 'tool' : data.app.type);
  const isRemix = $derived(Boolean(data.ownership.lineage.parentAppId));
  const remixLabel = $derived(
    data.ownership.lineage.parentApp
      ? `Remix of ${data.ownership.lineage.parentApp.name}`
      : data.ownership.lineage.parentAppId
        ? 'Remix'
        : '',
  );
  const slugPattern = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
  const cliRemixCommand = $derived(`npx @shippie/cli remix ${data.app.slug}`);
</script>

<svelte:head>
  <title>{data.app.name} — Shippie</title>
  <meta name="description" content={data.app.tagline ?? data.app.description ?? `${data.app.name} on Shippie`} />
  <!-- App-specific share card — the shared link shows THIS tool, not generic Shippie. -->
  <meta property="og:title" content={`${data.app.name} — Shippie`} />
  <meta property="og:description" content={data.app.tagline ?? data.app.description ?? `${data.app.name} on Shippie`} />
  <meta property="og:type" content="website" />
  {#if ogImage}<meta property="og:image" content={ogImage} />{/if}
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content={data.app.name} />
  <meta name="twitter:description" content={data.app.tagline ?? `${data.app.name} on Shippie`} />
  {#if ogImage}<meta name="twitter:image" content={ogImage} />{/if}
</svelte:head>

<header class="hero">
  <div class="hero-wrap">
    <a href="/tools" class="back">← All tools</a>
    <div class="hero-row">
      <IconOrMonogram
        name={data.app.name}
        slug={data.app.slug}
        iconUrl={data.app.iconUrl}
        themeColor={data.app.themeColor}
        size={96}
      />
      <div class="hero-meta">
        <h1 class="title">{data.app.name}</h1>
        <p class="tagline">{data.app.tagline ?? data.app.description ?? ''}</p>
        <div class="hero-tags">
          <p class="kind">{typeLabel} · {data.app.category}</p>
          {#each data.connectionBadges as badge (badge.label)}
            <span class="connection-badge connection-{badge.tone}" title={badge.title}>{badge.label}</span>
          {/each}
          {#if isRemix}
            <span class="remix-badge">{remixLabel}</span>
          {/if}
        </div>
        <div class="cta-row">
          <a class="open-btn" href={`/dock?app=${encodeURIComponent(data.app.slug)}`}>
            Open
          </a>
          <LocalAppActions
            slug={data.app.slug}
            name={data.app.name}
            appUrl={data.ownership.standaloneUrl}
            showFavorite={false}
            variant="inline"
            showStatus={false}
          />
          <button
            type="button"
            class="share-btn"
            onclick={shareApp}
            aria-label="Share this tool"
          >
            Share
          </button>
          <button
            type="button"
            class="share-btn"
            onclick={() => (feedbackOpen = true)}
            aria-label={`Give feedback on ${data.app.name}`}
          >
            Feedback
          </button>
        </div>
      </div>
    </div>
  </div>
</header>

<div class="body wrap">
  {#if showDescription}
    <section class="section what">
      <h2>What it does</h2>
      <p class="what-body">{data.app.description}</p>
    </section>
  {/if}

  <section class="section about">
    <h2>About this tool</h2>
    <dl class="facts">
      {#if data.trustCard}
        <div><dt>Your data</dt><dd>{data.trustCard.dataLocation}</dd></div>
        <div>
          <dt>Privacy</dt>
          <dd>{data.trustCard.privacyGrade ?? 'Ungraded'} · {data.trustCard.externalDomains.length === 0 ? 'no external connections' : `${data.trustCard.externalDomains.length} external connection${data.trustCard.externalDomains.length === 1 ? '' : 's'}`}</dd>
        </div>
      {/if}
      <div>
        <dt>Made by</dt>
        <dd>{#if data.ownership.maker.username}<a href={`/@${data.ownership.maker.username}`}>{data.ownership.maker.name}&nbsp;<span class="muted">@{data.ownership.maker.username}</span></a>{:else}{data.ownership.maker.name}{/if}{#if data.ownership.maker.verified}&nbsp;· verified{/if}</dd>
      </div>
      <div>
        <dt>Source</dt>
        <dd>{#if data.ownership.sourceRepo}<a href={data.ownership.sourceRepo} target="_blank" rel="noopener">View source</a>{:else}<span class="muted">Not published</span>{/if}</dd>
      </div>
      <div>
        <dt>License</dt>
        <dd>{data.ownership.license ?? 'Unlicensed'} · {data.ownership.remixAvailable ? 'remix allowed' : 'remix closed'}</dd>
      </div>
      <div>
        <dt>Runs at</dt>
        <dd><a href={data.ownership.standaloneUrl} target="_blank" rel="noopener">{data.ownership.standaloneUrl.startsWith('/') ? `shippie.app${data.ownership.standaloneUrl}` : new URL(data.ownership.standaloneUrl).host}</a></dd>
      </div>
      {#if data.ownership.customDomains.length > 0}
        <div>
          <dt>Custom domains</dt>
          <dd class="domain-list">{#each data.ownership.customDomains as domain (domain.domain)}<a href={`https://${domain.domain}/`} target="_blank" rel="noopener">{domain.domain}{domain.isCanonical ? ' · canonical' : ''}</a>{/each}</dd>
        </div>
      {/if}
      {#if isRemix}
        <div>
          <dt>Remix of</dt>
          <dd>{#if data.ownership.lineage.parentApp}<a href={`/apps/${data.ownership.lineage.parentApp.slug}`}>{data.ownership.lineage.parentApp.name}</a>{:else}another Shippie tool{/if}{#if data.ownership.lineage.parentVersion}<span class="muted"> · parent {data.ownership.lineage.parentVersion}</span>{/if}</dd>
        </div>
      {/if}
    </dl>

    {#if data.ownership.remixAvailable}
      <div class="about-actions">
        <a class="remix-link" href={`/new?remix=${data.app.slug}`}>Remix this tool</a>
        {#if data.ownership.remixVia === 'cli'}<code class="remix-command">{cliRemixCommand}</code>{/if}
      </div>
    {/if}

    {#if data.signingTrust || data.trustCard || data.grantedPermissions.length > 0}
      <details class="checked">
        <summary>What Shippie checked</summary>
        {#if data.signingTrust}
          <p class="checked-line"><strong>{data.signingTrust.label}</strong> — {data.signingTrust.summary}{#if data.signingTrust.packageHash}<span class="muted"> · v{data.signingTrust.version ?? 'current'} · {data.signingTrust.packageHash.slice(0, 26)}…</span>{:else}<span class="muted"> · first-party bundle</span>{/if}</p>
        {/if}
        {#if data.trustCard}
          <dl class="facts">
            <div><dt>Security</dt><dd>{securityLabel(data.trustCard.securityScore)} · {eligibilityLabel(data.trustCard.containerEligibility)}</dd></div>
            <div><dt>Proof</dt><dd>{data.trustCard.proofBadges.length > 0 ? data.trustCard.proofBadges.join(' · ') : 'No runtime proof badges yet'}</dd></div>
            <div><dt>Permissions</dt><dd>{data.grantedPermissions.length > 0 ? data.grantedPermissions.join(' · ') : 'No extra permissions declared'}</dd></div>
            <div>
              <dt>External connections</dt>
              <dd>{#if data.trustCard.externalDomains.length > 0}<span class="domain-list">{#each data.trustCard.externalDomains as domain (domain.domain)}<span>{domain.domain} · {domain.purpose}{domain.personalData ? ' · may involve personal data' : ''}</span>{/each}</span>{:else}None detected in the latest scan.{/if}</dd>
            </div>
          </dl>
        {:else if data.grantedPermissions.length > 0}
          <p class="muted">Permissions: {data.grantedPermissions.join(' · ')}</p>
        {/if}
      </details>
    {/if}

    {#if data.ownership.versions.length > 0}
      <div class="version-strip" aria-label="Recent versions">
        {#each data.ownership.versions as version (version.packageHash)}
          <a href={version.packageUrl}>v{version.version} · {version.channel} · {version.containerEligibility.replace('_', ' ')}</a>
        {/each}
      </div>
    {/if}

    {#if data.isMaker}
      <details class="owner-edit">
        <summary>Edit listing</summary>
        {#if form?.profileOk}<p class="ok">Saved.</p>{/if}
        {#if form?.profileError}<p class="err">{form.profileError}</p>{/if}
        <form
          method="POST"
          action="?/saveProfile"
          use:enhance={() => {
            savingProfile = true;
            return async ({ update, result }) => {
              await update();
              savingProfile = false;
              if (result.type === 'success') {
                toast.push({ kind: 'success', message: 'Listing saved.' });
              }
            };
          }}
        >
          <label>
            Slug
            <input name="slug" value={data.app.slug} maxlength="63" required pattern={slugPattern} />
          </label>
          <label>
            Name
            <input name="name" value={data.app.name} maxlength="80" required />
          </label>
          <label>
            Tagline
            <input name="tagline" value={data.app.tagline ?? ''} maxlength="160" />
          </label>
          <label class="full">
            Description
            <textarea name="description" rows="4" maxlength="1000" placeholder="What does your tool do? This shows as “What it does” on the page.">{data.app.description ?? ''}</textarea>
          </label>
          <label>
            Category
            <input name="category" value={data.app.category} maxlength="48" required />
          </label>
          <label>
            Source repo
            <input name="sourceRepo" value={data.ownership.sourceRepo ?? ''} inputmode="url" />
          </label>
          <label>
            License
            <input name="license" value={data.ownership.license ?? ''} placeholder="MIT, AGPL-3.0, Apache-2.0" />
          </label>
          <label class="check-row">
            <input name="remixAllowed" type="checkbox" checked={data.ownership.remixAllowed} />
            Allow remixing when source and license are present
          </label>
          <button type="submit" disabled={savingProfile}>
            {savingProfile ? 'Saving' : 'Save listing'}
          </button>
        </form>
      </details>
    {/if}
  </section>

  {#if data.changelog && data.changelog.entries.length > 0}
    <section class="section">
      <h2>Latest changes</h2>
      <p class="changelog-summary">{data.changelog.summary}</p>
      <ul class="changelog-entries">
        {#each data.changelog.entries as entry, i (i)}
          <li>{entry}</li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if data.ratingSummary.count > 0}
    <section class="section">
      <h2>Ratings &amp; reviews</h2>
      <RatingsSummary summary={data.ratingSummary} latest={data.latestReviews} />
    </section>
  {/if}

  {#if data.isMaker}
    <section class="section">
      <Button href={`/maker/apps/${data.app.slug}`} variant="secondary">
        Open in Maker →
      </Button>
    </section>
  {/if}
</div>

<FeedbackSheet
  open={feedbackOpen}
  appName={data.app.name}
  appSlug={data.app.slug}
  onClose={() => (feedbackOpen = false)}
/>

<style>
  .hero {
    color: var(--text);
    padding: var(--space-2xl) 0;
  }
  .hero-wrap {
    max-width: 560px;
    margin: 0 auto;
    padding: 0 clamp(1.5rem, 4vw, 2rem);
  }
  .back {
    display: inline-flex;
    align-items: center;
    min-height: var(--touch-min);
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--text);
    opacity: 0.85;
    margin-bottom: var(--space-xl);
  }
  .back:hover { opacity: 1; }
  /* Compact card: centred head, contained column — no stretched app-store layout. */
  .hero-row {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--space-md);
  }
  .hero-meta {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
  }
  .title {
    font-family: var(--font-heading);
    font-size: var(--text-display);
    line-height: 1.1;
    letter-spacing: 0;
    margin: 0;
    color: var(--text);
  }
  .tagline {
    margin: 0;
    font-size: var(--text-body);
    line-height: 1.45;
    opacity: 0.92;
    color: var(--text-secondary);
    max-width: 42ch;
  }
  .kind {
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.75;
    margin: 0;
  }
  .hero-tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 0.2rem;
  }
  .remix-badge,
  .connection-badge {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    padding: 0 0.6rem;
    border: 1px solid var(--border-light);
    background: var(--surface);
    color: var(--text-secondary);
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .connection-badge {
    border-color: color-mix(in srgb, var(--marigold) 30%, var(--border-light));
    color: var(--marigold);
  }
  .connection-badge::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 999px;
    margin-right: 6px;
    background: currentColor;
  }
  .cta-row {
    margin-top: var(--space-md);
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
  }
  /* Unified action row: one primary (sunset) + matching ghost buttons,
     all sentence-case, same height/shape. */
  .open-btn {
    display: inline-flex;
    align-items: center;
    height: 44px;
    padding: 0 1.25rem;
    background: var(--sunset);
    color: var(--bg);
    font-weight: 600;
    font-size: var(--text-small);
    transition: filter 0.15s;
  }
  .open-btn:hover { filter: brightness(1.06); }
  .cta-row :global(.local-actions.inline) {
    margin-top: 0;
  }
  /* The Save button from LocalAppActions, matched to .share-btn. */
  .cta-row :global(.local-actions.inline button) {
    height: 44px;
    padding: 0 1.25rem;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border-light);
    border-radius: 0;
    font: inherit;
    font-size: var(--text-small);
    text-transform: none;
    letter-spacing: normal;
  }
  .cta-row :global(.local-actions.inline button:hover) {
    background: var(--surface-alt);
    border-color: var(--sunset);
  }
  .share-btn {
    display: inline-flex;
    align-items: center;
    height: 44px;
    padding: 0 1.25rem;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border-light);
    border-radius: 0;
    font: inherit;
    font-size: var(--text-small);
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  .share-btn:hover { background: var(--surface-alt); border-color: var(--sunset); }

  .body {
    padding: var(--space-lg) clamp(1.5rem, 4vw, 2rem) var(--space-2xl);
    max-width: 560px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  /* Clean section rhythm: hairline-separated, no heavy boxes, no dead space —
     matches the Docs/Why surfaces. */
  .body > * {
    margin-top: var(--space-xl);
    padding-top: var(--space-xl);
    border-top: 1px solid var(--border-light);
  }
  .body > :first-child {
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }
  .section h2 {
    font-family: var(--font-heading);
    font-size: var(--text-subhead);
    margin: 0 0 var(--space-md);
    letter-spacing: 0;
  }
  .what-body {
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-body);
    line-height: 1.6;
    white-space: pre-line;
  }
  /* Tight key/value facts list — replaces the old boxed trust + ownership grids. */
  .facts {
    margin: 0;
    display: grid;
    gap: 0;
  }
  .facts > div {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    gap: var(--space-md);
    padding: 0.6rem 0;
    border-top: 1px solid var(--border-light);
  }
  .facts > div:first-child { border-top: 0; padding-top: 0; }
  .facts dt {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-light);
  }
  .facts dd {
    margin: 0;
    color: var(--text);
    font-size: var(--text-small);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .facts dd a { color: var(--sunset); }
  .facts .muted { color: var(--text-light); }
  @media (max-width: 560px) {
    .facts > div { grid-template-columns: 1fr; gap: 2px; }
  }
  /* "What Shippie checked" — a quiet disclosure, not a box. */
  .checked {
    margin-top: var(--space-md);
    border-top: 1px solid var(--border-light);
    padding-top: var(--space-md);
  }
  .checked summary {
    min-height: var(--touch-min);
    cursor: pointer;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-light);
  }
  .checked summary::-webkit-details-marker { display: none; }
  .checked summary::after { content: '›'; transition: transform 0.15s; }
  .checked[open] summary::after { transform: rotate(90deg); }
  .checked[open] summary { margin-bottom: var(--space-sm); }
  .checked-line {
    margin: 0 0 var(--space-md);
    color: var(--text-secondary);
    font-size: var(--text-small);
    line-height: 1.5;
  }
  .checked-line strong { color: var(--text); }
  .checked .domain-list span { display: block; }
  .changelog-summary { margin: 0 0 var(--space-sm); font-weight: 500; }
  .changelog-entries {
    list-style: none;
    padding: 0;
    margin: 0;
    color: var(--text-secondary);
    font-size: var(--text-small);
    line-height: 1.7;
  }
  .changelog-entries li::before { content: '· '; }
  .about {
    display: grid;
    gap: var(--space-md);
  }
  .muted {
    color: var(--text-light);
  }
  .version-strip {
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    color: var(--text-light);
  }
  .owner-edit {
    border-top: 1px solid var(--border-light);
    padding-top: var(--space-md);
  }
  .owner-edit summary {
    cursor: pointer;
    color: var(--sunset);
    font-weight: 700;
  }
  .owner-edit form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.85rem;
    margin-top: var(--space-md);
  }
  .owner-edit label {
    display: grid;
    gap: 0.35rem;
    color: var(--text-secondary);
    font-size: var(--text-small);
    font-weight: 700;
  }
  .owner-edit input,
  .owner-edit textarea {
    min-width: 0;
    border: 1px solid var(--border-light);
    background: var(--bg-pure);
    color: var(--text);
    padding: 0.7rem;
    font: inherit;
  }
  .owner-edit textarea {
    resize: vertical;
    line-height: 1.5;
  }
  .owner-edit .full {
    grid-column: 1 / -1;
  }
  .owner-edit .check-row {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
  }
  .owner-edit .check-row input {
    width: auto;
  }
  .owner-edit button {
    justify-self: start;
    border: 0;
    background: var(--sunset);
    color: white;
    padding: 0.75rem 1rem;
    font-weight: 700;
    cursor: pointer;
  }
  .owner-edit button:disabled {
    opacity: 0.65;
    cursor: progress;
  }
  .ok {
    color: var(--sage-leaf) !important;
    margin-top: var(--space-sm) !important;
  }
  .err {
    color: var(--sunset) !important;
    margin-top: var(--space-sm) !important;
  }
  .domain-list {
    display: grid;
    gap: 4px;
  }
  .version-strip {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .version-strip a {
    border: 1px solid var(--border-light);
    border-radius: 0;
    padding: 4px 8px;
    color: var(--text-secondary);
  }
  .about-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .remix-link {
    min-height: var(--touch-min);
    display: inline-flex;
    align-items: center;
    padding: 0 1rem;
    border: 1px solid var(--border-light);
    background: var(--surface);
    color: var(--text);
    font-size: var(--text-small);
  }
  .remix-link:hover { background: var(--surface-alt); border-color: var(--sunset); }
  .remix-command {
    display: inline-flex;
    align-items: center;
    min-height: 36px;
    padding: 0.55rem 0.75rem;
    border: 1px solid var(--border-light);
    color: var(--text-secondary);
    background: var(--surface);
    font-family: var(--font-mono);
    font-size: var(--text-caption);
    overflow-wrap: anywhere;
  }
  @media (max-width: 640px) {
    .hero {
      padding-bottom: 0;
    }
    /* Actions stay inline in the card (no fixed bottom bar). */
    .open-btn,
    .share-btn,
    .cta-row :global(.local-actions.inline button) {
      justify-content: center;
      min-width: 0;
      height: 48px;
      padding: 0 1.1rem;
    }
    .owner-edit form {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 640px) {
    .trust-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
