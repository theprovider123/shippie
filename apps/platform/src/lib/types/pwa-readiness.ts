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
  // "Shippie provides it" — the wrapper synthesizes this piece at serve
  // time (manifest.ts / icons.ts / sw.ts), so the app is installable even
  // though the uploaded bundle / upstream doesn't ship it. These must
  // never render as failures to the maker.
  | 'manifest-provided-by-shippie'
  | 'icons-provided-by-shippie'
  | 'service-worker-provided-by-shippie'
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
  const manifestProvided = set.has('manifest-provided-by-shippie');
  const iconsProvided = set.has('icons-provided-by-shippie');
  const swProvided = set.has('service-worker-provided-by-shippie');
  const swProven = set.has('service-worker-active') || set.has('beforeinstallprompt-fired');
  return [
    {
      id: 'manifest',
      label: 'Manifest',
      ok: set.has('manifest-found') || manifestProvided,
      detail: set.has('manifest-found')
        ? 'Manifest detected.'
        : manifestProvided
          ? 'Shippie provides a manifest for this app.'
          : 'Add a web app manifest.',
    },
    {
      id: 'icons',
      label: 'Icons',
      ok: set.has('manifest-icons-found') || iconsProvided,
      detail: set.has('manifest-icons-found')
        ? 'Install icons found.'
        : iconsProvided
          ? 'Shippie provides default install icons.'
          : 'Add square app icons.',
    },
    {
      id: 'display',
      label: 'Display',
      ok: set.has('manifest-display-found') || manifestProvided,
      detail: set.has('manifest-display-found')
        ? 'Standalone display declared.'
        : manifestProvided
          ? 'Shippie declares standalone display.'
          : 'Use standalone display mode.',
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
      ok: swProven || swProvided,
      detail: swProven
        ? 'Runtime proof received.'
        : swProvided
          ? 'Shippie provides an offline service worker.'
          : 'Needs runtime proof from a real device.',
    },
  ];
}

export interface PwaReadinessSummary {
  /** Requirements the app itself satisfies. */
  passes: string[];
  /** Genuine gaps the maker can act on. */
  gaps: string[];
  /** Requirements covered by the Shippie wrapper at serve time. */
  providedByShippie: string[];
}

/**
 * Honest pass/gap split for maker-facing UI. A reason the wrapper covers
 * at serve time is never a gap — it lands in `providedByShippie` so the
 * UI can say "covered for you" instead of rendering a fail.
 */
export function summarizePwaReadiness(
  reasons: readonly string[] | null | undefined,
): PwaReadinessSummary {
  const set = new Set(reasons ?? []);
  const passes: string[] = [];
  const gaps: string[] = [];
  const providedByShippie: string[] = [];

  const place = (label: string, shipped: boolean, provided: boolean, gap: boolean) => {
    if (shipped) passes.push(label);
    else if (provided) providedByShippie.push(label);
    else if (gap) gaps.push(label);
  };

  place(
    'Web app manifest',
    set.has('manifest-found'),
    set.has('manifest-provided-by-shippie'),
    set.has('manifest-missing') || set.has('manifest-invalid'),
  );
  place(
    'App name',
    set.has('manifest-name-found'),
    set.has('manifest-provided-by-shippie'),
    set.has('manifest-name-missing'),
  );
  place(
    'Install icons',
    set.has('manifest-icons-found'),
    set.has('icons-provided-by-shippie'),
    set.has('manifest-icons-missing'),
  );
  place(
    'Standalone display',
    set.has('manifest-display-found'),
    set.has('manifest-provided-by-shippie'),
    set.has('manifest-display-missing'),
  );
  place('Theme color', set.has('theme-color-set'), false, set.has('theme-color-missing'));
  place(
    'Service worker',
    set.has('service-worker-active') || set.has('beforeinstallprompt-fired'),
    set.has('service-worker-provided-by-shippie'),
    set.has('service-worker-runtime-required'),
  );

  return { passes, gaps, providedByShippie };
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

