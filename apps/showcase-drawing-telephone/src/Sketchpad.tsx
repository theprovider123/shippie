import { useCallback, useEffect, useRef, useState } from 'react';
import type { SketchPoint, SketchStroke } from './sketch';

interface Props {
  onSubmit: (strokes: SketchStroke[]) => void;
  hint?: string;
}

const COLOR = '#2A1F16';
const WIDTH = 4;

export function Sketchpad({ onSubmit, hint }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const strokesRef = useRef<SketchStroke[]>([]);
  const drawingRef = useRef<SketchStroke | null>(null);
  const [, setRepaintTick] = useState(0);

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const all = drawingRef.current ? [...strokesRef.current, drawingRef.current] : strokesRef.current;
    for (const s of all) {
      if (s.points.length === 0) continue;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.beginPath();
      const [first, ...rest] = s.points;
      if (!first) continue;
      ctx.moveTo(first.x * width, first.y * height);
      for (const p of rest) ctx.lineTo(p.x * width, p.y * height);
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = Math.max(window.devicePixelRatio ?? 1, 1);
    const resize = () => {
      const size = Math.min(container.clientWidth, 480);
      canvas.width = Math.floor(size * dpr);
      canvas.height = Math.floor(size * dpr);
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      repaint();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();
    return () => ro.disconnect();
  }, [repaint]);

  const pointAt = (e: React.PointerEvent<HTMLCanvasElement>): SketchPoint => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = { color: COLOR, width: WIDTH, points: [pointAt(e)] };
    repaint();
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current.points.push(pointAt(e));
    repaint();
  };
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current!;
    canvas.releasePointerCapture(e.pointerId);
    strokesRef.current.push(drawingRef.current);
    drawingRef.current = null;
    setRepaintTick((t) => t + 1);
  };

  const undo = () => {
    strokesRef.current.pop();
    repaint();
    setRepaintTick((t) => t + 1);
  };
  const clear = () => {
    strokesRef.current = [];
    drawingRef.current = null;
    repaint();
    setRepaintTick((t) => t + 1);
  };

  const submit = () => {
    if (strokesRef.current.length === 0) return;
    onSubmit(strokesRef.current);
    strokesRef.current = [];
    drawingRef.current = null;
    repaint();
    setRepaintTick((t) => t + 1);
  };

  const hasInk = strokesRef.current.length > 0;

  return (
    <div className="sketchpad">
      {hint ? <p className="muted small">{hint}</p> : null}
      <div ref={containerRef} className="canvas-wrap">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>
      <div className="row-actions">
        <button type="button" className="ghost" onClick={undo} disabled={!hasInk}>Undo</button>
        <button type="button" className="ghost" onClick={clear} disabled={!hasInk}>Clear</button>
        <button type="button" className="primary" onClick={submit} disabled={!hasInk}>Send drawing</button>
      </div>
    </div>
  );
}
