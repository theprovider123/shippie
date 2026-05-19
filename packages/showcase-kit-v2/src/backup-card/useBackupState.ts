import { useReducer } from 'react';

export type BackupStatus = 'idle' | 'backing-up' | 'backed-up' | 'restoring';

export type BackupState = {
  status: BackupStatus;
  lastBackupAt: number | null;
  error?: string;
};

export type BackupAction =
  | { type: 'backup:start' }
  | { type: 'backup:success'; at: number }
  | { type: 'backup:fail'; error: string }
  | { type: 'restore:start' }
  | { type: 'restore:success' }
  | { type: 'restore:fail'; error: string }
  | { type: 'reset' };

export function reduceBackupState(state: BackupState, action: BackupAction): BackupState {
  switch (action.type) {
    case 'backup:start':
      return { ...state, status: 'backing-up', error: undefined };
    case 'backup:success':
      return { status: 'backed-up', lastBackupAt: action.at };
    case 'backup:fail':
      return { ...state, status: 'idle', error: action.error };
    case 'restore:start':
      return { ...state, status: 'restoring', error: undefined };
    case 'restore:success':
      return { ...state, status: 'idle' };
    case 'restore:fail':
      return { ...state, status: 'idle', error: action.error };
    case 'reset':
      return { status: 'idle', lastBackupAt: null };
  }
}

export function useBackupState(initial?: Partial<BackupState>) {
  const [state, dispatch] = useReducer(reduceBackupState, {
    status: 'idle',
    lastBackupAt: null,
    ...initial,
  });
  return { state, dispatch };
}
