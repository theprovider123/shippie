import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createShippieIframeSdk, type TextureName } from '@shippie/iframe-sdk';
import {
  COUPLE,
  GUESTS,
  INFO,
  MENUS,
  SEEDED_SONGS,
  TABLES,
  TIMELINE,
  type Diet,
  type Guest,
  type MenuOption,
  type TablePlan,
} from './wedding-data.ts';

type Screen = 'day' | 'table' | 'menu' | 'memories' | 'info';
type InfoTab = 'gettingHere' | 'accommodation' | 'contacts' | 'theDay';

interface SongRequest {
  id: string;
  song: string;
  artist: string;
  note: string;
  createdAt: string;
}

interface MemoryUpload {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
  dataUrl?: string;
}

interface AnalyticsState {
  openCount: number;
  lastOpenedAt?: string;
  tableSearches: Record<string, number>;
}

interface LocalDbRuntime {
  save?: (table: string, value: unknown) => unknown | Promise<unknown>;
}

declare global {
  interface Window {
    shippie?: {
      local?: {
        db?: LocalDbRuntime;
      };
    };
  }
}

const sdk = createShippieIframeSdk({ appId: 'app_wedding_demo' });
const ADMIN_KEY = 'charlotte-james-2026';
const SELECTED_GUEST_KEY = 'wedding-demo.guest-name';
const SONGS_KEY = 'wedding-demo.song-requests';
const MEMORIES_KEY = 'wedding-demo.memories';
const ANALYTICS_KEY = 'wedding-demo.analytics';
const DB_FALLBACK_PREFIX = 'wedding-demo.local-db.';
const IDB_NAME = 'wedding-demo';
const IDB_STORE = 'memories';
const IDB_VERSION = 1;

/**
 * Promise-wrapped IndexedDB store for uploaded memory records (including the
 * image bytes as a base64 data URL). Phone photos exceed the ~5MB localStorage
 * quota, so blobs live here instead. Every method resolves to a typed value or
 * rejects; callers fall back to in-memory/localStorage if `available` is false.
 */
const memoriesDb = {
  available: typeof indexedDB !== 'undefined',
  _db: null as IDBDatabase | null,
  _opening: null as Promise<IDBDatabase> | null,
  openDB(): Promise<IDBDatabase> {
    if (this._db) return Promise.resolve(this._db);
    if (this._opening) return this._opening;
    if (typeof indexedDB === 'undefined') {
      this.available = false;
      return Promise.reject(new Error('IndexedDB unavailable'));
    }
    this._opening = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(IDB_NAME, IDB_VERSION);
      } catch (error) {
        this.available = false;
        reject(error);
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        this._db = request.result;
        resolve(request.result);
      };
      request.onerror = () => {
        this.available = false;
        reject(request.error ?? new Error('Failed to open IndexedDB'));
      };
      request.onblocked = () => {
        reject(new Error('IndexedDB open blocked'));
      };
    });
    // Reset the in-flight promise so a failed open can be retried later.
    this._opening.catch(() => {
      this._opening = null;
    });
    return this._opening;
  },
  async putMemory(record: MemoryUpload): Promise<void> {
    const db = await this.openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB put failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB put aborted'));
    });
  },
  async getAllMemories(): Promise<MemoryUpload[]> {
    const db = await this.openDB();
    return new Promise<MemoryUpload[]>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const request = tx.objectStore(IDB_STORE).getAll();
      request.onsuccess = () => resolve((request.result as MemoryUpload[]) ?? []);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB getAll failed'));
    });
  },
  async deleteMemory(id: string): Promise<void> {
    const db = await this.openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
    });
  },
};

const INFO_TABS: Array<{ key: InfoTab; label: string }> = [
  { key: 'gettingHere', label: 'Getting Here' },
  { key: 'accommodation', label: 'Accommodation' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'theDay', label: 'The Day' },
];

function readJson<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function readArray<T>(key: string): T[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Safari private mode / quota: keep the live UI working. */
  }
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  } catch {
    /* no-op */
  }
}

function texture(name: TextureName, pattern: number | number[] = 10): void {
  vibrate(pattern);
  sdk.feel.texture(name);
}

async function saveLocalDb(table: string, value: unknown): Promise<void> {
  const runtime = window.shippie?.local?.db;
  if (runtime?.save) {
    try {
      await runtime.save(table, value);
      return;
    } catch {
      /* fall back to localStorage below */
    }
  }
  const key = `${DB_FALLBACK_PREFIX}${table}`;
  const rows = readArray<unknown>(key);
  rows.push(value);
  writeJson(key, rows);
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function fuzzyScore(guest: Guest, query: string): number {
  const q = normalizeName(query);
  const name = normalizeName(guest.name);
  if (!q) return 0;
  if (name === q) return 100;
  if (name.startsWith(q)) return 90;
  if (name.includes(q)) return 75;
  const words = name.split(' ');
  if (words.some((word) => word.startsWith(q))) return 70;
  let cursor = 0;
  for (const char of q) {
    cursor = name.indexOf(char, cursor);
    if (cursor === -1) return 0;
    cursor += 1;
  }
  return 40;
}

function guestTable(guest: Guest | null): TablePlan | null {
  if (!guest) return null;
  return TABLES.find((table) => table.number === guest.table) ?? null;
}

function isAdminRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const url = new URL(window.location.href);
  return url.pathname.endsWith('/admin') || url.searchParams.has('key');
}

function hasAdminKey(): boolean {
  if (typeof window === 'undefined') return false;
  return new URL(window.location.href).searchParams.get('key') === ADMIN_KEY;
}

export function App() {
  const [screen, setScreen] = useState<Screen>('day');
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(() => {
    const savedName = typeof localStorage !== 'undefined' ? localStorage.getItem(SELECTED_GUEST_KEY) : null;
    return GUESTS.find((guest) => guest.name === savedName) ?? null;
  });
  const [songRequests, setSongRequests] = useState<SongRequest[]>(() => readArray<SongRequest>(SONGS_KEY));
  const [memories, setMemories] = useState<MemoryUpload[]>(() => readArray<MemoryUpload>(MEMORIES_KEY));
  const [memorySaveError, setMemorySaveError] = useState(false);
  const [analytics, setAnalytics] = useState<AnalyticsState>(() =>
    readJson<AnalyticsState>(ANALYTICS_KEY, { openCount: 0, tableSearches: {} }),
  );

  // Hydrate memories from IndexedDB on mount. If a previous version left blobs
  // in localStorage, migrate them into IDB once, then stop writing blobs there.
  // Async hydration must not clobber items added before it resolves, so we merge
  // by id and keep any newly-added in-memory records.
  useEffect(() => {
    let cancelled = false;
    if (!memoriesDb.available) return;
    (async () => {
      try {
        const legacy = readArray<MemoryUpload>(MEMORIES_KEY);
        if (legacy.length) {
          for (const record of legacy) {
            try {
              await memoriesDb.putMemory(record);
            } catch {
              /* best-effort migration */
            }
          }
          // Blobs now live in IDB; drop the heavy localStorage payload.
          try {
            localStorage.removeItem(MEMORIES_KEY);
          } catch {
            /* no-op */
          }
        }
        const stored = await memoriesDb.getAllMemories();
        if (cancelled) return;
        setMemories((current) => {
          const byId = new Map<string, MemoryUpload>();
          for (const record of stored) byId.set(record.id, record);
          // Preserve any items added between mount and hydration.
          for (const record of current) if (!byId.has(record.id)) byId.set(record.id, record);
          return [...byId.values()].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
        });
      } catch {
        /* IDB unavailable/locked: keep localStorage-seeded state as fallback. */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const next = {
      ...analytics,
      openCount: analytics.openCount + 1,
      lastOpenedAt: new Date().toISOString(),
    };
    setAnalytics(next);
    writeJson(ANALYTICS_KEY, next);
    void saveLocalDb('attendance', { openedAt: next.lastOpenedAt });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  }, []);

  function navigate(next: Screen) {
    texture('navigate', 10);
    setScreen(next);
  }

  function selectGuest(guest: Guest) {
    setSelectedGuest(guest);
    try {
      localStorage.setItem(SELECTED_GUEST_KEY, guest.name);
    } catch {
      /* no-op */
    }
    const nextAnalytics = {
      ...analytics,
      tableSearches: {
        ...analytics.tableSearches,
        [String(guest.table)]: (analytics.tableSearches[String(guest.table)] ?? 0) + 1,
      },
    };
    setAnalytics(nextAnalytics);
    writeJson(ANALYTICS_KEY, nextAnalytics);
    vibrate([15, 5, 10]);
    sdk.feel.texture('confirm');
    sdk.intent.broadcast('wedding.table-searched', [
      { guestName: guest.name, table: guest.table, tableName: guest.tableName, searchedAt: new Date().toISOString() },
    ]);
    void saveLocalDb('table-search', {
      guestName: guest.name,
      table: guest.table,
      tableName: guest.tableName,
      searchedAt: new Date().toISOString(),
    });
  }

  function addSong(song: Omit<SongRequest, 'id' | 'note' | 'createdAt'>) {
    const request: SongRequest = {
      ...song,
      id: newId('song'),
      note: 'Someone requested',
      createdAt: new Date().toISOString(),
    };
    const next = [request, ...songRequests];
    setSongRequests(next);
    writeJson(SONGS_KEY, next);
    texture('confirm', 10);
    sdk.intent.broadcast('wedding.song-requested', [request]);
    void saveLocalDb('song-requests', { song: request.song, artist: request.artist, createdAt: request.createdAt });
  }

  async function addMemories(files: FileList | null) {
    if (!files?.length) return;
    const nextUploads: MemoryUpload[] = [];
    let saveFailed = false;
    let idbUsable = memoriesDb.available;
    for (const file of Array.from(files)) {
      const upload: MemoryUpload = {
        id: newId('memory'),
        name: file.name || 'wedding-memory.jpg',
        type: file.type || 'image/jpeg',
        size: file.size,
        uploadedAt: new Date().toISOString(),
      };
      try {
        upload.dataUrl = await fileToDataUrl(file);
      } catch {
        /* metadata-only fallback */
      }
      // Persist the image bytes to IndexedDB (not localStorage — phone photos
      // blow past the ~5MB quota). Surface failures rather than swallowing them.
      if (idbUsable) {
        try {
          await memoriesDb.putMemory(upload);
        } catch {
          idbUsable = false;
          saveFailed = true;
        }
      }
      nextUploads.push(upload);
      void saveLocalDb('memories', {
        filename: upload.name,
        mimeType: upload.type,
        bytes: upload.size,
        uploadedAt: upload.uploadedAt,
      });
    }
    setMemories((current) => [...nextUploads, ...current]);
    setMemorySaveError(saveFailed);
    // Fallback only: if IDB is unavailable, keep the previous localStorage
    // behavior so the album still survives reload on older/locked browsers.
    if (!memoriesDb.available) {
      writeJson(MEMORIES_KEY, [...nextUploads, ...memories]);
    }
    vibrate(25);
    sdk.feel.texture('complete');
    sdk.intent.broadcast(
      'wedding.memory-uploaded',
      nextUploads.map((upload) => ({
        filename: upload.name,
        mimeType: upload.type,
        bytes: upload.size,
        uploadedAt: upload.uploadedAt,
      })),
    );
  }

  const admin = isAdminRoute();
  if (admin) {
    return (
      <AdminView
        allowed={hasAdminKey()}
        analytics={analytics}
        memories={memories}
        songRequests={songRequests}
      />
    );
  }

  return (
    <main className="wedding-app">
      <section className="app-view" aria-live="polite">
        {screen === 'day' ? <DayScreen /> : null}
        {screen === 'table' ? <TableScreen selectedGuest={selectedGuest} onSelectGuest={selectGuest} /> : null}
        {screen === 'menu' ? <MenuScreen selectedGuest={selectedGuest} /> : null}
        {screen === 'memories' ? (
          <MemoriesScreen memories={memories} onAddMemories={addMemories} saveError={memorySaveError} />
        ) : null}
        {screen === 'info' ? <InfoScreen onAddSong={addSong} songRequests={songRequests} /> : null}
      </section>
      <BottomNav screen={screen} onNavigate={navigate} />
    </main>
  );
}

function DayScreen() {
  const timelineRef = useRef<HTMLElement | null>(null);
  const state = useMemo(() => weddingDayState(), []);

  function enterDay() {
    texture('navigate', 10);
    timelineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="day-flow">
      <section className="cover screen-pad">
        <Botanical />
        <div className="cover-main">
          <CoupleName />
          <Flourish />
          <p className="cover-date">
            {COUPLE.date} <span aria-hidden="true">&middot;</span> {COUPLE.venue}
          </p>
          <p className="cover-welcome">{COUPLE.welcome}</p>
        </div>
        <button type="button" className="cover-cue" onClick={enterDay} aria-label="Go to the day timeline">
          <span />
        </button>
      </section>

      <section className="day screen-pad" ref={timelineRef}>
        <header className="section-head sticky-head">
          <p className="label">{COUPLE.date}</p>
          <h2>The Day</h2>
          <span className="rule" />
        </header>
        <div className="timeline" aria-label="Wedding day timeline">
          {TIMELINE.map((item, index) => {
            const current = state.currentIndex === index;
            const past = state.pastIndexes.has(index);
            return (
              <article
                key={`${item.time}-${item.title}`}
                className={`timeline-row ${past ? 'is-past' : ''} ${current ? 'is-current' : ''}`}
              >
                <div className="timeline-rail" aria-hidden="true">
                  <span />
                </div>
                <div className="timeline-body">
                  <p className="timeline-time">{item.time}</p>
                  <h3>{item.title}</h3>
                  <p className="muted">{item.place}</p>
                  {item.note ? <p className="script-note">{item.note}</p> : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function TableScreen({ selectedGuest, onSelectGuest }: { selectedGuest: Guest | null; onSelectGuest: (guest: Guest) => void }) {
  const [query, setQuery] = useState('');
  const resultTable = guestTable(selectedGuest);
  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return GUESTS.map((guest) => ({ guest, score: fuzzyScore(guest, q) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.guest.name.localeCompare(b.guest.name))
      .slice(0, 6)
      .map((entry) => entry.guest);
  }, [query]);

  return (
    <section className="screen-pad table-screen">
      <header className="section-head">
        <h2>My Table</h2>
        <span className="rule" />
      </header>

      <label className="search-line">
        <Icon name="search" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Your name..."
          autoComplete="name"
          aria-label="Search for your name"
        />
      </label>

      {query.trim() ? (
        <div className="search-results">
          {results.length ? (
            results.map((guest) => (
              <button
                type="button"
                key={guest.name}
                className="search-result"
                onClick={() => {
                  onSelectGuest(guest);
                  setQuery('');
                }}
              >
                <span>{guest.name}</span>
                <small>Table {guest.table}</small>
              </button>
            ))
          ) : (
            <p className="empty-copy">Name not found - ask your usher</p>
          )}
        </div>
      ) : null}

      {selectedGuest && resultTable ? (
        <div className="table-result">
          <p className="label">You are at</p>
          <h3>Table {selectedGuest.table}</h3>
          <p className="table-name">{resultTable.name}</p>
          <Flourish />
          <FloorPlan active={selectedGuest.table} />
          <p className="table-note">{resultTable.note}</p>
          <p className="label tablemates-label">Also at your table</p>
          <ul className="tablemates">
            {resultTable.seats.map((seat) => (
              <li key={seat} className={seat === selectedGuest.name ? 'is-you' : undefined}>
                {seat}
                {seat === selectedGuest.name ? <span>you</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="table-empty">
          <Flourish />
          <p>Begin with your name and your table will appear here.</p>
        </div>
      )}
    </section>
  );
}

function MenuScreen({ selectedGuest }: { selectedGuest: Guest | null }) {
  const [open, setOpen] = useState(false);
  const menu = MENUS.standard;
  const guestDiet = selectedGuest?.diet ?? 'standard';
  const otherMenus = (Object.keys(MENUS) as Diet[]).filter((key) => key !== menu.key);

  return (
    <section className="screen-pad menu-screen">
      <header className="section-head">
        <h2>Our Menu</h2>
        <p className="intro">Your menu has been noted. Enjoy.</p>
        <span className="rule" />
      </header>

      <MenuCard menu={menu} />
      <p className="wine-note">{menu.wine}</p>
      {selectedGuest ? (
        <p className="guest-menu-note">
          We have {MENUS[guestDiet].label.toLowerCase()} noted for {selectedGuest.name.replace(/\s*\([^)]*\)/, '')}.
        </p>
      ) : null}

      <button
        type="button"
        className={`text-toggle ${open ? 'is-open' : ''}`}
        onClick={() => {
          texture('toggle', 10);
          setOpen((value) => !value);
        }}
      >
        View other menus
        <Icon name="chevron" />
      </button>

      {open ? (
        <div className="other-menus">
          {otherMenus.map((key) => (
            <section key={key} className="other-menu">
              <h3>{MENUS[key].label}</h3>
              <MenuCard menu={MENUS[key]} />
              <p className="wine-note">{MENUS[key].wine}</p>
            </section>
          ))}
        </div>
      ) : null}

      <p className="footer-note">Dietary requirements? Speak to your server.</p>
    </section>
  );
}

function MenuCard({ menu }: { menu: MenuOption }) {
  return (
    <div className="menu-card">
      {menu.courses.map((course) => (
        <section className="course" key={course.course}>
          <p className="label">{course.course}</p>
          <h3>{course.text}</h3>
          <p className="allergens">Allergens: {course.allergens}</p>
        </section>
      ))}
    </div>
  );
}

function MemoriesScreen({
  memories,
  onAddMemories,
  saveError,
}: {
  memories: MemoryUpload[];
  onAddMemories: (files: FileList | null) => void;
  saveError: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const count = 47 + memories.length;

  return (
    <section className="screen-pad memories-screen">
      <header className="section-head">
        <h2>Add to Charlotte & James's album</h2>
        <span className="rule" />
      </header>

      <button type="button" className="upload-area" onClick={() => inputRef.current?.click()}>
        <Icon name="camera" />
        <span>Take a photo or choose from your library</span>
      </button>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={(event) => {
          void onAddMemories(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />

      {saveError ? (
        <p className="memory-error" role="alert">
          We couldn't save your last photo on this device. Please try again.
        </p>
      ) : null}

      <p className="memory-count">{count} memories shared so far</p>
      <p className="privacy-note">Only Charlotte and James can download the full album.</p>
    </section>
  );
}

function InfoScreen({ onAddSong, songRequests }: { onAddSong: (song: { song: string; artist: string }) => void; songRequests: SongRequest[] }) {
  const [tab, setTab] = useState<InfoTab>('gettingHere');

  return (
    <section className="screen-pad info-screen">
      <header className="section-head">
        <h2>Good to Know</h2>
        <span className="rule" />
      </header>
      <div className="info-tabs" role="tablist" aria-label="Wedding information">
        {INFO_TABS.map((item) => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            key={item.key}
            className={tab === item.key ? 'is-active' : undefined}
            onClick={() => {
              texture('toggle', 10);
              setTab(item.key);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <dl className="info-list">
        {INFO[tab].map(([term, detail]) => (
          <div className="info-row" key={term}>
            <dt>{term}</dt>
            <dd>{detail}</dd>
          </div>
        ))}
      </dl>
      <SongRequestForm onAddSong={onAddSong} songRequests={songRequests} />
    </section>
  );
}

function SongRequestForm({ onAddSong, songRequests }: { onAddSong: (song: { song: string; artist: string }) => void; songRequests: SongRequest[] }) {
  const [song, setSong] = useState('');
  const [artist, setArtist] = useState('');
  const allSongs = [...songRequests, ...SEEDED_SONGS];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanSong = song.trim();
    if (!cleanSong) return;
    onAddSong({ song: cleanSong, artist: artist.trim() });
    setSong('');
    setArtist('');
  }

  return (
    <section className="song-panel">
      <header>
        <p className="label">Song requests</p>
        <h3>One for the dance floor</h3>
      </header>
      <form onSubmit={submit} className="song-form">
        <input value={song} onChange={(event) => setSong(event.target.value)} placeholder="Suggest a song..." aria-label="Song title" />
        <input value={artist} onChange={(event) => setArtist(event.target.value)} placeholder="Artist..." aria-label="Artist" />
        <button type="submit">Request it</button>
      </form>
      <ul className="song-list">
        {allSongs.slice(0, 7).map((request) => (
          <li key={request.id}>
            <span>{request.song}</span>
            <small>
              {request.artist ? `${request.artist} - ` : ''}
              {request.note}
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AdminView({
  allowed,
  analytics,
  memories,
  songRequests,
}: {
  allowed: boolean;
  analytics: AnalyticsState;
  memories: MemoryUpload[];
  songRequests: SongRequest[];
}) {
  if (!allowed) {
    return (
      <main className="admin admin-locked">
        <Botanical />
        <h1>Wedding Guide Admin</h1>
        <p>Use the secure demo link to open this view.</p>
      </main>
    );
  }

  const allSongs = [...songRequests, ...SEEDED_SONGS];
  const sortedTables = Object.entries(analytics.tableSearches).sort((a, b) => b[1] - a[1]);

  return (
    <main className="admin">
      <header className="admin-head">
        <p className="label">Charlotte & James</p>
        <h1>Admin View</h1>
        <p>Guest activity, table searches, song requests, and memory downloads.</p>
      </header>
      <section className="admin-metrics">
        <Metric label="Guest opens" value={analytics.openCount} />
        <Metric label="Table searches" value={Object.values(analytics.tableSearches).reduce((sum, count) => sum + count, 0)} />
        <Metric label="Song requests" value={allSongs.length} />
        <Metric label="Memories" value={47 + memories.length} />
      </section>
      <section className="admin-section">
        <div className="admin-section-head">
          <h2>Uploaded Memories</h2>
          <button type="button" onClick={() => void downloadMemories(memories)}>
            Download zip
          </button>
        </div>
        <ul className="admin-list">
          {(memories.length ? memories : [{ id: 'seed-memory', name: '47 seeded memories in sealed cloud', size: 0, type: 'demo', uploadedAt: '' }]).map(
            (memory) => (
              <li key={memory.id}>
                <span>{memory.name}</span>
                <small>{memory.size ? `${Math.round(memory.size / 1024)} KB` : 'ready for client demo'}</small>
              </li>
            ),
          )}
        </ul>
      </section>
      <section className="admin-section">
        <h2>Song Requests</h2>
        <ul className="admin-list">
          {allSongs.map((request) => (
            <li key={request.id}>
              <span>{request.song}</span>
              <small>{request.artist || 'Artist not supplied'}</small>
            </li>
          ))}
        </ul>
      </section>
      <section className="admin-section">
        <h2>Table Search Analytics</h2>
        <ul className="admin-list">
          {(sortedTables.length ? sortedTables : [['6', 1]]).map(([table, count]) => (
            <li key={table}>
              <span>Table {table}</span>
              <small>{count} search{count === 1 ? '' : 'es'}</small>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function BottomNav({ screen, onNavigate }: { screen: Screen; onNavigate: (screen: Screen) => void }) {
  const items: Array<{ key: Screen; icon: IconName; label: string }> = [
    { key: 'day', icon: 'today', label: 'The Day' },
    { key: 'table', icon: 'table', label: 'My Table' },
    { key: 'menu', icon: 'menu', label: 'Our Menu' },
    { key: 'memories', icon: 'camera', label: 'Memories' },
    { key: 'info', icon: 'info', label: 'Information' },
  ];
  return (
    <nav className="bottom-nav" aria-label="Wedding guide">
      {items.map((item) => (
        <button
          type="button"
          key={item.key}
          className={screen === item.key ? 'is-active' : undefined}
          onClick={() => onNavigate(item.key)}
          aria-label={item.label}
          title={item.label}
        >
          <Icon name={item.icon} />
          <span />
        </button>
      ))}
    </nav>
  );
}

function CoupleName() {
  return (
    <h1 className="couple-name">
      <span>Charlotte</span>
      <em>&amp;</em>
      <span>James</span>
    </h1>
  );
}

function Botanical() {
  return (
    <svg className="botanical" viewBox="0 0 150 96" aria-hidden="true">
      <path d="M75 92 Q71 50 75 8" />
      {[0.16, 0.3, 0.44, 0.58, 0.72].map((t, index) => {
        const left = index % 2 === 0;
        const x = 75 + Math.sin((1 - t) * Math.PI) * -3;
        const y = 92 - t * 84;
        const lx = x + (left ? -11 : 11);
        const ly = y - 7;
        return (
          <g key={t}>
            <ellipse cx={lx} cy={ly} rx="6.4" ry="9.2" transform={`rotate(${left ? -42 : 42} ${lx} ${ly})`} />
            <path d={`M${x} ${y} L${lx} ${ly + 6}`} />
          </g>
        );
      })}
      <ellipse cx="75" cy="9" rx="5.2" ry="8" />
    </svg>
  );
}

function Flourish() {
  return (
    <svg className="flourish" viewBox="0 0 200 12" aria-hidden="true">
      <line x1="6" y1="6" x2="80" y2="6" />
      <line x1="120" y1="6" x2="194" y2="6" />
      <rect x="95.5" y="1.5" width="9" height="9" transform="rotate(45 100 6)" />
    </svg>
  );
}

function FloorPlan({ active }: { active: number }) {
  return (
    <div className="floor-plan" aria-label={`Floor plan showing table ${active}`}>
      <p className="label">Top table</p>
      <div className="floor-grid">
        {TABLES.map((table) => (
          <span key={table.number} className={table.number === active ? 'is-active' : undefined}>
            {table.number}
          </span>
        ))}
      </div>
      <p className="label floor-foot">Entrance</p>
    </div>
  );
}

type IconName = 'today' | 'table' | 'menu' | 'camera' | 'info' | 'search' | 'chevron';

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (name === 'today') {
    return (
      <svg {...common}>
        <rect x="3.5" y="5" width="17" height="15" rx="1.5" />
        <line x1="3.5" y1="9" x2="20.5" y2="9" />
        <line x1="8" y1="3" x2="8" y2="6.5" />
        <line x1="16" y1="3" x2="16" y2="6.5" />
      </svg>
    );
  }
  if (name === 'table') {
    return (
      <svg {...common}>
        <path d="M7 4v8h10V4" />
        <path d="M6 12h12l-1 4H7l-1-4z" />
        <line x1="8" y1="16" x2="8" y2="20.5" />
        <line x1="16" y1="16" x2="16" y2="20.5" />
      </svg>
    );
  }
  if (name === 'menu') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="7.5" />
        <circle cx="12" cy="12" r="3.4" />
      </svg>
    );
  }
  if (name === 'camera') {
    return (
      <svg {...common}>
        <path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h2l1.2-2h5.6L16 7h3a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 18H5a1.5 1.5 0 0 1-1.5-1.5v-8z" />
        <circle cx="12" cy="12.5" r="3.4" />
      </svg>
    );
  }
  if (name === 'info') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <line x1="12" y1="11" x2="12" y2="16" />
        <circle cx="12" cy="8" r="0.4" fill="currentColor" stroke="currentColor" />
      </svg>
    );
  }
  if (name === 'search') {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="7" />
        <line x1="16" y1="16" x2="20.5" y2="20.5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function weddingDayState() {
  const now = new Date();
  const weddingDate = new Date(`${COUPLE.isoDate}T00:00:00`);
  const sameDay =
    now.getFullYear() === weddingDate.getFullYear() &&
    now.getMonth() === weddingDate.getMonth() &&
    now.getDate() === weddingDate.getDate();
  const pastIndexes = new Set<number>();
  let currentIndex: number | null = null;

  if (sameDay) {
    const minutes = now.getHours() * 60 + now.getMinutes();
    TIMELINE.forEach((item, index) => {
      const next = TIMELINE[index + 1];
      if (item.minutes < minutes) pastIndexes.add(index);
      if (minutes >= item.minutes && (!next || minutes < next.minutes)) currentIndex = index;
    });
    if (currentIndex !== null) pastIndexes.delete(currentIndex);
  } else if (now > weddingDate) {
    TIMELINE.forEach((_, index) => pastIndexes.add(index));
  }

  return { currentIndex, pastIndexes };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function downloadMemories(memories: MemoryUpload[]) {
  // Prefer the bytes straight from IndexedDB; fall back to the in-memory list
  // (which may carry localStorage-seeded records on browsers without IDB).
  let source = memories;
  if (memoriesDb.available) {
    try {
      const stored = await memoriesDb.getAllMemories();
      if (stored.length) source = stored;
    } catch {
      /* fall back to the passed-in list */
    }
  }
  const files = source
    .filter((memory) => memory.dataUrl)
    .map((memory, index) => ({
      name: safeZipName(memory.name || `memory-${index + 1}.jpg`),
      data: dataUrlToBytes(memory.dataUrl ?? ''),
    }));
  if (files.length === 0) {
    files.push({
      name: 'README.txt',
      data: new TextEncoder().encode('No local uploads in this browser yet. Seeded demo count: 47 memories.'),
    });
  }
  const blob = makeZip(files);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'charlotte-james-memories.zip';
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeZipName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'memory.jpg';
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  const payload = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function makeZip(files: Array<{ name: string; data: Uint8Array }>): Blob {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    write32(localView, 0, 0x04034b50);
    write16(localView, 4, 20);
    write16(localView, 6, 0);
    write16(localView, 8, 0);
    write16(localView, 10, 0);
    write16(localView, 12, 0);
    write32(localView, 14, crc);
    write32(localView, 18, file.data.length);
    write32(localView, 22, file.data.length);
    write16(localView, 26, nameBytes.length);
    write16(localView, 28, 0);
    local.set(nameBytes, 30);
    locals.push(local, file.data);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    write32(centralView, 0, 0x02014b50);
    write16(centralView, 4, 20);
    write16(centralView, 6, 20);
    write16(centralView, 8, 0);
    write16(centralView, 10, 0);
    write16(centralView, 12, 0);
    write16(centralView, 14, 0);
    write32(centralView, 16, crc);
    write32(centralView, 20, file.data.length);
    write32(centralView, 24, file.data.length);
    write16(centralView, 28, nameBytes.length);
    write16(centralView, 30, 0);
    write16(centralView, 32, 0);
    write16(centralView, 34, 0);
    write16(centralView, 36, 0);
    write32(centralView, 38, 0);
    write32(centralView, 42, offset);
    central.set(nameBytes, 46);
    centrals.push(central);
    offset += local.length + file.data.length;
  }

  const centralOffset = offset;
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  write32(endView, 0, 0x06054b50);
  write16(endView, 4, 0);
  write16(endView, 6, 0);
  write16(endView, 8, files.length);
  write16(endView, 10, files.length);
  write32(endView, 12, centralSize);
  write32(endView, 16, centralOffset);
  write16(endView, 20, 0);

  return new Blob([...locals, ...centrals, end].map(toBlobPart), { type: 'application/zip' });
}

function toBlobPart(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function write16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function write32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

let crcTable: Uint32Array | null = null;

function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[i] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  const table = crcTable;
  for (const byte of data) crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
