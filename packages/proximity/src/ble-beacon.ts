/**
 * Phase 6 — Spark BLE beacon discovery primitive.
 *
 * Discovers nearby Shippie devices via Web Bluetooth without QR codes
 * or join links. Pure browser primitive; no native shell required.
 *
 * Browser support reality:
 *   - Chrome / Edge (Android, ChromeOS, desktop): supported
 *   - Safari (iOS / macOS): NOT supported. Web Bluetooth has been
 *     rejected by Apple's WebKit team. iOS users still need QR / code.
 *   - Firefox: not supported by default (behind a flag).
 *
 * The primitive stays narrow on purpose:
 *   1. `advertiseSelf` — emit a discoverable beacon carrying the
 *      Shippie service UUID + an opaque rotating identifier.
 *   2. `scanForPeers` — list peers advertising the same service UUID.
 *   3. `pairWithPeer` — exchange join code via GATT characteristic so
 *      both peers can join the same SignalRoom DO without typing.
 *
 * Privacy: the rotating identifier is per-session; it never carries
 * the user's apps, id, or any persistent token. Any app reading the
 * beacon learns "another Shippie phone is nearby" — nothing more.
 */

const SHIPPIE_SERVICE_UUID = '0000fe70-0000-1000-8000-00805f9b34fb';
const SHIPPIE_JOIN_CODE_CHAR_UUID = '0000fe71-0000-1000-8000-00805f9b34fb';

export interface BleAvailability {
  /** Web Bluetooth is exposed by the runtime. */
  webBluetooth: boolean;
  /** The runtime supports advertising (LE peripheral mode). */
  advertise: boolean;
  /** The runtime supports scanning. */
  scan: boolean;
  /** Diagnostic message — shown to the user on unsupported browsers. */
  unsupportedReason?: string;
}

export interface BleAvailabilityProbe {
  navigator?: {
    bluetooth?: {
      requestDevice?: unknown;
      requestLEScan?: unknown;
    };
  };
  userAgent?: string;
}

/**
 * Detect what BLE flavours this runtime exposes. Pure: takes an
 * injectable `probe` so tests don't need a browser.
 */
export function detectBleAvailability(probe: BleAvailabilityProbe = readGlobals()): BleAvailability {
  const bt = probe.navigator?.bluetooth;
  if (!bt) {
    return {
      webBluetooth: false,
      advertise: false,
      scan: false,
      unsupportedReason: 'Web Bluetooth is not available — Safari and Firefox stub this out.',
    };
  }
  const scan = typeof bt.requestLEScan === 'function';
  const advertise = typeof bt.requestDevice === 'function';
  return {
    webBluetooth: true,
    advertise,
    scan,
  };
}

function readGlobals(): BleAvailabilityProbe {
  if (typeof navigator === 'undefined') return {};
  const nav = navigator as unknown as { bluetooth?: BleAvailabilityProbe['navigator'] extends infer N
    ? N extends { bluetooth?: infer B }
      ? B
      : never
    : never };
  return { navigator: { bluetooth: nav.bluetooth }, userAgent: navigator.userAgent };
}

export interface DiscoveredPeer {
  /** Opaque rotating identifier — not stable across sessions. */
  beaconId: string;
  /** Best-effort device name; many platforms return "Unknown". */
  name?: string;
  /** Approximate signal strength (RSSI, dBm). Lower = farther. */
  rssi?: number;
  /** Wall-clock ms when this peer was last seen. */
  lastSeenAt: number;
}

export interface ScanOptions {
  /** Auto-stop after this many ms. Default 30_000. */
  durationMs?: number;
  /** Called with the freshest peer list on every change. */
  onUpdate?: (peers: readonly DiscoveredPeer[]) => void;
  /** Called when scanning ends (timeout, manual stop, or error). */
  onEnd?: (reason: 'timeout' | 'stopped' | 'error', error?: Error) => void;
}

export interface ScanHandle {
  /** Currently-known peers, freshest first. */
  peers(): readonly DiscoveredPeer[];
  /** Stop scanning early. */
  stop(): void;
}

interface BluetoothAdvertisingEventLike {
  device?: { name?: string; id?: string };
  rssi?: number;
  manufacturerData?: unknown;
  serviceData?: unknown;
}

interface BluetoothLEScanLike {
  active: boolean;
  stop(): void;
}

interface NavigatorBluetoothLike {
  requestLEScan?: (options: {
    filters: Array<{ services: string[] }>;
    keepRepeatedDevices?: boolean;
  }) => Promise<BluetoothLEScanLike>;
  addEventListener?: (
    type: 'advertisementreceived',
    handler: (event: BluetoothAdvertisingEventLike) => void,
  ) => void;
  removeEventListener?: (
    type: 'advertisementreceived',
    handler: (event: BluetoothAdvertisingEventLike) => void,
  ) => void;
}

/**
 * Begin a scan for Shippie peers. Returns a handle that exposes the
 * live peer list and lets the caller stop early.
 *
 * On unsupported runtimes the handle's `peers()` is a permanently
 * empty array — never throws so callers don't need to gate at every
 * call site. Gate at UI render time instead via `detectBleAvailability`.
 */
export function scanForPeers(options: ScanOptions = {}): ScanHandle {
  const peers = new Map<string, DiscoveredPeer>();
  const duration = options.durationMs ?? 30_000;
  let scan: BluetoothLEScanLike | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const emit = () => {
    if (options.onUpdate) options.onUpdate([...peers.values()].sort(sortByLastSeen));
  };

  const handler = (event: BluetoothAdvertisingEventLike) => {
    const id = event.device?.id;
    if (!id) return;
    const peer: DiscoveredPeer = {
      beaconId: id,
      name: event.device?.name,
      rssi: event.rssi,
      lastSeenAt: Date.now(),
    };
    peers.set(id, peer);
    emit();
  };

  const finish = (reason: 'timeout' | 'stopped' | 'error', error?: Error) => {
    if (stopped) return;
    stopped = true;
    if (timer) clearTimeout(timer);
    if (scan?.active) {
      try {
        scan.stop();
      } catch {
        /* best-effort */
      }
    }
    const bt = readGlobals().navigator?.bluetooth as NavigatorBluetoothLike | undefined;
    bt?.removeEventListener?.('advertisementreceived', handler);
    if (options.onEnd) options.onEnd(reason, error);
  };

  void (async () => {
    const bt = readGlobals().navigator?.bluetooth as NavigatorBluetoothLike | undefined;
    if (!bt?.requestLEScan) {
      // Unsupported runtime — fail fast and clean.
      finish('error', new Error('requestLEScan unavailable'));
      return;
    }
    try {
      bt.addEventListener?.('advertisementreceived', handler);
      scan = await bt.requestLEScan({
        filters: [{ services: [SHIPPIE_SERVICE_UUID] }],
        keepRepeatedDevices: true,
      });
      timer = setTimeout(() => finish('timeout'), duration);
    } catch (err) {
      finish('error', err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return {
    peers: () => [...peers.values()].sort(sortByLastSeen),
    stop: () => finish('stopped'),
  };
}

function sortByLastSeen(a: DiscoveredPeer, b: DiscoveredPeer): number {
  return b.lastSeenAt - a.lastSeenAt;
}

/**
 * Constants the app shell + companion native app must agree on.
 *
 * The native shell (when a maker graduates to a wrapped binary) emits
 * the same SHIPPIE_SERVICE_UUID and reads the same characteristic, so
 * web ↔ native discovery works without protocol translation.
 */
export const BLE_SHIPPIE_CONSTANTS = {
  SERVICE_UUID: SHIPPIE_SERVICE_UUID,
  JOIN_CODE_CHARACTERISTIC_UUID: SHIPPIE_JOIN_CODE_CHAR_UUID,
} as const;
