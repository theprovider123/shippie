/**
 * Steep Data panel — same shape as RecipeDataPanel.
 *
 * Surfaces the four-tier headline status, an iOS Safari eviction
 * warning when applicable, current quota usage, last backup, and
 * encrypted export / restore actions. The export uses Web Share on iOS
 * so the user lands in Files / iCloud Drive.
 */
import { useEffect, useRef, useState } from 'react';
import type { ShippieLocalDb } from '@shippie/local-runtime-contract';
import {
  exportSteepBackup,
  inspectSteepBackup,
  restoreSteepBackup,
  saveBackupBlob,
  type SteepBackupInfo,
} from '../db/backup.ts';
import {
  collectStorageHealth,
  requestDurableSteepStorage,
  saveBackupMeta,
  type SteepStorageHealth,
  type StorageStatus,
} from '../db/data-safety.ts';

interface SteepDataPanelProps {
  db: ShippieLocalDb;
  onClose: () => void;
  onChanged: () => void;
  onBackupComplete: () => void;
}

export function SteepDataPanel({ db, onClose, onChanged, onBackupComplete }: SteepDataPanelProps) {
  const [health, setHealth] = useState<SteepStorageHealth | null>(null);
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
      const granted = await requestDurableSteepStorage(db);
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
      const { blob, info } = await exportSteepBackup(db, passphrase);
      const result = await saveBackupBlob(blob, backupFilename(info));
      saveBackupMeta(info);
      onBackupComplete();
      setStatus(
        result.via === 'share'
          ? `Saved encrypted backup with ${info.blendCount} blends — pick a Files location.`
          : `Downloaded encrypted backup with ${info.blendCount} blends.`,
      );
      await refresh();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setStatus('Backup was cancelled before saving. Try again to keep the file.');
      } else {
        setStatus(err instanceof Error ? err.message : 'Backup failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      const preview = await inspectSteepBackup(file, passphrase);
      const ok = window.confirm(
        `Restore ${preview.info.blendCount} blends, ${preview.info.ingredientCount} ingredients, and ${preview.info.brewLogCount} brew log entries? This replaces user data on this device.`,
      );
      if (!ok) return;
      const info = await restoreSteepBackup(db, file, passphrase);
      saveBackupMeta(info);
      onBackupComplete();
      onChanged();
      setStatus(`Restored ${info.blendCount} blends.`);
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
      <section className="data-panel" role="dialog" aria-labelledby="steep-data-title">
        <header className="data-panel-header">
          <div>
            <h2 id="steep-data-title">Steep Data</h2>
            <p>{health ? healthSummary(health) : 'Checking storage…'}</p>
          </div>
          <button type="button" className="ghost" onClick={onClose} aria-label="Close Steep Data">
            ×
          </button>
        </header>

        {health?.mode === 'memory' ? (
          <div className="data-warning" role="alert">
            Demo memory is active. Blends can disappear on reload until Shippie local storage is available.
          </div>
        ) : null}

        {health?.iosRiskLevel === 'critical' ? (
          <div className="data-warning ios-eviction-warning" role="alert">
            On iPhone Safari, website data may be cleared after inactivity. Install to Home Screen
            to keep your blends safe.
          </div>
        ) : null}

        {health ? (
          <div className={`data-status-tile data-status-${health.status}`} role="status">
            <span className="data-status-label">{statusHeadline(health.status)}</span>
            <span className="data-status-detail">{statusDetail(health)}</span>
          </div>
        ) : null}

        <dl className="data-health-grid">
          <div>
            <dt>Blends</dt>
            <dd>{health?.blendCount ?? '…'}</dd>
          </div>
          <div>
            <dt>Herbs</dt>
            <dd>{health?.herbCount ?? '…'}</dd>
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
            Save encrypted backup
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

function healthSummary(health: SteepStorageHealth): string {
  if (health.mode === 'memory') return 'Not durable in this browser session.';
  if (health.persisted === true) return 'Stored locally with browser persistence granted.';
  if (health.persisted === false) return 'Stored locally. Backup recommended.';
  return 'Stored locally. Persistence status unknown.';
}

function persistenceLabel(health: SteepStorageHealth): string {
  if (health.mode === 'memory') return 'Demo';
  if (health.persisted === true) return 'Protected';
  if (health.persisted === false) return 'Not granted';
  return 'Unknown';
}

function backupLabel(health: SteepStorageHealth): string {
  if (!health.lastBackupAt) return 'Never';
  const when = new Date(health.lastBackupAt);
  const age = health.backupAgeDays;
  if (!Number.isFinite(when.getTime())) return 'Unknown';
  if (age == null || age === 0) return 'Today';
  if (age === 1) return 'Yesterday';
  return `${age} days ago`;
}

function backupFilename(info: SteepBackupInfo): string {
  return `steep-${info.createdAt.slice(0, 10)}.shippiebak`;
}

function statusHeadline(status: StorageStatus): string {
  if (status === 'safe') return 'Safe';
  if (status === 'protected-locally') return 'Protected on this device';
  if (status === 'only-on-this-device') return 'Only on this device';
  return 'At risk';
}

function statusDetail(health: SteepStorageHealth): string {
  if (health.status === 'safe') return 'Backed up recently and protected by your browser.';
  if (health.status === 'protected-locally') {
    return 'Storage protection is active. Save a backup so blends survive a reset.';
  }
  if (health.status === 'only-on-this-device') {
    return 'No storage protection yet. Browsers may evict data under pressure.';
  }
  if (health.mode === 'memory') return 'Demo memory — blends will disappear on reload.';
  if (health.iosRiskLevel === 'critical') {
    return 'iPhone Safari can clear website data after inactivity. Install or back up.';
  }
  return 'Storage is at risk. Save a backup before adding more blends.';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
