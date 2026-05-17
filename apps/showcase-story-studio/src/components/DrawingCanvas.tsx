import { useRef, useState } from 'react';
import {
  type DrawingDoc,
  type StrokePoint,
  startStroke,
  appendPoint,
  undoLastStroke,
  drawingToSvg,
  brushHex,
  BRUSH_SIZES,
  KID_COLOURS,
  type KidColourId,
  type BrushSize,
} from '../lib/canvas.ts';

const W = 800;
const H = 600;

interface Props {
  initial?: DrawingDoc;
  onChange: (doc: DrawingDoc) => void;
}

export function DrawingCanvas({ initial, onChange }: Props) {
  const [doc, setDoc] = useState<DrawingDoc>(() => initial ?? { width: W, height: H, strokes: [] });
  const [colour, setColour] = useState<KidColourId>(KID_COLOURS[0]!.id);
  const [size, setSize] = useState<BrushSize>(BRUSH_SIZES[1]!);
  const drawingRef = useRef(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  function pointFromEvent(e: React.PointerEvent<SVGSVGElement>): StrokePoint {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    return { x, y };
  }

  function update(next: DrawingDoc) {
    setDoc(next);
    onChange(next);
  }

  function down(e: React.PointerEvent<SVGSVGElement>) {
    e.preventDefault();
    drawingRef.current = true;
    svgRef.current?.setPointerCapture(e.pointerId);
    update(startStroke(doc, brushHex(colour), size, pointFromEvent(e)));
  }

  function move(e: React.PointerEvent<SVGSVGElement>) {
    if (!drawingRef.current) return;
    update(appendPoint(doc, pointFromEvent(e)));
  }

  function up(e: React.PointerEvent<SVGSVGElement>) {
    drawingRef.current = false;
    try { svgRef.current?.releasePointerCapture(e.pointerId); } catch { /* */ }
  }

  function undo() {
    update(undoLastStroke(doc));
  }

  function clear() {
    update({ ...doc, strokes: [] });
  }

  return (
    <div className="ss-canvas-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="ss-canvas"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        // SVG content rendered from doc.strokes
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: drawingToSvg(doc).replace(/<svg[^>]*>|<\/svg>/g, '') }}
      />

      <div className="ss-canvas-tools">
        <div className="ss-tool-row" role="radiogroup" aria-label="Colour">
          {KID_COLOURS.map((c) => (
            <button
              key={c.id}
              type="button"
              className="ss-colour"
              data-active={colour === c.id}
              style={{ background: c.hex }}
              onClick={() => setColour(c.id)}
              aria-label={c.name}
            />
          ))}
        </div>
        <div className="ss-tool-row" role="radiogroup" aria-label="Brush size">
          {BRUSH_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              className="ss-size"
              data-active={size === s}
              onClick={() => setSize(s)}
              aria-label={`${s}px brush`}
            >
              <span className="ss-size-dot" style={{ width: s, height: s }} />
            </button>
          ))}
        </div>
        <div className="ss-tool-row">
          <button type="button" className="ss-btn ss-btn-ghost" onClick={undo}>Undo</button>
          <button type="button" className="ss-btn ss-btn-ghost" onClick={clear}>Clear</button>
        </div>
      </div>
    </div>
  );
}
