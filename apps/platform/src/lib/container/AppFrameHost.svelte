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
  import type { ContainerApp } from '$lib/container/state';
  import type { FrameStates } from '$lib/container/frame-runtime';
  import RocketLoader from '$lib/components/ui/RocketLoader.svelte';

  interface Props {
    app: ContainerApp;
    /** Active in the workspace? Drives `display: block` vs `display: none`. */
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
    onRegister: (node: HTMLIFrameElement, appId: string) => void;
    onReady: (appId: string) => void;
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
</script>

<div class="frame-stage" class:active>
  {#key `${app.id}:${reloadNonce}`}
    {#if runtimeSrc}
      <iframe
        use:onRegister={app.id}
        title={`${app.name} container app`}
        sandbox="allow-scripts allow-forms allow-same-origin"
        src={runtimeSrc}
        onload={() => onReady(app.id)}
        onerror={() => onError(app.id)}
      ></iframe>
    {:else if packageFrameSrc}
      <iframe
        use:onRegister={app.id}
        title={`${app.name} container app`}
        sandbox="allow-scripts allow-forms"
        src={packageFrameSrc}
        onload={() => onReady(app.id)}
        onerror={() => onError(app.id)}
      ></iframe>
    {:else}
      <iframe
        use:onRegister={app.id}
        title={`${app.name} container app`}
        sandbox="allow-scripts allow-forms"
        {srcdoc}
        onload={() => onReady(app.id)}
        onerror={() => onError(app.id)}
      ></iframe>
    {/if}
  {/key}
  {#if frameStates[app.id]?.status === 'booting'}
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
