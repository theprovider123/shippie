/**
 * /__shippie/group/<id>/moderate — standalone group moderation panel.
 *
 * Mirrors the pattern of `your-data.ts`: served by the Worker on the
 * per-app subdomain and renders a self-contained HTML page that talks
 * to the in-page Shippie SDK over `postMessage` / `BroadcastChannel`
 * (when available). The point: even if the maker's app is broken on
 * load, the group owner can still reach the moderation queue at this
 * fixed URL and approve / reject pending messages.
 *
 * This is owner-only. Ownership is verified client-side against the
 * locally-stored owner public key for the group — the Worker has no
 * knowledge of who owns the group, by design (zero-knowledge relay).
 * If the visiting device isn't the owner, the page renders an
 * explanatory empty state rather than the queue.
 */
import { Hono } from 'hono';
import type { AppBindings } from '../app.ts';

export const groupModerateRouter = new Hono<AppBindings>();

groupModerateRouter.get('/:id/moderate', (c) => {
  const slug = c.var.slug;
  const groupId = c.req.param('id');
  return c.html(renderHtml(slug, groupId));
});

// Sometimes you reach the page without an id — render a chooser.
groupModerateRouter.get('/', (c) => {
  return c.html(renderChooserHtml(c.var.slug));
});
groupModerateRouter.get('', (c) => {
  return c.html(renderChooserHtml(c.var.slug));
});

function renderHtml(slug: string, groupId: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Group moderation — ${escapeHtml(slug)}</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <main>
    <h1>Group moderation <span class="tag">${escapeHtml(slug)}</span></h1>
    <p class="subtitle">Owner-only. Approve or reject messages waiting to send.</p>

    <section>
      <h2>Mode</h2>
      <div class="row" id="mode-row">
        <button data-mode="open">Open</button>
        <button data-mode="owner-approved">Owner-approved</button>
        <button data-mode="ai-screened">AI-screened</button>
      </div>
      <p class="muted" id="mode-current">current: …</p>
    </section>

    <section>
      <h2>Pending queue</h2>
      <div id="queue">loading…</div>
    </section>

    <section id="not-owner" class="hidden">
      <h2>Not owner</h2>
      <p class="muted">
        This view is for the group owner. Open it on the device that
        created the group, or ask the owner to moderate from theirs.
      </p>
    </section>

    <p class="footer">
      The moderation queue lives only on the owner's device. Shippie's
      servers never see the messages or the decisions.
    </p>
  </main>
  <script>
    window.__SHIPPIE_GROUP_ID = ${JSON.stringify(groupId)};
    window.__SHIPPIE_APP_SLUG = ${JSON.stringify(slug)};
${CLIENT_SCRIPT}
  </script>
</body>
</html>`;
}

function renderChooserHtml(slug: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Group moderation — ${escapeHtml(slug)}</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <main>
    <h1>Group moderation <span class="tag">${escapeHtml(slug)}</span></h1>
    <p class="subtitle">Pick a group from this device to moderate.</p>
    <section>
      <div id="groups">loading…</div>
    </section>
  </main>
  <script>
    window.__SHIPPIE_APP_SLUG = ${JSON.stringify(slug)};
${CHOOSER_SCRIPT}
  </script>
</body>
</html>`;
}

const BASE_CSS = `
:root {
  color-scheme: light dark;
  --bg: #FAF7EF;
  --fg: #14120F;
  --muted: #5C5751;
  --line: #E8DDC9;
  --accent: #E8603C;
  --danger: #B23A2B;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #14120F; --fg: #FAF7EF; --muted: #C4BAA8; --line: #2A2520; }
}
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg);
             font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; }
main { max-width: 640px; margin: 0 auto; padding: 24px 20px 64px; }
h1 { font-size: 28px; margin: 0 0 4px; font-weight: 600; letter-spacing: -0.01em; }
p.subtitle { margin: 0 0 28px; color: var(--muted); font-size: 15px; }
h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em;
     color: var(--muted); margin: 28px 0 10px; }
section { padding: 16px 0; border-top: 1px solid var(--line); }
.row { display: flex; gap: 8px; flex-wrap: wrap; }
.muted { color: var(--muted); font-size: 13px; }
.hidden { display: none; }
button { height: 36px; padding: 0 14px; border-radius: 999px;
         border: 1px solid var(--fg); background: transparent;
         color: var(--fg); font-size: 14px; font-weight: 500; cursor: pointer; }
button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #14120F; }
button.danger { color: var(--danger); border-color: var(--danger); }
.entry { padding: 12px 0; border-top: 1px dashed var(--line); }
.entry:first-child { border-top: 0; }
.entry .body { font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
               font-size: 13px; color: var(--fg); margin: 4px 0 8px; white-space: pre-wrap; }
.entry .meta { font-size: 11px; color: var(--muted); }
.tag { display: inline-block; padding: 2px 8px; border-radius: 4px;
       background: var(--line); color: var(--muted); font-size: 11px;
       font-family: ui-monospace, monospace; margin-left: 6px; }
.footer { margin-top: 40px; font-size: 12px; color: var(--muted); line-height: 1.6; }
`;

const CLIENT_SCRIPT = `
(async function() {
  const groupId = window.__SHIPPIE_GROUP_ID;
  const queueEl = document.getElementById('queue');
  const modeEl = document.getElementById('mode-current');
  const notOwnerEl = document.getElementById('not-owner');

  function shippie() {
    return window.shippie || (window.parent && window.parent.shippie) || null;
  }

  async function loadGroup() {
    const s = shippie();
    if (!s || !s.local || !s.local.group || typeof s.local.group.attach !== 'function') {
      // SDK not in scope — render an empty-state message.
      queueEl.textContent = 'No Shippie SDK on this page. Open this URL from the app's tab.';
      return null;
    }
    return s.local.group.attach(groupId);
  }

  function renderQueue(entries, hook) {
    if (!entries || entries.length === 0) {
      queueEl.textContent = 'Queue is empty.';
      return;
    }
    queueEl.innerHTML = '';
    for (const e of entries) {
      const div = document.createElement('div');
      div.className = 'entry';
      const body = document.createElement('div');
      body.className = 'body';
      body.textContent = e.payloadJson;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent =
        new Date(e.ts).toLocaleString() +
        ' · ' + (e.reason || '') +
        (e.score ? (' · score ' + e.score.toFixed(2)) : '') +
        (e.categories ? (' · ' + e.categories.join(', ')) : '');
      const row = document.createElement('div');
      row.className = 'row';
      const ok = document.createElement('button');
      ok.textContent = 'Approve';
      ok.onclick = async () => {
        await hook.approve(e.id);
        refresh(hook);
      };
      const no = document.createElement('button');
      no.className = 'danger';
      no.textContent = 'Reject';
      no.onclick = async () => {
        await hook.reject(e.id);
        refresh(hook);
      };
      row.appendChild(ok);
      row.appendChild(no);
      div.appendChild(body);
      div.appendChild(meta);
      div.appendChild(row);
      queueEl.appendChild(div);
    }
  }

  async function refresh(hook) {
    if (!hook) return;
    const queue = await hook.getQueue();
    renderQueue(queue, hook);
    modeEl.textContent = 'current: ' + hook.mode;
    document.querySelectorAll('#mode-row button').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.mode === hook.mode));
    });
  }

  const hook = await loadGroup();
  if (!hook) return;

  if (hook.ownerPeerId !== hook.selfPeerId) {
    notOwnerEl.classList.remove('hidden');
    queueEl.textContent = '';
    document.getElementById('mode-row').classList.add('hidden');
    return;
  }

  document.querySelectorAll('#mode-row button').forEach((btn) => {
    btn.addEventListener('click', async () => {
      hook.setMode(btn.dataset.mode);
      await refresh(hook);
    });
  });

  await refresh(hook);
})();
`;

const CHOOSER_SCRIPT = `
(async function() {
  const groupsEl = document.getElementById('groups');
  const s = window.shippie || (window.parent && window.parent.shippie) || null;
  if (!s || !s.local || !s.local.group || typeof s.local.group.list !== 'function') {
    groupsEl.textContent = 'No Shippie SDK on this page.';
    return;
  }
  const groups = await s.local.group.list();
  if (!groups || groups.length === 0) {
    groupsEl.textContent = 'No groups on this device.';
    return;
  }
  groupsEl.innerHTML = '';
  for (const g of groups) {
    const a = document.createElement('a');
    a.href = './' + encodeURIComponent(g.id) + '/moderate';
    a.textContent = (g.name || g.id);
    a.style.display = 'block';
    a.style.padding = '10px 0';
    a.style.color = 'var(--fg)';
    groupsEl.appendChild(a);
  }
})();
`;

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
