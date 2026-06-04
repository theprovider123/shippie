/**
 * @shippie/observations — typed cross-tool observation vocabulary.
 *
 * **Important architectural note:** this package is a TYPED WRAPPER over
 * the existing iframe-sdk `intent.broadcast` / `intent.subscribe`
 * bridge. It does NOT introduce a parallel permission system, and it
 * does NOT bypass the bridge gate. Each observation kind is just an
 * intent name; the platform's existing intents-permission modal handles
 * grant/revoke; the bridge gate rejects emit/subscribe calls if the
 * caller hasn't declared the matching intent in its
 * `shippie.json#intents.provides` / `.consumes`.
 *
 * If you add an observation kind here, **also**:
 *   1. Update each emitting app's `shippie.json#intents.provides` to
 *      include the new kind name.
 *   2. Update each subscribing app's `shippie.json#intents.consumes`
 *      to include the new kind name.
 *
 * The kind names follow `domain.event` form (e.g. `mood.color_picked`).
 * Choose names so they read naturally in the user-facing permission
 * prompt: "Randomiser wants to read mood.color_picked from Colour of
 * the Day."
 */

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export type Sentiment = -1 | 0 | 1;

export interface MoodColorPicked {
  kind: 'mood.color_picked';
  color: string;     // CSS-readable, e.g. '#F4B860' or 'oklch(0.7 0.15 70)'
  sentiment: Sentiment;
  at: string;        // ISO 8601
}

export interface PhotoLabelled {
  kind: 'photo.labelled';
  labels: string[];  // AI-generated labels; never the photo bytes
  at: string;
}

export interface CounterTapped {
  kind: 'counter.tapped';
  label: string;     // user-chosen counter label, e.g. 'coffee'
  count: number;     // total count after this tap (not delta)
  at: string;
}

export interface RecipeCooked {
  kind: 'recipe.cooked';
  recipe_id?: string;
  title: string;
  at: string;
}

export interface GameCompleted {
  kind: 'game.completed';
  game: string;      // game slug, e.g. 'sudoku', 'daily-puzzle'
  result: number | string;  // numeric score, time-ms, or short string
  /**
   * Versioned daily id (`<game>-YYYY-MM-DD-rN-cN`) for daily plays, from
   * `@shippie/arcade-kit`. Present only when the completion was a daily; the
   * platform's cross-game daily-streak aggregator (/today) keys off this.
   */
  puzzleId?: string;
  at: string;
}

export interface PreferenceChoice {
  kind: 'preference.choice';
  question_id: string;       // versioned, e.g. 'wyr-2026-05-09-v1'
  choice: 'a' | 'b';
  at: string;
}

export interface VoiceRecorded {
  kind: 'voice.recorded';
  duration_seconds: number;  // audio length only — never transcript or audio bytes
  at: string;
}

/**
 * Coarse geo defaults to off. `geo_exact` requires a separate per-app
 * permission grant gated through the platform; the SDK helper refuses
 * to emit `geo_exact` unless that grant is present (see emit() below).
 */
export interface PlaceSnapped {
  kind: 'place.snapped';
  labels: string[];
  geo_coarse?: 'city' | 'region' | 'country';
  geo_exact?: [number, number];  // [lat, lng] — guarded; do not set unless granted
  at: string;
}

/**
 * Daily/seeded puzzle clear. Used by Five Letter, Lustre, etc. — any
 * arcade game with a deterministic-from-date or seeded puzzle. The
 * `puzzle_id` field is the same versioned-bank id baked into the
 * game's persisted attempts, so a Randomiser pick can deep-link back
 * to the exact puzzle.
 */
export interface PuzzleCleared {
  kind: 'puzzle.cleared';
  game: string;          // game slug, e.g. 'five-letter', 'lustre'
  puzzle_id: string;     // versioned id, e.g. 'fl-2026-05-10-en-v1'
  result: number | string;
  at: string;
}

/**
 * Tower-defence wave clear. Bulwark emits one of these per wave so
 * Randomiser can surface "your last big defence". Wave-level grain
 * (rather than once-per-game) lets a long campaign show progress.
 */
export interface WaveCleared {
  kind: 'wave.cleared';
  game: string;          // 'bulwark'
  wave: number;
  at: string;
}

export type Observation =
  | MoodColorPicked
  | PhotoLabelled
  | CounterTapped
  | RecipeCooked
  | GameCompleted
  | PreferenceChoice
  | VoiceRecorded
  | PlaceSnapped
  | PuzzleCleared
  | WaveCleared;

export type ObservationKind = Observation['kind'];

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * Minimal SDK contract. We don't import `@shippie/iframe-sdk` directly
 * to keep the package zero-runtime-dependency — the consumer passes
 * the SDK instance in. Matches the surface
 * `createShippieIframeSdk` returns.
 */
export interface ObservationSdkLike {
  intent: {
    broadcast(intent: string, rows: ReadonlyArray<unknown>): void;
    subscribe(
      intent: string,
      handler: (broadcast: { intent: string; rows: ReadonlyArray<unknown> }) => void,
    ): () => void;
  };
}

export interface EmitOptions {
  /**
   * If `true`, allow `place.snapped.geo_exact` to be sent. The SDK
   * helper refuses to forward exact coordinates unless this flag is
   * set, ensuring callers think twice. Apps using exact coords must
   * also have an explicit per-app permission grant from the user;
   * this flag does NOT replace that grant — the bridge enforces it.
   */
  exactGeoGranted?: boolean;
}

export interface ObservationClient {
  /**
   * Emit an observation. The kind name is the intent name; the row is
   * the observation payload. The bridge accepts the call only if this
   * app's `shippie.json#intents.provides` includes the kind.
   *
   * Refuses to emit `place.snapped.geo_exact` unless
   * `opts.exactGeoGranted === true`. Defaults coarse-only.
   */
  emit<O extends Observation>(observation: O, opts?: EmitOptions): void;

  /**
   * Subscribe to a kind. The handler fires for every broadcast of that
   * kind from any app whose grant the user has accepted. Returns an
   * unsubscribe function. Bridge gates the subscription on this app's
   * `shippie.json#intents.consumes` declaration AND the user's grant.
   *
   * Note on initial-snapshot semantics: the iframe-sdk's
   * `intent.subscribe` is broadcast-only; there is no replay of
   * historical rows. If you need historical state, the producing app
   * must re-broadcast on subscriber-join (e.g. via a separate
   * `<kind>.snapshot_request` intent) — that pattern is per-app, not
   * library-level.
   */
  subscribe<K extends ObservationKind>(
    kind: K,
    handler: (rows: ReadonlyArray<Extract<Observation, { kind: K }>>) => void,
  ): () => void;
}

/**
 * Construct an observation client over the iframe-sdk. Called per-app
 * after `createShippieIframeSdk(...)`.
 *
 * Example:
 * ```ts
 * import { createShippieIframeSdk } from '@shippie/iframe-sdk';
 * import { createObservationClient } from '@shippie/observations';
 *
 * const sdk = createShippieIframeSdk({ appId: 'app_colour_of_day' });
 * const obs = createObservationClient(sdk);
 *
 * // emit
 * obs.emit({ kind: 'mood.color_picked', color: '#F4B860', sentiment: 1, at: new Date().toISOString() });
 *
 * // subscribe (Randomiser, Today, etc.)
 * const unsub = obs.subscribe('mood.color_picked', (rows) => { ... });
 * ```
 */
export function createObservationClient(sdk: ObservationSdkLike): ObservationClient {
  return {
    emit(observation, opts) {
      // Refuse exact coords unless the caller explicitly opts in. This
      // catches the common mistake of forwarding GeolocationCoordinates
      // straight into the payload without considering whether the user
      // granted exact-location.
      if (
        observation.kind === 'place.snapped' &&
        observation.geo_exact !== undefined &&
        opts?.exactGeoGranted !== true
      ) {
        throw new Error(
          'observations: place.snapped.geo_exact requires opts.exactGeoGranted=true. ' +
            'Default to geo_coarse unless the user has granted exact location.',
        );
      }
      sdk.intent.broadcast(observation.kind, [observation]);
    },

    subscribe(kind, handler) {
      return sdk.intent.subscribe(kind, (broadcast) => {
        // Filter: only forward rows that match the kind we subscribed
        // to. Defends against a misbehaving provider broadcasting the
        // wrong shape under the right intent name.
        const rows = (broadcast.rows ?? []).filter(
          (row): row is Extract<Observation, { kind: typeof kind }> =>
            typeof row === 'object' && row !== null && (row as { kind?: unknown }).kind === kind,
        );
        if (rows.length > 0) handler(rows);
      });
    },
  };
}
