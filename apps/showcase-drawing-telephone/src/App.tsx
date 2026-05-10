import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createGroup, joinGroup, EventLog, type Group } from '@shippie/proximity';
import { renderQrSvg } from '@shippie/sdk/wrapper';
import { createShippieIframeSdk } from '@shippie/iframe-sdk';
import { createObservationClient } from '@shippie/observations';
import { Sketchpad } from './Sketchpad';
import { strokesToDataUrl, type SketchStroke } from './sketch';

/**
 * Drawing Telephone — Pictionary × Chinese Whispers.
 *
 * Flow: lobby → host taps Start → seed prompt is text → first player
 * sees prompt, draws → next sees only the drawing, types a caption →
 * next sees only the caption, draws → continues until "Reveal" is
 * tapped, which surfaces the entire chain.
 *
 * All state lives in the proximity eventLog so every device sees the
 * same chain. Drawings are 256×256 JPEG data URLs (~30KB) to stay
 * inside event-log size budgets.
 */

const APP_SLUG = 'drawing-telephone';
const sdk = createShippieIframeSdk({ appId: 'app_drawing_telephone' });
const observations = createObservationClient(sdk);

type ChainEntry =
  | { kind: 'prompt'; text: string; author: string }
  | { kind: 'drawing'; dataUrl: string; author: string }
  | { kind: 'caption'; text: string; author: string };

type Phase = 'lobby' | 'connecting' | 'in-room';

export function App() {
  const [phase, setPhase] = useState<Phase>('lobby');
  const [group, setGroup] = useState<Group | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => { group?.leave(); }, [group]);

  const handleCreate = useCallback(async () => {
    setPhase('connecting');
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
    setPhase('connecting');
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

  useEffect(() => {
    const u = new URL(window.location.href);
    const j = u.searchParams.get('j');
    if (!j) return;
    setJoinCode(j.toUpperCase());
    void (async () => {
      setPhase('connecting');
      try {
        const g = await joinGroup({ appSlug: APP_SLUG, joinCode: j });
        setGroup(g);
        setPhase('in-room');
      } catch (err) {
        setError((err as Error).message);
        setPhase('lobby');
      }
    })();
  }, []);

  if (phase !== 'in-room' || !group) {
    return (
      <Lobby
        joinCode={joinCode}
        onJoinCodeChange={setJoinCode}
        onCreate={handleCreate}
        onJoin={handleJoin}
        busy={phase === 'connecting'}
        error={error}
      />
    );
  }

  return <Room group={group} onLeave={() => { group.leave(); setGroup(null); setPhase('lobby'); }} />;
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
    <main className="app">
      <header>
        <h1>Drawing Telephone</h1>
        <p className="muted">Pictionary meets Chinese Whispers. 2–6 players. One device each.</p>
      </header>
      <section className="lobby">
        <button type="button" className="primary big" onClick={props.onCreate} disabled={props.busy}>
          Start a new game
        </button>
        <div className="divider"><span>or</span></div>
        <div className="join-row">
          <input
            type="text"
            inputMode="text"
            placeholder="ENTER CODE"
            maxLength={8}
            value={props.joinCode}
            onChange={(e) => props.onJoinCodeChange(e.target.value.toUpperCase())}
          />
          <button type="button" className="ghost" onClick={props.onJoin} disabled={props.busy}>Join</button>
        </div>
        {props.error ? <p className="error">{props.error}</p> : null}
      </section>
    </main>
  );
}

function Room({ group, onLeave }: { group: Group; onLeave: () => void }) {
  const log = useMemo<EventLog<ChainEntry>>(() => group.eventLog('chain'), [group]);
  const [chain, setChain] = useState<ChainEntry[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [seedText, setSeedText] = useState('');
  const [captionText, setCaptionText] = useState('');
  const me = group.selfId;

  useEffect(() => {
    const off = log.onEntry(() => {
      setChain(log.all().map((e) => e.data));
    });
    setChain(log.all().map((e) => e.data));
    return off;
  }, [log]);

  useEffect(() => {
    const update = () => {
      const peers = group.members();
      setMembers([me, ...peers.filter((p) => p !== me)]);
    };
    update();
    const id = window.setInterval(update, 800);
    return () => clearInterval(id);
  }, [group, me]);

  const joinUrl = useMemo(() => {
    const u = new URL(window.location.href);
    u.searchParams.set('j', group.joinCode);
    return u.toString();
  }, [group.joinCode]);

  const qrSvg = useMemo(() => renderQrSvg(joinUrl, { size: 192 }), [joinUrl]);

  const turn = useMemo(() => {
    if (members.length === 0) return null;
    if (chain.length === 0) {
      return { author: members[0]!, expects: 'prompt' as const };
    }
    const last = chain[chain.length - 1]!;
    const lastAuthorIdx = members.indexOf(last.author);
    const nextIdx = ((lastAuthorIdx === -1 ? 0 : lastAuthorIdx) + 1) % members.length;
    const expects = last.kind === 'prompt' || last.kind === 'caption' ? 'drawing' as const : 'caption' as const;
    return { author: members[nextIdx]!, expects };
  }, [chain, members]);

  const myTurn = turn?.author === me && !revealed;

  const submitText = (text: string, kind: 'prompt' | 'caption') => {
    if (!text.trim() || !myTurn) return;
    const entry: ChainEntry = kind === 'prompt'
      ? { kind: 'prompt', text: text.trim(), author: me }
      : { kind: 'caption', text: text.trim(), author: me };
    log.append(entry);
    setSeedText('');
    setCaptionText('');
  };

  const submitDrawing = (strokes: SketchStroke[]) => {
    if (!myTurn) return;
    const dataUrl = strokesToDataUrl(strokes, 256);
    log.append({ kind: 'drawing', dataUrl, author: me });
  };

  const reveal = () => {
    setRevealed(true);
    observations.emit({
      kind: 'game.completed',
      game: 'drawing-telephone',
      result: chain.length,
      at: new Date().toISOString(),
    });
  };

  return (
    <main className="app">
      <header className="head">
        <div>
          <h1>Drawing Telephone</h1>
          <p className="muted small">Code: <strong>{group.joinCode}</strong> · {members.length} player{members.length === 1 ? '' : 's'} · {chain.length} round{chain.length === 1 ? '' : 's'}</p>
        </div>
        <button type="button" className="ghost small" onClick={onLeave}>Leave</button>
      </header>

      {!revealed && members.length < 2 ? (
        <section className="qr-wait">
          <p>Have someone scan this to join.</p>
          <div className="qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <p className="muted small">Or enter code <strong>{group.joinCode}</strong></p>
        </section>
      ) : null}

      {!revealed && members.length >= 2 && turn ? (
        myTurn ? (
          <TurnView
            expects={turn.expects}
            previous={chain[chain.length - 1] ?? null}
            seedText={seedText}
            setSeedText={setSeedText}
            captionText={captionText}
            setCaptionText={setCaptionText}
            onText={submitText}
            onDrawing={submitDrawing}
          />
        ) : (
          <WaitingView turnAuthor={turn.author} expects={turn.expects} />
        )
      ) : null}

      {chain.length >= 3 && !revealed ? (
        <section className="reveal-row">
          <button type="button" className="primary" onClick={reveal}>Reveal the chain</button>
        </section>
      ) : null}

      {revealed ? <RevealView chain={chain} /> : null}
    </main>
  );
}

function TurnView(props: {
  expects: 'prompt' | 'drawing' | 'caption';
  previous: ChainEntry | null;
  seedText: string;
  setSeedText: (s: string) => void;
  captionText: string;
  setCaptionText: (s: string) => void;
  onText: (s: string, kind: 'prompt' | 'caption') => void;
  onDrawing: (strokes: SketchStroke[]) => void;
}) {
  const { expects, previous } = props;
  if (expects === 'prompt') {
    return (
      <section className="turn">
        <p className="prompt-line">Type a thing for the next player to draw.</p>
        <input
          type="text"
          maxLength={60}
          placeholder="A goldfish in a teacup"
          value={props.seedText}
          onChange={(e) => props.setSeedText(e.target.value)}
        />
        <PromptPackPicker onPick={(s) => props.setSeedText(s)} />
        <button type="button" className="primary" onClick={() => props.onText(props.seedText, 'prompt')}>Send prompt</button>
      </section>
    );
  }
  if (expects === 'drawing') {
    const hint = previous && (previous.kind === 'prompt' || previous.kind === 'caption')
      ? `Draw: "${previous.text}"`
      : 'Draw something';
    return (
      <section className="turn">
        <Sketchpad onSubmit={props.onDrawing} hint={hint} />
      </section>
    );
  }
  const url = previous?.kind === 'drawing' ? previous.dataUrl : '';
  return (
    <section className="turn">
      <p className="prompt-line">What is this a drawing of?</p>
      {url ? <img src={url} alt="drawing to caption" className="thumb" /> : null}
      <div className="caption-row">
        <input
          type="text"
          maxLength={60}
          placeholder="Write a caption"
          value={props.captionText}
          onChange={(e) => props.setCaptionText(e.target.value)}
        />
        <VoiceCaptionButton onCapture={(s) => props.setCaptionText(s)} />
      </div>
      <button type="button" className="primary" onClick={() => props.onText(props.captionText, 'caption')}>Send caption</button>
    </section>
  );
}

const PROMPT_PACKS: Record<string, string[]> = {
  food:   ['A goldfish in a teacup', 'Spaghetti volcano', 'Cake with too many candles', 'A grumpy avocado', 'Sushi pirate', 'Donut planet'],
  movies: ['Titanic, but it floats', 'Mona Lisa with sunglasses', 'Moonwalking robot', 'Time-travelling toaster', 'Underwater cinema', 'Cowboy ninja'],
  jokes:  ['Bear in a tutu', 'Penguin lawyer', 'Octopus drum kit', 'Shark on a unicycle', 'Pigeon mafia', 'Squirrel CEO'],
};

function PromptPackPicker({ onPick }: { onPick: (s: string) => void }) {
  const [pack, setPack] = useState<keyof typeof PROMPT_PACKS>('food');
  const items = PROMPT_PACKS[pack]!;
  return (
    <div className="prompt-packs">
      <div className="pack-tabs">
        {(Object.keys(PROMPT_PACKS) as Array<keyof typeof PROMPT_PACKS>).map((p) => (
          <button key={p} type="button" className={p === pack ? 'tab active' : 'tab'} onClick={() => setPack(p)}>{p}</button>
        ))}
      </div>
      <div className="pack-items">
        {items.map((item) => (
          <button key={item} type="button" className="pack-chip" onClick={() => onPick(item)}>{item}</button>
        ))}
      </div>
    </div>
  );
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

function VoiceCaptionButton({ onCapture }: { onCapture: (s: string) => void }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  function toggle() {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return; // browser doesn't support it
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? '';
      if (transcript) onCapture(transcript);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
    recognitionRef.current = rec;
    setListening(true);
  }

  // Render only if API is available.
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  const supported = !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
  if (!supported) return null;
  return (
    <button
      type="button"
      className={`voice-btn${listening ? ' listening' : ''}`}
      onClick={toggle}
      aria-label={listening ? 'Stop listening' : 'Voice caption'}
      title={listening ? 'Listening…' : 'Voice caption'}
    >🎤</button>
  );
}

function WaitingView({ turnAuthor, expects }: { turnAuthor: string; expects: 'prompt' | 'drawing' | 'caption' }) {
  return (
    <section className="waiting">
      <p>Waiting on <strong>{turnAuthor.slice(0, 6)}…</strong> to {expects === 'drawing' ? 'draw' : expects === 'caption' ? 'caption' : 'pick a prompt'}.</p>
    </section>
  );
}

function RevealView({ chain }: { chain: ChainEntry[] }) {
  return (
    <section className="reveal">
      <h2>The chain</h2>
      <ol className="chain">
        {chain.map((entry, i) => (
          <li key={i}>
            <span className="muted small">{entry.author.slice(0, 6)}…</span>
            {entry.kind === 'drawing'
              ? <img src={entry.dataUrl} alt="" className="reveal-thumb" />
              : <p className="reveal-text">{entry.text}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
