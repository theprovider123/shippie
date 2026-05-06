export type PwaReadinessStatus = 'estimated' | 'detected' | 'confirmed' | 'disputed';

export type PwaReadinessReason =
  | 'html-fetched'
  | 'manifest-found'
  | 'manifest-missing'
  | 'manifest-invalid'
  | 'manifest-name-found'
  | 'manifest-name-missing'
  | 'manifest-icons-found'
  | 'manifest-icons-missing'
  | 'manifest-display-found'
  | 'manifest-display-missing'
  | 'theme-color-set'
  | 'theme-color-missing'
  | 'service-worker-runtime-required'
  | 'service-worker-active'
  | 'beforeinstallprompt-fired'
  | 'fetch-failed';

export interface PwaReadinessReport {
  status: PwaReadinessStatus;
  reasons: PwaReadinessReason[];
  checkedAt: number;
}

export interface PwaChecklistItem {
  id: 'manifest' | 'icons' | 'display' | 'theme' | 'serviceWorker';
  label: string;
  ok: boolean;
  detail: string;
}

export function pwaChecklist(reasons: readonly string[] | null | undefined): PwaChecklistItem[] {
  const set = new Set(reasons ?? []);
  return [
    {
      id: 'manifest',
      label: 'Manifest',
      ok: set.has('manifest-found'),
      detail: set.has('manifest-found') ? 'Manifest detected.' : 'Add a web app manifest.',
    },
    {
      id: 'icons',
      label: 'Icons',
      ok: set.has('manifest-icons-found'),
      detail: set.has('manifest-icons-found') ? 'Install icons found.' : 'Add square app icons.',
    },
    {
      id: 'display',
      label: 'Display',
      ok: set.has('manifest-display-found'),
      detail: set.has('manifest-display-found') ? 'Standalone display declared.' : 'Use standalone display mode.',
    },
    {
      id: 'theme',
      label: 'Theme',
      ok: set.has('theme-color-set'),
      detail: set.has('theme-color-set') ? 'Theme color set.' : 'Add a theme color.',
    },
    {
      id: 'serviceWorker',
      label: 'Service worker',
      ok: set.has('service-worker-active') || set.has('beforeinstallprompt-fired'),
      detail:
        set.has('service-worker-active') || set.has('beforeinstallprompt-fired')
          ? 'Runtime proof received.'
          : 'Needs runtime proof from a real device.',
    },
  ];
}

export function pwaSurfaceLabel(
  status: PwaReadinessStatus | string | null | undefined,
  reasons: readonly string[] | null | undefined,
): string {
  if (status === 'confirmed') return 'App';
  const checklist = pwaChecklist(reasons);
  const staticReady = checklist
    .filter((item) => item.id !== 'serviceWorker')
    .every((item) => item.ok);
  if (staticReady && (status === 'detected' || status === 'estimated')) return 'App — verifying';
  return 'Web App';
}

