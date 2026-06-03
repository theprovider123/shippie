<!--
  P1A.5 (deep container split, A1.5) — extracted iframe-with-bridge
  host. The container shell mounts one of these per opened app.

  Responsibilities:
    1. Pick the right iframe `src` (runtime URL → packaged blob →
       generated srcdoc), in that priority order.
    2. Register the iframe DOM node back to the orchestrator via
       `onRegister` so the bridge can hook postMessage.
    3. Surface the per-frame load state and an in-place recovery
       overlay when the iframe fails.

  No orchestration logic here — every state mutation is delegated to
  the parent through the `onRegister`, `onReady`, `onError`, `onReload`,
  `onGoHome` callbacks. The component is dumb so the focused-mode +
  dashboard-mode renders can both reuse it.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { ContainerApp } from '$lib/container/state';
  import { stageStyleFor } from '$lib/container/app-stage';
  import type { FrameStates } from '$lib/container/frame-runtime';
  import RocketLoader from '$lib/components/ui/RocketLoader.svelte';

  type RegisterCleanup = { destroy?: () => void } | void;

  interface Props {
    app: ContainerApp;
    /** Active in the Dock? Drives `display: block` vs `display: none`. */
    active: boolean;
    /** Reload-key seed. Bumping this remounts the iframe. */
    reloadNonce: number;
    /** Per-app frame state map (idle / booting / ready / error). */
    frameStates: FrameStates;
    /** Resolved runtime URL — first-priority src when present. */
    runtimeSrc: string | null;
    /** Packaged blob URL — second-priority src when present. */
    packageFrameSrc: string | null;
    /** Generated fallback srcdoc — last-resort src. */
    srcdoc: string;
    onRegister: (node: HTMLIFrameElement, appId: string) => RegisterCleanup;
    onReady: (appId: string, node: HTMLIFrameElement) => void;
    onError: (appId: string, message?: string) => void;
    onReload: (appId: string) => void;
    onGoHome: () => void;
  }

  let {
    app,
    active,
    reloadNonce,
    frameStates,
    runtimeSrc,
    packageFrameSrc,
    srcdoc,
    onRegister,
    onReady,
    onError,
    onReload,
    onGoHome,
  }: Props = $props();

  let parentHash = $state('');
  let activeFrame = $state<HTMLIFrameElement | null>(null);
  let paintedFrames = $state<Record<string, boolean>>({});
  const frameKey = $derived(`${app.id}:${reloadNonce}`);
  const locallyPainted = $derived(Boolean(paintedFrames[frameKey]));
  const runtimeSrcWithHash = $derived(srcWithHash(runtimeSrc, parentHash));
  const packageFrameSrcWithHash = $derived(srcWithHash(packageFrameSrc, parentHash));

  onMount(() => {
    const updateHash = () => {
      parentHash = window.location.hash;
      postParentHashBurst();
    };
    const updateRunQuery = (event: MessageEvent) => {
      if (!activeFrame?.contentWindow || event.source !== activeFrame.contentWindow) return;
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || typeof data !== 'object' || data.kind !== 'shippie.run-query') return;
      if (typeof data.pack !== 'string' || !/^[a-z0-9-]{1,80}$/.test(data.pack)) return;
      const url = new URL(window.location.href);
      if (!url.pathname.includes('/run/')) return;
      url.searchParams.set('pack', data.pack);
      window.history.replaceState(window.history.state, '', url);
    };
    updateHash();
    window.addEventListener('hashchange', updateHash);
    window.addEventListener('message', updateRunQuery);
    return () => {
      window.removeEventListener('hashchange', updateHash);
      window.removeEventListener('message', updateRunQuery);
    };
  });

  function registerFrame(node: HTMLIFrameElement, appId: string) {
    activeFrame = node;
    const key = frameKey;
    const cleanup = onRegister(node, appId);
    const localPaintChecks = [350, 1_000, 1_800].map((delay) =>
      window.setTimeout(() => {
        if (activeFrame !== node || paintedFrames[key]) return;
        markLocallyPainted(node, key);
        if (!paintedFrames[key] && delay === 1_800) paintedFrames = { ...paintedFrames, [key]: true };
      }, delay),
    );
    postParentHashBurst(node);
    return {
      destroy() {
        if (activeFrame === node) activeFrame = null;
        for (const check of localPaintChecks) window.clearTimeout(check);
        cleanup?.destroy?.();
      },
    };
  }

  function handleFrameLoad(event: Event) {
    const node = event.currentTarget as HTMLIFrameElement;
    const key = frameKey;
    activeFrame = node;
    markLocallyPainted(node, key);
    onReady(app.id, node);
    for (const delay of [250, 1_000, 3_000]) {
      window.setTimeout(() => {
        if (activeFrame !== node) return;
        markLocallyPainted(node, key);
        onReady(app.id, node);
      }, delay);
    }
    postParentHashBurst(node);
  }

  function markLocallyPainted(node: HTMLIFrameElement, key = frameKey) {
    if (paintedFrames[key] || !frameLooksPainted(node)) return;
    paintedFrames = { ...paintedFrames, [key]: true };
  }

  function frameLooksPainted(node: HTMLIFrameElement): boolean {
    let doc: Document | null = null;
    try {
      doc = node.contentDocument;
    } catch {
      return false;
    }
    if (!doc?.body) return false;
    const bodyText = (doc.body.innerText || doc.body.textContent || '').trim();
    if (/something went wrong|application error|failed to load|not found|404|500/i.test(bodyText)) return false;
    if (bodyText.length > 0) return true;
    return Boolean(doc.querySelector('canvas, svg, img, video, button, input, textarea, select, [role="button"], [role="main"]'));
  }

  function postParentHashBurst(node = activeFrame) {
    // Skip the burst entirely when there's no hash to post — the
    // delayed retries would just no-op for every focus on a parent
    // without a hash, which is the common case.
    if (!parentHash) return;
    postParentHash(node);
    window.setTimeout(() => postParentHash(node), 50);
    window.setTimeout(() => postParentHash(node), 250);
  }

  function postParentHash(node: HTMLIFrameElement | null) {
    if (!node?.contentWindow || !parentHash) return;
    node.contentWindow.postMessage(
      {
        kind: 'shippie.parent-hash',
        hash: parentHash,
      },
      '*',
    );
  }

  function srcWithHash(src: string | null, hash: string): string | null {
    if (!src) return null;
    const base = src.split('#')[0];
    return hash ? `${base}${hash.startsWith('#') ? hash : `#${hash}`}` : base;
  }
</script>

<div class="frame-stage" class:active style={stageStyleFor(app.layout, app.aspectRatio)}>
  {#key `${app.id}:${reloadNonce}`}
    {#if runtimeSrcWithHash}
      <iframe
        use:registerFrame={app.id}
        data-shippie-app-id={app.id}
        title={`${app.name} Shippie tool`}
        sandbox="allow-scripts allow-forms allow-same-origin allow-downloads"
        allow="microphone; camera; clipboard-read; clipboard-write; geolocation; fullscreen"
        allowfullscreen
        src={runtimeSrcWithHash}
        onload={handleFrameLoad}
        onerror={() => onError(app.id)}
      ></iframe>
    {:else if packageFrameSrcWithHash}
      <iframe
        use:registerFrame={app.id}
        data-shippie-app-id={app.id}
        title={`${app.name} Shippie tool`}
        sandbox="allow-scripts allow-forms allow-downloads"
        allow="microphone; camera; clipboard-read; clipboard-write; geolocation; fullscreen"
        allowfullscreen
        src={packageFrameSrcWithHash}
        onload={handleFrameLoad}
        onerror={() => onError(app.id)}
      ></iframe>
    {:else}
      <iframe
        use:registerFrame={app.id}
        data-shippie-app-id={app.id}
        title={`${app.name} Shippie tool`}
        sandbox="allow-scripts allow-forms allow-downloads"
        allow="microphone; camera; clipboard-read; clipboard-write; geolocation; fullscreen"
        allowfullscreen
        {srcdoc}
        onload={handleFrameLoad}
        onerror={() => onError(app.id)}
      ></iframe>
    {/if}
  {/key}
  {#if frameStates[app.id]?.status === 'booting' && !locallyPainted}
    <div class="frame-loader" role="status" aria-live="polite">
      <RocketLoader size="lg" label={`Opening ${app.name}`} />
      <p class="frame-loader-label">Opening {app.name}…</p>
    </div>
  {/if}
  {#if frameStates[app.id]?.status === 'error'}
    <div class="frame-recovery" role="alert">
      <strong>{app.name} needs a restart.</strong>
      <p>{frameStates[app.id]?.message}</p>
      <div>
        <button onclick={() => onReload(app.id)}>Reload app</button>
        <button class="secondary" onclick={onGoHome}>Back home</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .frame-stage {
    position: relative;
    display: none;
  }
  .frame-stage.active {
    display: block;
  }
  iframe {
    width: 100%;
    min-height: 500px;
    border: 0;
    display: block;
  }
  .frame-loader {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-md);
    background: var(--bg);
    color: var(--text-secondary);
    pointer-events: none;
    z-index: 1;
  }
  .frame-loader-label {
    font-family: var(--font-mono);
    font-size: var(--caption-size);
    letter-spacing: 0.08em;
    color: var(--text-light);
    margin: 0;
  }
  .frame-recovery {
    position: absolute;
    inset: var(--space-lg);
    display: grid;
    place-content: center;
    gap: 8px;
    padding: var(--space-lg);
    border: 1px solid rgba(182, 71, 45, 0.3);
    border-radius: 0;
    background: rgba(255, 250, 242, 0.96);
    color: var(--text);
    text-align: center;
    box-shadow: 0 18px 60px rgba(33, 29, 24, 0.16);
  }
  .frame-recovery p {
    margin: 0;
    color: var(--text-secondary);
  }
  .frame-recovery div {
    display: flex;
    justify-content: center;
    gap: 8px;
  }
  .frame-recovery button {
    padding: 0.55rem 0.75rem;
  }
  .frame-recovery .secondary {
    background: transparent;
    color: var(--text);
  }
</style>
