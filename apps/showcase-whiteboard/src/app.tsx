import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createGroup,
  joinGroup,
  EventLog,
  type Group,
} from '@shippie/proximity';
import { renderQrSvg } from '@shippie/sdk/wrapper';
import * as Y from 'yjs';
import { appendPoint, bindBoard, strokeToYMap, yMapToStroke } from './board.ts';
import type { BoardCommand, Stroke, StrokePoint } from './types.ts';

const APP_SLUG = 'whiteboard';
const PALETTE = ['#FAF7EF', '#E8603C', '#3E78D6', '#2EAD64', '#E0B345', '#B23AB2'];

type Phase = 'lobby' | 'creating' | 'in-room';

export function App() {
  const [phase, setPhase] = useState<Phase>('lobby');
  const [group, setGroup] = useState<Group | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      group?.leave();
    };
  }, [group]);

  const handleCreate = useCallback(async () => {
    setPhase('creating');
    setError(null);
    try {
      const g = await createGroup({ appSlug: APP_SLUG });
      setGroup(g);
      setPhase('in-room');
    } catch (err) {
      setError((err as Error).message);
      setPhase('lobby');
    }
  }, []);

  const handleJoin = useCallback(async () => {
    if (!/^[A-Z0-9]{8}$/i.test(joinCode)) {
      setError('Join code is 8 letters/numbers.');
      return;
    }
    setPhase('creating');
    setError(null);
    try {
      const g = await joinGroup({ appSlug: APP_SLUG, joinCode });
      setGroup(g);
      setPhase('in-room');
    } catch (err) {
      setError((err as Error).message);
      setPhase('lobby');
    }
  }, [joinCode]);

  // Auto-join from query string ?j=ABCDEFGH (the QR encodes this).
  useEffect(() => {
    const u = new URL(window.location.href);
    const j = u.searchParams.get('j');
    if (j) {
      setJoinCode(j.toUpperCase());
      void (async () => {
        setPhase('creating');
        try {
          const g = await joinGroup({ appSlug: APP_SLUG, joinCode: j });
          setGroup(g);
          setPhase('in-room');
        } catch (err) {
          setError((err as Error).message);
          setPhase('lobby');
        }
      })();
    }
  }, []);

  if (phase === 'lobby' || phase === 'creating') {
    return (
      <Lobby
        joinCode={joinCode}
        onJoinCodeChange={setJoinCode}
        onCreate={handleCreate}
        onJoin={handleJoin}
        busy={phase === 'creating'}
        error={error}
      />
    );
  }
  return <Room group={group!} onLeave={() => { group?.leave(); setGroup(null); setPhase('lobby'); }} />;
}

function Lobby(props: {
  joinCode: string;
  onJoinCodeChange: (s: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: 24,
    }}>
      <div style={{ maxWidth: 360, width: '100%' }}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>Shippie Whiteboard</h1>
        <p style={{ color: '#9C9385', marginTop: 0 }}>
          Local-network drawing. Pair via QR. Local strokes paint instantly,
          remote strokes appear in under 30ms on a shared WiFi.
        </p>
        <button
          disabled={props.busy}
          onClick={props.onCreate}
          style={primaryBtnStyle}
        >
          {props.busy ? 'Setting up…' : 'Start a board'}
        </button>
        <div style={{ height: 16 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={props.joinCode}
            onChange={(e) => props.onJoinCodeChange(e.target.value.toUpperCase())}
            placeholder="JOIN CODE"
            maxLength={8}
            inputMode="text"
            autoCapitalize="characters"
            style={inputStyle}
          />
          <button disabled={props.busy} onClick={props.onJoin} style={secondaryBtnStyle}>
            Join
          </button>
        </div>
        {props.error ? (
          <p style={{ color: '#E8603C', marginTop: 16 }}>{props.error}</p>
        ) : null}
      </div>
    </div>
  );
}

function Room(props: { group: Group; onLeave: () => void }) {
  const { group } = props;
  const [color, setColor] = useState<string>(PALETTE[1]!);
  const [width, setWidth] = useState(3);
  const [memberCount, setMemberCount] = useState(0);
  const [showShare, setShowShare] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const sharedState = useMemo(() => group.sharedState('whiteboard'), [group]);
  const board = useMemo(() => bindBoard(sharedState.doc), [sharedState]);
  const cmdLog = useMemo<EventLog<BoardCommand>>(
    () => group.eventLog('board-cmds'),
    [group],
  );

  // Track memberCount roughly — peers list is updated through group.members().
  useEffect(() => {
    const interval = window.setInterval(() => {
      setMemberCount(group.members().length);
    }, 500);
    return () => clearInterval(interval);
  }, [group]);

  // ----- canvas + drawing engine ------------------------------------

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = Math.max(window.devicePixelRatio ?? 1, 1);
    const resize = () => {
      const { clientWidth, clientHeight } = container;
      canvas.width = Math.floor(clientWidth * dpr);
      canvas.height = Math.floor(clientHeight * dpr);
      canvas.style.width = `${clientWidth}px`;
      canvas.style.height = `${clientHeight}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        repaint();
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { clientWidth, clientHeight } = canvas;
    ctx.clearRect(0, 0, clientWidth, clientHeight);
    // We paint everything in the doc each repaint. With more than a few
    // hundred strokes you'd want incremental painting + offscreen
    // canvases; the showcase keeps it simple.
    for (let i = 0; i < board.strokesArray.length; i++) {
      const m = board.strokesArray.get(i);
      if (!m) continue;
      drawStroke(ctx, yMapToStroke(m));
    }
  }, [board]);

  // Re-render when the shared doc changes (remote update or local).
  useEffect(() => {
    const handler = () => repaint();
    sharedState.doc.on('update', handler);
    return () => sharedState.doc.off('update', handler);
  }, [sharedState, repaint]);

  // Handle clear commands.
  useEffect(() => {
    const off = cmdLog.onEntry((entry) => {
      if (entry.data.kind === 'clear') {
        sharedState.doc.transact(() => {
          while (board.strokesArray.length > 0) board.strokesArray.delete(0, 1);
        });
      }
    });
    return off;
  }, [cmdLog, sharedState, board]);

  // ----- pointer drawing --------------------------------------------

  const inProgress = useRef<{ map: Y.Map<unknown>; lastT: number } | null>(null);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.setPointerCapture(e.pointerId);
      const rect = canvas.getBoundingClientRect();
      const point: StrokePoint = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        t: performance.now(),
      };
      const stroke: Stroke = {
        id: crypto.randomUUID(),
        authorId: group.selfId,
        color,
        width,
        points: [point],
      };
      const map = strokeToYMap(stroke);
      sharedState.doc.transact(() => {
        board.strokesArray.push([map]);
      });
      inProgress.current = { map, lastT: point.t };
      // Predictive paint for instantaneous feel — we already mutated
      // the doc, but draw the single point immediately to avoid
      // depending on the next animation frame.
      const ctx = canvas.getContext('2d');
      if (ctx) drawDot(ctx, point, color, width);
    },
    [board, color, group, sharedState, width],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const inFlight = inProgress.current;
      if (!inFlight) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const point: StrokePoint = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        t: performance.now(),
      };
      // Throttle to ~120Hz max — pointer events fire faster than this on
      // some hardware and we'd flood the Yjs update bus.
      if (point.t - inFlight.lastT < 8) return;
      inFlight.lastT = point.t;
      sharedState.doc.transact(() => appendPoint(inFlight.map, point));
      // Predictive paint — we draw a quick segment so the local user
      // doesn't wait for the next repaint frame.
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const points = (inFlight.map.get('points') as Y.Array<StrokePoint>).toArray();
        const prev = points[points.length - 2];
        if (prev) drawSegment(ctx, prev, point, color, width);
      }
    },
    [color, sharedState, width],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    canvas?.releasePointerCapture(e.pointerId);
    inProgress.current = null;
  }, []);

  const handleClear = useCallback(() => {
    cmdLog.append({ kind: 'clear', by: group.selfId, at: Date.now() });
    sharedState.doc.transact(() => {
      while (board.strokesArray.length > 0) board.strokesArray.delete(0, 1);
    });
  }, [board, cmdLog, group, sharedState]);

  const handleExport = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whiteboard-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }, []);

  const joinUrl = useMemo(() => {
    const u = new URL(window.location.href);
    u.searchParams.set('j', group.joinCode);
    return u.toString();
  }, [group.joinCode]);

  const qrSvg = useMemo(() => renderQrSvg(joinUrl, { size: 192 }), [joinUrl]);

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <header style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        padding: '10px 14px',
        borderBottom: '1px solid #2A2520',
        background: '#1B1813',
      }}>
        <strong style={{ marginRight: 8 }}>Whiteboard</strong>
        <button onClick={() => setShowShare((v) => !v)} style={chipStyle}>
          {group.joinCode}
        </button>
        <span style={{ color: '#9C9385', fontSize: 13 }}>
          {memberCount + 1} {memberCount === 0 ? 'device' : 'devices'}
        </span>
        <span style={{ flex: 1 }} />
        {PALETTE.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            aria-label={`color ${c}`}
            style={{
              width: 22, height: 22, borderRadius: '50%',
              border: c === color ? '2px solid #FAF7EF' : '2px solid transparent',
              background: c,
              padding: 0,
            }}
          />
        ))}
        <input
          type="range"
          min={1}
          max={20}
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
          style={{ width: 80 }}
        />
        <button onClick={handleClear} style={ghostBtnStyle}>Clear</button>
        <button onClick={handleExport} style={ghostBtnStyle}>Export</button>
        <button onClick={props.onLeave} style={ghostBtnStyle}>Leave</button>
      </header>
      <div ref={containerRef} style={{ flex: 1, position: 'relative', background: '#FAF7EF' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '100%', touchAction: 'none', display: 'block', cursor: 'crosshair' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        {showShare ? (
          <SharePanel
            joinCode={group.joinCode}
            joinUrl={joinUrl}
            qrSvg={qrSvg}
            onClose={() => setShowShare(false)}
          />
        ) : null}
      </div>
    </div>
  );
}

function SharePanel(props: {
  joinCode: string;
  joinUrl: string;
  qrSvg: string;
  onClose: () => void;
}) {
  return (
    <div style={{
      position: 'absolute',
      top: 16,
      left: 16,
      background: '#FFFFFF',
      color: '#14120F',
      borderRadius: 12,
      padding: 16,
      boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
      maxWidth: 240,
    }}>
      <p style={{ margin: '0 0 10px', fontWeight: 600 }}>Invite a friend</p>
      <div
        // QR comes from a trusted in-process renderer.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: props.qrSvg }}
      />
      <p style={{ margin: '8px 0 0', fontSize: 13 }}>
        Or share the code: <strong>{props.joinCode}</strong>
      </p>
      <button onClick={props.onClose} style={{ ...ghostBtnStyle, color: '#14120F', borderColor: '#14120F', marginTop: 12 }}>
        Close
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  if (stroke.points.length === 0) return;
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  if (stroke.points.length === 1) {
    drawDot(ctx, stroke.points[0]!, stroke.color, stroke.width);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(stroke.points[0]!.x, stroke.points[0]!.y);
  for (let i = 1; i < stroke.points.length; i++) {
    const p = stroke.points[i]!;
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

function drawSegment(
  ctx: CanvasRenderingContext2D,
  a: StrokePoint,
  b: StrokePoint,
  color: string,
  width: number,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function drawDot(
  ctx: CanvasRenderingContext2D,
  p: StrokePoint,
  color: string,
  width: number,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, width / 2, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------------
// Inline styles — keep the showcase dependency-free.
// ---------------------------------------------------------------------

const primaryBtnStyle: React.CSSProperties = {
  width: '100%',
  height: 48,
  borderRadius: 999,
  background: '#E8603C',
  border: 'none',
  color: '#14120F',
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryBtnStyle: React.CSSProperties = {
  height: 48,
  padding: '0 18px',
  borderRadius: 999,
  border: '1px solid #FAF7EF',
  background: 'transparent',
  color: '#FAF7EF',
  cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  height: 48,
  padding: '0 14px',
  borderRadius: 999,
  border: '1px solid #FAF7EF',
  background: 'transparent',
  color: '#FAF7EF',
  fontSize: 16,
  letterSpacing: '0.16em',
};

const chipStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 999,
  border: '1px solid #FAF7EF',
  background: 'transparent',
  color: '#FAF7EF',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 13,
  cursor: 'pointer',
};

const ghostBtnStyle: React.CSSProperties = {
  height: 32,
  padding: '0 12px',
  borderRadius: 999,
  border: '1px solid #FAF7EF',
  background: 'transparent',
  color: '#FAF7EF',
  fontSize: 13,
  cursor: 'pointer',
};
