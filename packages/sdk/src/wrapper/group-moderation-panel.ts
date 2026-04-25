// packages/sdk/src/wrapper/group-moderation-panel.ts
/**
 * Group moderation panel — wrapper-injected, owner-only.
 *
 * Mirrors the structure of `your-data-panel.ts`: a Shadow-DOM-isolated
 * overlay that shows the pending moderation queue, lets the owner
 * approve / reject entries, and switches the moderation mode at
 * runtime. Two ways to open:
 *
 *   1. In-app overlay via `openGroupModerationPanel({ hook })`.
 *   2. Standalone fallback at `/__shippie/group/<id>/moderate` served
 *      by the Worker — works even if the maker's app crashes on load.
 *
 * The panel is decoupled from the proximity package's `Group` class —
 * it consumes any object that satisfies the small `ModerationPanelHook`
 * interface below. The proximity package's `attachModeration()` returns
 * something that already satisfies it.
 */

export type ModerationPanelMode = 'open' | 'owner-approved' | 'ai-screened';

export interface PanelPendingMessage {
  id: string;
  author: string;
  channel: string;
  payloadJson: string;
  ts: number;
  reason: string;
  categories?: string[];
  score?: number;
}

/** What the panel needs from the moderation hook. */
export interface ModerationPanelHook {
  readonly mode: ModerationPanelMode;
  readonly groupId: string;
  /** Owner peer id — used by the owner-only guard. */
  readonly ownerPeerId: string;
  /** This device's peer id. */
  readonly selfPeerId: string;
  setMode(mode: ModerationPanelMode): void;
  getQueue(): Promise<PanelPendingMessage[]>;
  approve(messageId: string): Promise<boolean>;
  reject(messageId: string): Promise<boolean>;
}

export interface OpenGroupModerationPanelOptions {
  /** The moderation hook to drive the panel. */
  hook: ModerationPanelHook;
  /** Where to mount. Defaults to a fixed-position overlay on document.body. */
  mount?: HTMLElement;
  /** Called when the user closes the panel. */
  onClose?: () => void;
}

export interface GroupModerationPanelHandle {
  close(): void;
  refresh(): Promise<void>;
}

let openHandle: GroupModerationPanelHandle | null = null;

export function openGroupModerationPanel(
  opts: OpenGroupModerationPanelOptions,
): GroupModerationPanelHandle {
  if (openHandle) return openHandle;
  if (typeof document === 'undefined') {
    return { close() {}, refresh: async () => {} };
  }

  const host = opts.mount ?? document.createElement('div');
  if (!opts.mount) {
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '2147483647';
    document.body.appendChild(host);
  }
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = SHELL_HTML;

  const hook = opts.hook;
  const isOwner = hook.ownerPeerId === hook.selfPeerId;

  const close = () => {
    host.remove();
    openHandle = null;
    opts.onClose?.();
  };

  const setMode = (mode: ModerationPanelMode) => {
    hook.setMode(mode);
    void refresh();
  };

  const refresh = async () => {
    const modeLabel = root.getElementById('shippie-mod-mode-current');
    if (modeLabel) modeLabel.textContent = `current: ${hook.mode}`;
    const buttons = root.querySelectorAll<HTMLButtonElement>('[data-mode]');
    buttons.forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.mode === hook.mode));
    });

    const guard = root.getElementById('shippie-mod-not-owner');
    const queueEl = root.getElementById('shippie-mod-queue');
    const modeRow = root.getElementById('shippie-mod-mode-row');
    if (!isOwner) {
      guard?.classList.remove('hidden');
      modeRow?.classList.add('hidden');
      if (queueEl) queueEl.textContent = '';
      return;
    }
    guard?.classList.add('hidden');
    modeRow?.classList.remove('hidden');

    const queue = await hook.getQueue();
    if (!queueEl) return;
    if (queue.length === 0) {
      queueEl.textContent = 'Queue is empty.';
      return;
    }
    queueEl.replaceChildren();
    for (const entry of queue) {
      queueEl.appendChild(renderEntry(entry, hook, refresh));
    }
  };

  root.getElementById('shippie-mod-close')?.addEventListener('click', close);
  root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => {
    b.addEventListener('click', () => {
      const m = b.dataset.mode as ModerationPanelMode | undefined;
      if (m) setMode(m);
    });
  });

  void refresh();

  openHandle = { close, refresh };
  return openHandle;
}

function renderEntry(
  entry: PanelPendingMessage,
  hook: ModerationPanelHook,
  refresh: () => Promise<void>,
): HTMLElement {
  const div = document.createElement('div');
  div.className = 'entry';

  const body = document.createElement('div');
  body.className = 'body';
  body.textContent = entry.payloadJson;
  div.appendChild(body);

  const meta = document.createElement('div');
  meta.className = 'meta';
  const parts: string[] = [];
  parts.push(new Date(entry.ts).toLocaleString());
  if (entry.reason) parts.push(entry.reason);
  if (typeof entry.score === 'number') parts.push(`score ${entry.score.toFixed(2)}`);
  if (entry.categories?.length) parts.push(entry.categories.join(', '));
  meta.textContent = parts.join(' · ');
  div.appendChild(meta);

  const row = document.createElement('div');
  row.className = 'row';
  const ok = document.createElement('button');
  ok.textContent = 'Approve';
  ok.className = 'primary';
  ok.addEventListener('click', () => {
    void (async () => {
      await hook.approve(entry.id);
      await refresh();
    })();
  });
  const no = document.createElement('button');
  no.textContent = 'Reject';
  no.className = 'danger';
  no.addEventListener('click', () => {
    void (async () => {
      await hook.reject(entry.id);
      await refresh();
    })();
  });
  row.appendChild(ok);
  row.appendChild(no);
  div.appendChild(row);

  return div;
}

const SHELL_HTML = `
<style>
  :host, .panel { all: initial; }
  .panel {
    position: fixed; inset: 0; display: flex; align-items: stretch;
    justify-content: center; background: rgba(0,0,0,0.4);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
    color: #14120F;
  }
  .sheet {
    background: #FAF7EF; color: #14120F; width: 100%; max-width: 560px;
    margin-top: auto; border-radius: 18px 18px 0 0; padding: 20px 20px 36px;
    overflow-y: auto; max-height: 90vh;
  }
  @media (prefers-color-scheme: dark) {
    .sheet { background: #14120F; color: #FAF7EF; }
    .row .ghost { color: #C4BAA8; border-color: #C4BAA8; }
  }
  h1 { margin: 0 0 4px; font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }
  p.subtitle { margin: 0 0 18px; color: #5C5751; font-size: 13px; }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em;
       color: #5C5751; margin: 16px 0 8px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  button { height: 34px; padding: 0 14px; border-radius: 999px;
           border: 1px solid #14120F; background: transparent;
           color: inherit; font-size: 13px; font-weight: 500; cursor: pointer; }
  button.primary { background: #E8603C; border-color: #E8603C; color: #14120F; }
  button.danger { color: #B23A2B; border-color: #B23A2B; }
  button[aria-pressed="true"] { background: #E8603C; border-color: #E8603C; color: #14120F; }
  .hidden { display: none !important; }
  .entry { padding: 10px 0; border-top: 1px dashed #E8DDC9; }
  .entry:first-child { border-top: 0; }
  .entry .body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
                 font-size: 13px; margin: 4px 0 6px; white-space: pre-wrap; }
  .entry .meta { font-size: 11px; color: #5C5751; margin-bottom: 8px; }
  .close { float: right; }
</style>
<div class="panel">
  <div class="sheet">
    <button class="close" id="shippie-mod-close" aria-label="Close">Close</button>
    <h1>Group moderation</h1>
    <p class="subtitle">Owner-only. Approve or reject messages waiting to send.</p>

    <h2>Mode</h2>
    <div class="row" id="shippie-mod-mode-row">
      <button data-mode="open">Open</button>
      <button data-mode="owner-approved">Owner-approved</button>
      <button data-mode="ai-screened">AI-screened</button>
    </div>
    <p class="subtitle" id="shippie-mod-mode-current">current: …</p>

    <h2>Pending queue</h2>
    <div id="shippie-mod-queue">loading…</div>

    <div id="shippie-mod-not-owner" class="hidden">
      <h2>Not owner</h2>
      <p class="subtitle">
        This view is for the group owner. Open it on the device that
        created the group, or ask the owner to moderate from theirs.
      </p>
    </div>
  </div>
</div>
`;
