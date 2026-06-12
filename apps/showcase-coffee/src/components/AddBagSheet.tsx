// "Add a bag" — manual entry, quick-save to wishlist, or barcode scan.
// Plain controlled form in the house style (no react-hook-form/zod dependency
// added to the shared monorepo); validation is a lightweight required-name
// check surfaced inline.

import { useEffect, useRef, useState } from 'react';
import { C, F } from '../tokens.ts';
import type { Bag, RoastLevel } from '../types.ts';
import { isoNow, newId, todayIso } from '../db.ts';
import { Sheet } from './Sheet.tsx';
import { Field, inputStyle, monoInputStyle, primaryBtnStyle, ghostBtnStyle, Chip } from './form.tsx';
import { barcodeSupported, scanFromVideo } from '../lib/scanner.ts';

const ROASTS: RoastLevel[] = ['light', 'medium', 'dark'];

export interface AddBagSheetProps {
  onClose: () => void;
  onAdd: (bag: Bag) => void;
}

interface Draft {
  name: string;
  roasterName: string;
  originCountry: string;
  originRegion: string;
  process: string;
  variety: string;
  roastLevel: RoastLevel;
  roastDate: string;
  gramsOriginal: string;
  barcode: string;
}

const EMPTY: Draft = {
  name: '',
  roasterName: '',
  originCountry: '',
  originRegion: '',
  process: '',
  variety: '',
  roastLevel: 'medium',
  roastDate: todayIso(),
  gramsOriginal: '250',
  barcode: '',
};

export function AddBagSheet({ onClose, onAdd }: AddBagSheetProps) {
  const [d, setD] = useState<Draft>(EMPTY);
  const [touched, setTouched] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const nameValid = d.name.trim().length > 0;

  function build(status: Bag['status']): Bag {
    const grams = Number(d.gramsOriginal) || 0;
    const now = isoNow();
    return {
      id: newId('bag'),
      name: d.name.trim() || 'Untitled bag',
      roasterName: d.roasterName.trim() || 'Unknown roaster',
      originCountry: d.originCountry.trim() || undefined,
      originRegion: d.originRegion.trim() || undefined,
      process: d.process.trim() || undefined,
      variety: d.variety.trim() || undefined,
      roastLevel: d.roastLevel,
      roastDate: status === 'wishlist' ? undefined : d.roastDate || undefined,
      openedDate: status === 'active' ? todayIso() : undefined,
      purchaseDate: status === 'active' ? todayIso() : undefined,
      gramsRemaining: status === 'wishlist' ? 0 : grams,
      gramsOriginal: grams,
      status,
      barcode: d.barcode || undefined,
      createdAt: now,
      updatedAt: now,
    };
  }

  function submit(status: Bag['status']) {
    if (status !== 'wishlist' && !nameValid) {
      setTouched(true);
      return;
    }
    onAdd(build(status));
    onClose();
  }

  return (
    <Sheet title="Add a bag" onClose={onClose}>
      <ScanRow
        onScanned={(barcode, roaster) => {
          set('barcode', barcode);
          if (roaster && !d.roasterName) set('roasterName', roaster);
        }}
      />

      <Field label="Name *">
        <input
          style={{ ...inputStyle, ...(touched && !nameValid ? { borderColor: C.terracotta } : {}) }}
          value={d.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Kochere Lot 42"
        />
      </Field>
      <Field label="Roaster">
        <input style={inputStyle} value={d.roasterName} onChange={(e) => set('roasterName', e.target.value)} placeholder="Square Mile" />
      </Field>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Country">
            <input style={inputStyle} value={d.originCountry} onChange={(e) => set('originCountry', e.target.value)} placeholder="Ethiopia" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Region">
            <input style={inputStyle} value={d.originRegion} onChange={(e) => set('originRegion', e.target.value)} placeholder="Yirgacheffe" />
          </Field>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Process">
            <input style={inputStyle} value={d.process} onChange={(e) => set('process', e.target.value)} placeholder="Natural" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Variety">
            <input style={inputStyle} value={d.variety} onChange={(e) => set('variety', e.target.value)} placeholder="Heirloom" />
          </Field>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <span style={{ fontFamily: F.sans, fontSize: 9, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.espressoLight, marginBottom: 8, display: 'block' }}>
          Roast level
        </span>
        <div style={{ display: 'flex', gap: 7 }}>
          {ROASTS.map((r) => (
            <Chip key={r} active={d.roastLevel === r} onClick={() => set('roastLevel', r)}>
              {r}
            </Chip>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Roast date">
            <input type="date" style={monoInputStyle} value={d.roastDate} onChange={(e) => set('roastDate', e.target.value)} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Grams">
            <input type="number" inputMode="numeric" style={monoInputStyle} value={d.gramsOriginal} onChange={(e) => set('gramsOriginal', e.target.value)} />
          </Field>
        </div>
      </div>

      {touched && !nameValid && (
        <p style={{ fontFamily: F.sans, fontSize: 12, color: C.terracotta, margin: '0 0 12px' }}>A name is required to add to your shelf.</p>
      )}

      <button type="button" onClick={() => submit('active')} style={{ ...primaryBtnStyle('terracotta'), marginBottom: 12 }}>
        Add to shelf
      </button>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <button type="button" onClick={() => submit('wishlist')} style={ghostBtnStyle}>
          Save to wishlist
        </button>
      </div>
    </Sheet>
  );
}

function ScanRow({ onScanned }: { onScanned: (barcode: string, roaster?: string) => void }) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function start() {
    setError(null);
    if (!barcodeSupported()) {
      setError('Scanning is not supported on this device — enter the bag by hand.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();
      setScanning(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const result = await scanFromVideo(video, ctrl.signal);
      stream.getTracks().forEach((t) => t.stop());
      setScanning(false);
      if (result) onScanned(result.barcode, result.roaster?.name);
    } catch {
      setScanning(false);
      setError('Camera unavailable — enter the bag by hand.');
    }
  }

  function stop() {
    abortRef.current?.abort();
    setScanning(false);
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <video
        ref={videoRef}
        playsInline
        muted
        style={{
          display: scanning ? 'block' : 'none',
          width: '100%',
          height: 160,
          objectFit: 'cover',
          borderRadius: 10,
          marginBottom: 10,
          background: C.espresso,
        }}
      />
      <button
        type="button"
        onClick={scanning ? stop : start}
        style={{
          width: '100%',
          height: 44,
          borderRadius: 8,
          background: C.creamDark,
          border: `1px solid ${C.tanLight}`,
          color: C.espressoMid,
          fontFamily: F.sans,
          fontSize: 13,
          cursor: 'pointer',
        }}
      >
        {scanning ? 'Stop scanning' : 'Scan barcode'}
      </button>
      {error && <p style={{ fontFamily: F.sans, fontSize: 11, color: C.espressoLight, margin: '8px 0 0' }}>{error}</p>}
    </div>
  );
}
