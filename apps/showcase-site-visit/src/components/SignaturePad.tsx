/**
 * Touch / mouse signature pad. Writes strokes to local state; on
 * release, serialises to SVG and bubbles up via `onChange`. The pad
 * accepts an `initialSvg` so reopening a submitted visit shows the
 * inspector's earlier mark instead of an empty box.
 */

import { useEffect, useRef, useState } from 'react';
import {
  SIGNATURE_HEIGHT,
  SIGNATURE_WIDTH,
  strokesToSvg,
  svgToStrokes,
  type Point,
  type Stroke,
} from '../lib/signature.ts';

export interface SignaturePadProps {
  initialSvg?: string | null;
  onChange: (svg: string | null) => void;
}

export function SignaturePad({ initialSvg, onChange }: SignaturePadProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>(() =>
    initialSvg ? svgToStrokes(initialSvg) : [],
  );
  const [drawing, setDrawing] = useState<Point[] | null>(null);

  useEffect(() => {
    if (initialSvg) setStrokes(svgToStrokes(initialSvg));
  }, [initialSvg]);

  function localPoint(e: React.PointerEvent<SVGSVGElement>): Point {
    const el = svgRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * SIGNATURE_WIDTH;
    const y = ((e.clientY - rect.top) / rect.height) * SIGNATURE_HEIGHT;
    return { x: Math.max(0, Math.min(SIGNATURE_WIDTH, x)), y: Math.max(0, Math.min(SIGNATURE_HEIGHT, y)) };
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDrawing([localPoint(e)]);
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!drawing) return;
    setDrawing((prev) => (prev ? [...prev, localPoint(e)] : prev));
  }

  function endStroke() {
    if (!drawing || drawing.length === 0) {
      setDrawing(null);
      return;
    }
    const next = [...strokes, drawing];
    setStrokes(next);
    setDrawing(null);
    onChange(strokesToSvg(next));
  }

  function clear() {
    setStrokes([]);
    setDrawing(null);
    onChange(null);
  }

  function strokePath(stroke: Stroke): string {
    if (stroke.length === 0) return '';
    const head = stroke[0]!;
    if (stroke.length === 1) return `M${head.x},${head.y} l0,0`;
    const tail = stroke
      .slice(1)
      .map((p) => `L${p.x},${p.y}`)
      .join('');
    return `M${head.x},${head.y}${tail}`;
  }

  return (
    <div className="signature-pad">
      <svg
        ref={svgRef}
        className="signature-pad__surface"
        viewBox={`0 0 ${SIGNATURE_WIDTH} ${SIGNATURE_HEIGHT}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerLeave={endStroke}
        role="img"
        aria-label="signature"
      >
        {strokes.map((s, i) => (
          <path
            key={i}
            d={strokePath(s)}
            fill="none"
            stroke="#2C1F14"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {drawing && drawing.length > 0 ? (
          <path
            d={strokePath(drawing)}
            fill="none"
            stroke="#2C1F14"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </svg>
      <div className="signature-pad__actions">
        <span className="signature-pad__hint">sign here</span>
        <button type="button" className="link-button" onClick={clear}>
          clear
        </button>
      </div>
    </div>
  );
}
