import { useEffect, useRef, useState } from 'react';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import {
  exportRecipeBackup,
  restoreRecipeBackup,
  inspectRecipeBackup,
  type RecipeBackupInfo,
} from '../db/backup.ts';
import {
  collectStorageHealth,
  requestDurableRecipeStorage,
  saveBackupMeta,
  type RecipeStorageHealth,
} from '../db/data-safety.ts';

interface RecipeDataPanelProps {
  db: ShippieLocalDb;
  onClose: () => void;
  onChanged: () => void;
  onBackupComplete: () => void;
}

export function RecipeDataPanel({ db, onClose, onChanged, onBackupComplete }: RecipeDataPanelProps) {
  const [health, setHealth] = useState<RecipeStorageHealth | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const refresh = async () => {
    setHealth(await collectStorageHealth(db));
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleRequestPersistence = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const granted = await requestDurableRecipeStorage(db);
      setStatus(
        granted === true
          ? 'Storage protection is active on this device.'
          : granted === false
            ? 'This browser did not grant persistent storage. Keep a backup current.'
            : 'Storage protection could not be checked.',
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const { blob, info } = await exportRecipeBackup(db, passphrase);
      downloadBlob(blob, backupFilename(info));
      saveBackupMeta(info);
      onBackupComplete();
      setStatus(`Downloaded encrypted backup with ${info.recipeCount} recipes.`);
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Backup failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      const preview = await inspectRecipeBackup(file, passphrase);
      const ok = window.confirm(
        `Restore ${preview.info.recipeCount} recipes and ${preview.info.ingredientCount} ingredients? This replaces recipes on this device.`,
      );
      if (!ok) return;
      const info = await restoreRecipeBackup(db, file, passphrase);
      saveBackupMeta(info);
      onBackupComplete();
      onChanged();
      setStatus(`Restored ${info.recipeCount} recipes.`);
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Restore failed.');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div className="data-panel-backdrop" role="presentation">
      <section className="data-panel" role="dialog" aria-labelledby="recipe-data-title">
        <header className="data-panel-header">
          <div>
            <h2 id="recipe-data-title">Recipe Data</h2>
            <p>{health ? healthSummary(health) : 'Checking storage…'}</p>
          </div>
          <button type="button" className="ghost" onClick={onClose} aria-label="Close Recipe Data">
            ×
          </button>
        </header>

        {health?.mode === 'memory' ? (
          <div className="data-warning" role="alert">
            Demo memory is active. Recipes can disappear on reload until Shippie local storage is available.
          </div>
        ) : null}

        <dl className="data-health-grid">
          <div>
            <dt>Recipes</dt>
            <dd>{health?.recipeCount ?? '…'}</dd>
          </div>
          <div>
            <dt>Ingredients</dt>
            <dd>{health?.ingredientCount ?? '…'}</dd>
          </div>
          <div>
            <dt>Storage</dt>
            <dd>{health ? formatBytes(health.usedBytes) : '…'}</dd>
          </div>
          <div>
            <dt>Protection</dt>
            <dd>{health ? persistenceLabel(health) : '…'}</dd>
          </div>
          <div>
            <dt>Last backup</dt>
            <dd>{health ? backupLabel(health) : '…'}</dd>
          </div>
        </dl>

        <div className="data-panel-actions">
          <button type="button" onClick={handleRequestPersistence} disabled={busy || health?.mode === 'memory'}>
            Protect storage
          </button>
        </div>

        <label className="field data-passphrase">
          <span>Backup passphrase</span>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoComplete="new-password"
            placeholder="Required for export and restore"
          />
        </label>

        <div className="data-panel-actions">
          <button type="button" className="primary" onClick={handleExport} disabled={busy || !passphrase.trim()}>
            Download encrypted backup
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy || !passphrase.trim()}
          >
            Restore from backup
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".shippiebak,.shippie-backup,application/vnd.shippie.backup"
            className="visually-hidden"
            onChange={(e) => void handleRestoreFile(e.currentTarget.files?.[0] ?? null)}
          />
        </div>

        {status ? <p className="data-status" role="status">{status}</p> : null}
      </section>
    </div>
  );
}

function healthSummary(health: RecipeStorageHealth): string {
  if (health.mode === 'memory') return 'Not durable in this browser session.';
  if (health.persisted === true) return 'Stored locally with browser persistence granted.';
  if (health.persisted === false) return 'Stored locally. Backup recommended.';
  return 'Stored locally. Persistence status unknown.';
}

function persistenceLabel(health: RecipeStorageHealth): string {
  if (health.mode === 'memory') return 'Demo';
  if (health.persisted === true) return 'Protected';
  if (health.persisted === false) return 'Not granted';
  return 'Unknown';
}

function backupLabel(health: RecipeStorageHealth): string {
  if (!health.lastBackupAt) return 'Never';
  const when = new Date(health.lastBackupAt);
  const age = health.backupAgeDays;
  if (!Number.isFinite(when.getTime())) return 'Unknown';
  if (age == null || age === 0) return 'Today';
  if (age === 1) return 'Yesterday';
  return `${age} days ago`;
}

function backupFilename(info: RecipeBackupInfo): string {
  return `recipe-saver-${info.createdAt.slice(0, 10)}.shippiebak`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
