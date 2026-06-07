<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import Avatar from './Avatar.svelte';
  import SyncChip from './SyncChip.svelte';
  import type { SyncStatus } from './config';

  let {
    active = 'home',
    slug,
    title = 'Uniti',
    subtitle = '',
    schoolName = '',
    teacherName = '',
    teacherRole = '',
    syncStatus = 'synced',
    lastSync = 'just now',
    pending = 0,
    children,
  }: {
    active?: string;
    slug: string;
    title?: string;
    subtitle?: string;
    schoolName?: string;
    teacherName?: string;
    teacherRole?: string;
    syncStatus?: SyncStatus;
    lastSync?: string;
    pending?: number;
    children?: Snippet;
  } = $props();

  let collapsed = $state(false);
  const sw = $derived(collapsed ? 58 : 220);
  const base = $derived(`/uniti`);

  const nav = $derived([
    { id: 'home', label: 'Today', icon: 'home', href: base },
    { id: 'lesson', label: 'Class', icon: 'lessons', href: `${base}/lessons/l1` },
    { id: 'timeline', label: 'Pupil Progress', icon: 'pupils', href: `${base}/pupils/p2` },
    { id: 'leadership', label: 'School', icon: 'leadership', href: `${base}/leadership` },
    { id: 'admin', label: 'Settings', icon: 'admin', href: `${base}/setup` },
  ]);

  const initials = $derived(
    teacherName
      ? teacherName
          .split(' ')
          .map((n) => n[0])
          .join('')
          .slice(0, 2)
      : 'U',
  );
</script>

<div style="display:flex;height:100vh;height:100dvh;overflow:hidden;">
  <!-- Sidebar -->
  <div
    style="width:{sw}px;flex-shrink:0;background:var(--surface);border-right:1px solid var(--border);
      display:flex;flex-direction:column;transition:width 0.2s ease;overflow:hidden;"
  >
    <div
      style="min-height:60px;padding:{collapsed ? '0 12px' : '0 16px'};display:flex;align-items:center;
        justify-content:{collapsed ? 'center' : 'space-between'};border-bottom:1px solid var(--border);gap:8px;"
    >
      {#if !collapsed}
        <div>
          <div style="font-size:17px;font-weight:800;color:var(--primary);letter-spacing:-0.03em;line-height:1;">uniti</div>
          <div style="font-size:10px;color:var(--text-subtle);font-weight:500;letter-spacing:0.03em;">School Cloud</div>
        </div>
      {:else}
        <div
          style="width:30px;height:30px;border-radius:8px;background:var(--primary);display:flex;
            align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:800;"
        >
          u
        </div>
      {/if}
      <button
        onclick={() => (collapsed = !collapsed)}
        aria-label="Toggle sidebar"
        style="background:none;border:none;cursor:pointer;color:var(--text-subtle);border-radius:6px;padding:4px;display:flex;"
      >
        <Icon name={collapsed ? 'chevron_r' : 'chevron_l'} size={15} />
      </button>
    </div>

    <nav style="flex:1;padding:10px 8px;display:flex;flex-direction:column;gap:2px;">
      {#each nav as item}
        {@const isActive = active === item.id}
        <a
          href={item.href}
          style="display:flex;align-items:center;gap:10px;text-decoration:none;
            padding:{collapsed ? '10px 0' : '9px 10px'};
            justify-content:{collapsed ? 'center' : 'flex-start'};border:none;
            background:{isActive ? 'var(--primary-light)' : 'transparent'};border-radius:8px;cursor:pointer;width:100%;
            color:{isActive ? 'var(--primary)' : 'var(--text-muted)'};font-family:inherit;font-size:13px;
            font-weight:{isActive ? 600 : 500};transition:all 0.12s;box-sizing:border-box;"
        >
          <Icon name={item.icon} size={17} />
          {#if !collapsed}<span>{item.label}</span>{/if}
        </a>
      {/each}
    </nav>

    {#if !collapsed}
      <div style="padding:12px 14px;border-top:1px solid var(--border);">
        <div
          style="font-size:10px;font-weight:700;color:var(--text-subtle);text-transform:uppercase;
            letter-spacing:0.07em;margin-bottom:8px;"
        >
          {schoolName}
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <Avatar {initials} size={28} />
          <div>
            <div style="font-size:12px;font-weight:600;color:var(--text);line-height:1.3;">{teacherName}</div>
            <div style="font-size:10px;color:var(--text-subtle);">{teacherRole}</div>
          </div>
        </div>
      </div>
    {:else}
      <div style="padding:12px 0;border-top:1px solid var(--border);display:flex;justify-content:center;">
        <Avatar {initials} size={30} />
      </div>
    {/if}
  </div>

  <!-- Main -->
  <div style="flex:1;display:flex;flex-direction:column;min-width:0;overflow:hidden;">
    <div
      style="height:52px;background:var(--surface);border-bottom:1px solid var(--border);
        display:flex;align-items:center;padding:0 22px;gap:12px;flex-shrink:0;"
    >
      <div style="flex:1;overflow:hidden;">
        <span
          style="font-size:14px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
          >{title}</span
        >
        {#if subtitle}
          <span style="font-size:13px;color:var(--text-subtle);margin-left:10px;">{subtitle}</span>
        {/if}
      </div>
      <SyncChip status={syncStatus} {lastSync} {pending} />
      <button
        aria-label="Notifications"
        style="background:none;border:none;cursor:pointer;color:var(--text-subtle);display:flex;padding:4px;border-radius:6px;"
      >
        <Icon name="bell" size={17} />
      </button>
    </div>

    <div style="flex:1;overflow:auto;position:relative;">
      {@render children?.()}
    </div>
  </div>
</div>
