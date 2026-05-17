import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createShippieIframeSdk, type ShippieIframeSdk } from '@shippie/iframe-sdk';

export interface ShowcaseManifestLike {
  appId?: string;
  slug?: string;
  name?: string;
}

export interface MountShowcaseOptions {
  appId?: string;
  manifest?: ShowcaseManifestLike;
  root?: HTMLElement | string | null;
  strict?: boolean;
  whenReady?: () => Promise<void> | void;
}

export interface MountedShowcase {
  root: Root;
  shippie: ShippieIframeSdk;
  unmount(): void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  onError(error: unknown, info?: ErrorInfo): void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ShowcaseErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.props.onError(error, info);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main role="alert" style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
          This tool could not open.
        </main>
      );
    }
    return this.props.children;
  }
}

export function appIdForShowcase(manifest: ShowcaseManifestLike | undefined, explicitAppId?: string): string {
  if (explicitAppId?.trim()) return explicitAppId.trim();
  if (manifest?.appId?.trim()) return manifest.appId.trim();
  const slug = manifest?.slug?.trim();
  if (slug) return `app_${slug.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
  return 'app_showcase';
}

export function mountShowcase(app: ReactNode, options: MountShowcaseOptions = {}): MountedShowcase {
  const appId = appIdForShowcase(options.manifest, options.appId);
  const shippie = createShippieIframeSdk({ appId });
  let reportedError = false;

  const reportError = (error: unknown) => {
    if (reportedError) return;
    reportedError = true;
    shippie.lifecycle.error(error);
  };

  try {
    const rootElement = resolveRoot(options.root);
    const root = createRoot(rootElement);
    const tree = (
      <ShowcaseErrorBoundary onError={reportError}>
        {options.strict === false ? app : <StrictMode>{app}</StrictMode>}
      </ShowcaseErrorBoundary>
    );

    root.render(tree);

    void afterPaint().then(async () => {
      if (reportedError) return;
      await options.whenReady?.();
      if (!reportedError) shippie.lifecycle.ready();
    }, reportError);

    return {
      root,
      shippie,
      unmount() {
        root.unmount();
      },
    };
  } catch (error) {
    reportError(error);
    throw error;
  }
}

function resolveRoot(input: MountShowcaseOptions['root']): HTMLElement {
  if (input instanceof HTMLElement) return input;
  const selector = typeof input === 'string' ? input : '#root';
  const root = document.querySelector<HTMLElement>(selector);
  if (!root) throw new Error(`Missing showcase root: ${selector}`);
  return root;
}

function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}
