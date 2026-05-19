import { useBackupState } from './useBackupState';

export type BackupableStore = {
  exportEncrypted: (passphrase: string) => Promise<Blob>;
  importEncrypted: (
    file: Blob,
    passphrase: string,
    opts?: { dryRun?: boolean },
  ) => Promise<{ ok: boolean; preview?: unknown; error?: string }>;
};

export type BackupCardProps = {
  appSlug: string;
  store: BackupableStore;
  className?: string;
  initialLastBackupAt?: number | null;
};

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`;
  return new Date(ms).toLocaleDateString();
}

export function BackupCard({ appSlug, store, className, initialLastBackupAt = null }: BackupCardProps) {
  const { state, dispatch } = useBackupState({ lastBackupAt: initialLastBackupAt });

  const onBackup = async () => {
    const passphrase = prompt('Choose a passphrase. You will need this to restore.');
    if (!passphrase) return;
    dispatch({ type: 'backup:start' });
    try {
      const blob = await store.exportEncrypted(passphrase);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${appSlug}-backup-${new Date().toISOString().slice(0, 10)}.shippiebak`;
      a.click();
      URL.revokeObjectURL(url);
      dispatch({ type: 'backup:success', at: Date.now() });
    } catch (err) {
      dispatch({
        type: 'backup:fail',
        error: err instanceof Error ? err.message : 'Backup failed',
      });
    }
  };

  const onRestore = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.shippiebak,application/octet-stream';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const passphrase = prompt('Enter the passphrase used when backing up.');
      if (!passphrase) return;
      dispatch({ type: 'restore:start' });
      const dry = await store.importEncrypted(file, passphrase, { dryRun: true });
      if (!dry.ok) {
        dispatch({ type: 'restore:fail', error: dry.error ?? 'Restore preview failed' });
        return;
      }
      if (!confirm('Restore preview ok. This will replace local data. Continue?')) {
        dispatch({ type: 'restore:fail', error: 'Cancelled' });
        return;
      }
      const real = await store.importEncrypted(file, passphrase);
      if (real.ok) dispatch({ type: 'restore:success' });
      else dispatch({ type: 'restore:fail', error: real.error ?? 'Restore failed' });
    };
    input.click();
  };

  return (
    <div className={`shippie-backup-card${className ? ' ' + className : ''}`}>
      <p className="shippie-backup-card__eyebrow">Backup</p>
      <h3 className="shippie-backup-card__title">Your stuff is yours.</h3>
      <p className="shippie-backup-card__body">
        {state.lastBackupAt
          ? `Last backed up ${formatRelative(state.lastBackupAt)}.`
          : 'Never backed up on this device.'}
      </p>
      <div className="shippie-backup-card__actions">
        <button type="button" onClick={onBackup} disabled={state.status === 'backing-up'}>
          {state.status === 'backing-up' ? 'Backing up…' : 'Back up now'}
        </button>
        <button type="button" onClick={onRestore} disabled={state.status === 'restoring'}>
          {state.status === 'restoring' ? 'Restoring…' : 'Restore from file'}
        </button>
      </div>
      {state.error ? <p className="shippie-backup-card__error">{state.error}</p> : null}
    </div>
  );
}
