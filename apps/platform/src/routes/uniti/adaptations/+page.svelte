<script lang="ts">
  import type { PageData } from './$types';
  import { AppShell, Card, Btn, Icon } from '$lib/uniti';
  import type { SyncStatus } from '$lib/uniti';
  import { onMount } from 'svelte';
  import { getOfflineClient } from '$lib/uniti/offline';

  let { data }: { data: PageData } = $props();

  // Local outcome state (optimistic).
  let outcomes = $state<Record<string, string | null>>(
    Object.fromEntries(data.cards.map((c) => [c.id, c.outcome])),
  );
  let sync = $state<SyncStatus>('synced');
  let pending = $state(0);

  // Real outbox-driven sync (Phase 4) — same engine as the lesson page.
  const offline = getOfflineClient(data.userId, data.slug);
  async function refreshSync() {
    pending = await offline.pendingCount();
    const s = offline.status();
    if (s === 'syncing') sync = 'syncing';
    else if (pending > 0) sync = navigator.onLine ? 'pending' : 'offline';
    else sync = 'synced';
  }
  onMount(() => {
    const off = offline.onChange(() => void refreshSync());
    void refreshSync();
    return off;
  });

  const OUTCOMES = [
    { key: 'worked', label: 'Worked', color: '#2EAD73', bg: '#E8F6EF' },
    { key: 'partly', label: 'Partly', color: '#E8953A', bg: '#FEF0DC' },
    { key: 'didnt', label: "Didn't", color: '#D95A57', bg: '#FDECEB' },
  ];

  async function record(cardId: string, outcome: string) {
    if (!data.canRecord) return;
    outcomes[cardId] = outcome; // optimistic
    // Capture through the Outbox — persisted, replayed on reconnect, deduped.
    await offline.capture({
      type: 'adaptation.outcome_recorded',
      instanceId: '', // set server-side from the resolved instance
      payload: { cardId, outcome },
    });
    await refreshSync();
  }

  // Planned cards first, then reviewed.
  const planned = $derived(data.cards.filter((c) => !outcomes[c.id]));
  const reviewed = $derived(data.cards.filter((c) => outcomes[c.id]));
</script>

<svelte:head>
  <title>uniti · What the class needs next</title>
</svelte:head>

<AppShell
  active="lesson"
  slug={data.slug}
  title="What the class needs next"
  schoolName={data.schoolName}
  teacherName={data.teacher.name}
  teacherRole="Teacher"
  syncStatus={sync}
  {pending}
>
  <div class="page">
    <div class="trust">
      <Icon name="sparkle" size={13} color="var(--primary)" />
      <span
        >Suggested from your class feedback · All editable · Data stays on your school cloud</span
      >
    </div>

    {#snippet cardView(c: (typeof data.cards)[number])}
      <Card style="margin-bottom:12px;opacity:{outcomes[c.id] === 'didnt' ? 0.7 : 1};">
        <div class="card-row">
          <div class="emoji-tile">{c.emoji}</div>
          <div style="flex:1;min-width:0;">
            <div class="tags">
              <span class="type-tag">{c.typeLabel}</span>
              <span class="meta">{c.confidence}% confidence · {c.objective}</span>
            </div>
            <div class="title">{c.target}</div>
            <div class="detail">{c.teacherAction}</div>
            <div class="why"><strong>Why:</strong> {c.why} · {c.evidence}</div>

            <div class="outcome-row">
              <span class="outcome-label">Did it work?</span>
              {#each OUTCOMES as o}
                {@const on = outcomes[c.id] === o.key}
                <button
                  class="outcome-btn"
                  disabled={!data.canRecord}
                  onclick={() => record(c.id, o.key)}
                  style="border:1.5px solid {on ? o.color : 'var(--border)'};
                    background:{on ? o.bg : 'transparent'};color:{on ? o.color : 'var(--text-muted)'};"
                >
                  {o.label}
                </button>
              {/each}
            </div>
          </div>
        </div>
      </Card>
    {/snippet}

    {#if planned.length > 0}
      <h2 class="section">To try</h2>
      {#each planned as c (c.id)}{@render cardView(c)}{/each}
    {/if}

    {#if reviewed.length > 0}
      <h2 class="section">Reviewed</h2>
      {#each reviewed as c (c.id)}{@render cardView(c)}{/each}
    {/if}

    {#if data.cards.length === 0}
      <div class="empty">
        <Icon name="sparkle" size={32} color="var(--border)" />
        <p>No adaptations yet — they appear after a few lessons of feedback.</p>
      </div>
    {/if}
  </div>
</AppShell>

<style>
  .page {
    padding: 22px 26px;
    max-width: 760px;
  }
  .trust {
    padding: 9px 13px;
    border-radius: 8px;
    margin-bottom: 20px;
    background: var(--primary-light);
    border: 1px solid var(--primary);
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--primary);
    font-weight: 600;
  }
  .section {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin: 4px 0 12px;
  }
  .card-row {
    display: flex;
    gap: 14px;
  }
  .emoji-tile {
    width: 42px;
    height: 42px;
    border-radius: 10px;
    background: var(--surface-2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
  }
  .tags {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 5px;
    flex-wrap: wrap;
  }
  .type-tag {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 4px;
    background: var(--primary-light);
    color: var(--primary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .meta {
    font-size: 11px;
    color: var(--text-subtle);
  }
  .title {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 4px;
  }
  .detail {
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.55;
  }
  .why {
    font-size: 11px;
    color: var(--text-subtle);
    margin-top: 8px;
    line-height: 1.5;
  }
  .outcome-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    flex-wrap: wrap;
  }
  .outcome-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    margin-right: 2px;
  }
  .outcome-btn {
    padding: 5px 14px;
    border-radius: 20px;
    cursor: pointer;
    font-family: inherit;
    font-size: 12px;
    font-weight: 600;
    transition: all 0.12s;
  }
  .outcome-btn:disabled {
    cursor: default;
    opacity: 0.6;
  }
  .empty {
    text-align: center;
    padding: 40px 0;
    color: var(--text-muted);
  }
</style>
