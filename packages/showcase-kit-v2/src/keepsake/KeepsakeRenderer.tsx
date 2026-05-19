import { useCallback, useRef, useState, type ReactNode } from 'react';
import type { KeepsakeTemplate } from './types';
import { canvasToPng, pngToPdf } from './pdf-from-canvas';
import { shareKeepsake } from './share-keepsake';

const WIDTH = 1080;
const HEIGHT = 1350;

export type KeepsakeRendererProps<T> = {
  template: KeepsakeTemplate<T>;
  data: T;
  filename: string;
  trigger: (open: () => void, busy: boolean) => ReactNode;
  onShared?: (success: boolean) => void;
  width?: number;
  height?: number;
};

export function KeepsakeRenderer<T>({
  template,
  data,
  filename,
  trigger,
  onShared,
  width = WIDTH,
  height = HEIGHT,
}: KeepsakeRendererProps<T>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const canvas = canvasRef.current ?? document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');
      const result = template(ctx, data, width, height);
      if (result instanceof Promise) await result;
      const png = await canvasToPng(canvas);
      const pdf = await pngToPdf(png, width, height);
      await shareKeepsake({ pngBlob: png, pdfBlob: pdf, filename }, () => onShared?.(true));
    } catch (err) {
      console.error('Keepsake render failed', err);
      onShared?.(false);
    } finally {
      setBusy(false);
    }
  }, [template, data, filename, onShared, width, height]);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ position: 'fixed', left: -99999, top: -99999, pointerEvents: 'none' }}
        aria-hidden
      />
      {trigger(run, busy)}
    </>
  );
}
