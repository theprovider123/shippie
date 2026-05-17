import { describe, expect, test } from 'bun:test';
import {
  emptyDrawing,
  startStroke,
  appendPoint,
  undoLastStroke,
  drawingToSvg,
  brushHex,
  KID_COLOURS,
  BRUSH_SIZES,
} from './canvas.ts';

describe('emptyDrawing', () => {
  test('produces an empty doc with the requested dimensions', () => {
    const doc = emptyDrawing(800, 600);
    expect(doc.width).toBe(800);
    expect(doc.height).toBe(600);
    expect(doc.strokes).toEqual([]);
  });
});

describe('startStroke + appendPoint', () => {
  test('startStroke seeds a new stroke with the first point', () => {
    let doc = emptyDrawing(800, 600);
    doc = startStroke(doc, brushHex('ink'), BRUSH_SIZES[0]!, { x: 10, y: 20 });
    expect(doc.strokes).toHaveLength(1);
    expect(doc.strokes[0]!.points).toEqual([{ x: 10, y: 20 }]);
    expect(doc.strokes[0]!.width).toBe(BRUSH_SIZES[0]!);
  });

  test('appendPoint extends the latest stroke without mutating earlier strokes', () => {
    let doc = emptyDrawing(800, 600);
    doc = startStroke(doc, brushHex('ink'), 12, { x: 0, y: 0 });
    doc = startStroke(doc, brushHex('marigold'), 12, { x: 5, y: 5 });
    doc = appendPoint(doc, { x: 6, y: 6 });
    doc = appendPoint(doc, { x: 7, y: 7 });
    expect(doc.strokes).toHaveLength(2);
    expect(doc.strokes[0]!.points).toEqual([{ x: 0, y: 0 }]);
    expect(doc.strokes[1]!.points).toHaveLength(3);
    expect(doc.strokes[1]!.color).toBe(brushHex('marigold'));
  });

  test('appendPoint on an empty doc is a no-op', () => {
    const doc = appendPoint(emptyDrawing(800, 600), { x: 1, y: 1 });
    expect(doc.strokes).toEqual([]);
  });
});

describe('undoLastStroke', () => {
  test('removes the most recent stroke', () => {
    let doc = emptyDrawing(800, 600);
    doc = startStroke(doc, '#000', 6, { x: 0, y: 0 });
    doc = startStroke(doc, '#fff', 6, { x: 10, y: 10 });
    doc = undoLastStroke(doc);
    expect(doc.strokes).toHaveLength(1);
    expect(doc.strokes[0]!.color).toBe('#000');
  });

  test('on an empty doc is a no-op', () => {
    expect(undoLastStroke(emptyDrawing(800, 600)).strokes).toEqual([]);
  });
});

describe('drawingToSvg', () => {
  test('produces a valid SVG root with the right viewBox', () => {
    const svg = drawingToSvg(emptyDrawing(800, 600));
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 800 600"');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('</svg>');
  });

  test('serialises every stroke as a path', () => {
    let doc = emptyDrawing(800, 600);
    doc = startStroke(doc, '#1A1814', 12, { x: 10, y: 10 });
    doc = appendPoint(doc, { x: 20, y: 20 });
    doc = startStroke(doc, '#E8C547', 6, { x: 30, y: 30 });
    const svg = drawingToSvg(doc);
    const paths = svg.match(/<path /g);
    expect(paths?.length).toBe(2);
    expect(svg).toContain('#1A1814');
    expect(svg).toContain('#E8C547');
  });
});

describe('brushHex + KID_COLOURS', () => {
  test('returns hex for known colour ids', () => {
    expect(brushHex('ink')).toBe('#1A1814');
    expect(brushHex('marigold')).toBe('#E8C547');
    expect(brushHex('sage')).toBe('#5E7B5C');
  });

  test('KID_COLOURS palette is exactly three (kid simplicity)', () => {
    expect(KID_COLOURS.length).toBe(3);
  });
});
