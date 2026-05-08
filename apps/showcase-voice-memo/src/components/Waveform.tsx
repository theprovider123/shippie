import { useEffect, useRef, useState } from 'react';

interface Props {
  blob: Blob | null;
  /** 0..1 progress through the audio. */
  progress: number;
  /** Click-to-seek. Receives a 0..1 value. */
  onSeek?: (fraction: number) => void;
}

/**
 * Decode the audio once on mount, downsample to peaks, paint to a
 * canvas. The progress fraction draws a fill overlay.
 *
 * Decode falls back to a static stripe when AudioContext / decode
 * fail (e.g. iOS Safari with codec disagreement on the blob). The
 * audio still plays through the <audio> tag in Memo.tsx — the
 * waveform is decorative, not load-bearing.
 */
export function Waveform({ blob, progress, onSeek }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!blob) {
      setPeaks(null);
      return;
    }
    (async () => {
      try {
        const Ctor: typeof AudioContext =
          (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
            .AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!;
        if (!Ctor) {
          setPeaks(null);
          return;
        }
        const arr = await blob.arrayBuffer();
        const ctx = new Ctor();
        const decoded = await ctx.decodeAudioData(arr.slice(0));
        const channel = decoded.getChannelData(0);
        const buckets = 96;
        const out: number[] = new Array(buckets).fill(0);
        const stride = Math.floor(channel.length / buckets) || 1;
        for (let i = 0; i < buckets; i += 1) {
          let peak = 0;
          const start = i * stride;
          const end = Math.min(channel.length, start + stride);
          for (let j = start; j < end; j += 1) {
            const v = Math.abs(channel[j] ?? 0);
            if (v > peak) peak = v;
          }
          out[i] = peak;
        }
        await ctx.close();
        if (cancelled) return;
        setPeaks(out);
      } catch {
        if (!cancelled) setPeaks(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const cssWidth = canvas.clientWidth || 320;
    const cssHeight = canvas.clientHeight || 56;
    if (canvas.width !== Math.floor(cssWidth * dpr)) {
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
    }
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    const buckets = peaks ?? new Array(96).fill(0.05);
    const barCount = buckets.length;
    const barWidth = (cssWidth - (barCount - 1) * 2) / barCount;
    for (let i = 0; i < barCount; i += 1) {
      const peak = buckets[i] ?? 0;
      const h = Math.max(2, peak * (cssHeight - 4));
      const x = i * (barWidth + 2);
      const y = (cssHeight - h) / 2;
      const isPlayed = i / barCount <= progress;
      ctx.fillStyle = isPlayed ? '#A86060' : '#C9B8A8';
      ctx.fillRect(x, y, barWidth, h);
    }
    ctx.restore();
  }, [peaks, progress]);

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(fraction);
  }

  return (
    <canvas
      className="vm-waveform"
      ref={canvasRef}
      onClick={handleClick}
      role={onSeek ? 'slider' : undefined}
      aria-label={onSeek ? 'Audio scrubber' : 'Audio waveform'}
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    />
  );
}
