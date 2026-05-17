<script lang="ts">
  interface Props {
    backupPassphrase: string;
    backupError: string;
    backupExport: string;
    onCreateBackup: () => void;
    restorePayload: string;
    restorePassphrase: string;
    restoreStatus: string;
    onRestore: () => void;
  }

  let {
    backupPassphrase = $bindable(),
    backupError,
    backupExport,
    onCreateBackup,
    restorePayload = $bindable(),
    restorePassphrase = $bindable(),
    restoreStatus,
    onRestore,
  }: Props = $props();

  let mode = $state<'create' | 'restore'>('create');
  let showRawExport = $state(false);

  function downloadBackup() {
    if (!backupExport) return;
    const blob = new Blob([backupExport], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.href = url;
    a.download = `shippie-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function onPickFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      restorePayload = await file.text();
    } catch {
      restorePayload = '';
    }
  }
</script>

<section class="card" aria-labelledby="backup-heading">
  <header>
    <h3 id="backup-heading">Encrypted backup</h3>
    <p>One file, one passphrase. Stays with you — Shippie never sees the contents.</p>
  </header>

  <div class="segmented" role="tablist" aria-label="Backup mode">
    <button
      role="tab"
      aria-selected={mode === 'create'}
      class:active={mode === 'create'}
      onclick={() => (mode = 'create')}
    >Create</button>
    <button
      role="tab"
      aria-selected={mode === 'restore'}
      class:active={mode === 'restore'}
      onclick={() => (mode = 'restore')}
    >Restore</button>
  </div>

  {#if mode === 'create'}
    <label>
      <span class="label">Passphrase</span>
      <input
        type="password"
        bind:value={backupPassphrase}
        placeholder="Choose a passphrase you'll remember"
        autocomplete="new-password"
      />
    </label>
    <button class="primary" onclick={onCreateBackup}>Create encrypted backup</button>
    {#if backupError}
      <p class="error">{backupError}</p>
    {/if}
    {#if backupExport}
      <div class="result" role="status">
        <p><strong>Backup ready.</strong> Save the file somewhere you control.</p>
        <button class="primary" onclick={downloadBackup}>Download backup file</button>
        <details bind:open={showRawExport}>
          <summary>Show raw JSON</summary>
          <pre>{backupExport}</pre>
        </details>
      </div>
    {/if}
  {:else}
    <label class="file-input">
      <span class="label">Backup file</span>
      <input type="file" accept="application/json,.json" onchange={onPickFile} />
    </label>
    <details>
      <summary>Or paste JSON directly</summary>
      <textarea
        bind:value={restorePayload}
        placeholder="Paste encrypted backup JSON"
        spellcheck="false"
      ></textarea>
    </details>
    <label>
      <span class="label">Passphrase</span>
      <input
        type="password"
        bind:value={restorePassphrase}
        placeholder="The passphrase used to create the backup"
        autocomplete="current-password"
      />
    </label>
    <button class="primary" onclick={onRestore} disabled={!restorePayload}>Restore locally</button>
    {#if restoreStatus}
      <p class="status">{restoreStatus}</p>
    {/if}
  {/if}
</section>

<style>
  h3,
  p {
    margin: 0;
  }
  .card {
    padding: var(--space-lg);
    border: 1px solid var(--border-light);
    background: var(--bg-pure);
    display: grid;
    gap: var(--space-md);
  }
  header {
    display: grid;
    gap: 0.35rem;
  }
  h3 {
    font-family: var(--font-heading);
    font-size: 1.15rem;
  }
  header p {
    color: var(--text-secondary);
    line-height: 1.55;
  }
  .segmented {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border: 1px solid var(--border-light);
    background: var(--surface);
  }
  .segmented button {
    min-height: 40px;
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    font: inherit;
    cursor: pointer;
  }
  .segmented button.active {
    background: var(--text);
    color: var(--bg-pure);
    font-weight: 600;
  }
  label {
    display: grid;
    gap: 6px;
  }
  .label {
    font-size: var(--small-size);
    color: var(--text-secondary);
  }
  input[type='password'],
  input[type='file'] {
    min-height: 44px;
    padding: 0 0.75rem;
    border: 1px solid var(--border-light);
    background: var(--surface);
    color: var(--text);
    font: inherit;
  }
  input[type='file'] {
    padding: 0.5rem 0.75rem;
  }
  textarea {
    margin-top: 6px;
    min-height: 110px;
    padding: 0.75rem;
    border: 1px solid var(--border-light);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    resize: vertical;
  }
  details {
    border: 1px solid var(--border-light);
    background: var(--surface);
    padding: 10px 12px;
  }
  details summary {
    cursor: pointer;
    color: var(--text-secondary);
    font-size: var(--small-size);
    list-style: none;
  }
  details summary::-webkit-details-marker {
    display: none;
  }
  details[open] summary {
    margin-bottom: 8px;
  }
  pre {
    margin: 8px 0 0;
    padding: var(--space-sm);
    border: 1px solid var(--border-light);
    background: var(--bg-pure);
    overflow: auto;
    max-height: 260px;
    font-size: var(--caption-size);
  }
  .primary {
    min-height: 48px;
    padding: 0.7rem 1rem;
    border: 1px solid var(--text);
    background: var(--text);
    color: var(--bg-pure);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .result {
    display: grid;
    gap: 10px;
    padding: var(--space-md);
    border: 1px solid var(--border-light);
    background: var(--surface);
  }
  .result p {
    color: var(--text);
    line-height: 1.5;
    font-size: var(--small-size);
  }
  .error {
    color: #B6472D;
    font-size: var(--small-size);
  }
  .status {
    color: var(--text-secondary);
    font-size: var(--small-size);
    line-height: 1.55;
  }
  @media (max-width: 640px) {
    .card {
      padding: var(--space-md);
    }
  }
</style>
