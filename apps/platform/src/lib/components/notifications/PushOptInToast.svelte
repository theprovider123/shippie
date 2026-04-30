<!--
  Surfaces a one-time per-slug push opt-in toast when:
    - the user has opened an app to a successful boot (`shippie:app-opened`)
    - Notification.permission is 'default' (haven't decided yet)
    - the platform supports a sane prompt (Android Chrome anywhere, iOS
      only inside standalone PWA)
    - we haven't asked for this slug before (localStorage gate)

  Action button calls Notification.requestPermission and posts the
  resulting subscription to /__shippie/push/subscribe.

  Mount once, near the container shell. The component listens to
  window-level events; it doesn't need a parent to drive it.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { toast } from '$lib/stores/toast';
  import { canSurfacePushPrompt } from '$lib/util/standalone';

  function storageKey(slug: string): string {
    return `shippie:notif-prompt-shown:${slug}`;
  }

  function alreadyAsked(slug: string): boolean {
    try {
      return localStorage.getItem(storageKey(slug)) === '1';
    } catch {
      return true; // private browsing — pretend asked, don't pester
    }
  }

  function markAsked(slug: string): void {
    try {
      localStorage.setItem(storageKey(slug), '1');
    } catch {
      /* noop */
    }
  }

  async function subscribePush(slug: string, name: string): Promise<void> {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;
    let result: NotificationPermission;
    try {
      result = await Notification.requestPermission();
    } catch {
      return;
    }
    if (result !== 'granted') return;

    // Best-effort subscribe via the wrapper endpoint. The VAPID public
    // key fetch + pushManager dance lives behind /__shippie/push, so
    // this is the simplest call site.
    try {
      const reg = await navigator.serviceWorker?.ready;
      if (!reg || !('pushManager' in reg)) {
        toast.push({
          kind: 'success',
          message: `Notifications on for ${name}.`,
        });
        return;
      }
      const keyRes = await fetch('/__shippie/push/vapid-key');
      const { key } = (await keyRes.json().catch(() => ({}))) as { key?: string };
      if (!key) return;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      await fetch('/__shippie/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, subscription: sub }),
      });
      toast.push({
        kind: 'success',
        message: `Notifications on for ${name}.`,
      });
    } catch {
      // Permission granted but subscribe failed — surface lightly.
      toast.push({
        kind: 'info',
        message: `Notifications enabled. Couldn't subscribe right now.`,
      });
    }
  }

  function maybeOfferPrompt(slug: string, name: string): void {
    if (!canSurfacePushPrompt()) return;
    if (Notification.permission !== 'default') return;
    if (alreadyAsked(slug)) return;

    markAsked(slug);
    toast.push({
      kind: 'info',
      message: `Want updates from ${name}?`,
      durationMs: 10_000,
      action: {
        label: 'Turn on',
        run: () => {
          void subscribePush(slug, name);
        },
      },
    });
  }

  onMount(() => {
    function onAppOpened(e: Event) {
      const detail = (e as CustomEvent<{ slug?: string; name?: string }>).detail;
      if (!detail?.slug) return;
      maybeOfferPrompt(detail.slug, detail.name ?? detail.slug);
    }
    window.addEventListener('shippie:app-opened', onAppOpened);
    return () => window.removeEventListener('shippie:app-opened', onAppOpened);
  });
</script>
