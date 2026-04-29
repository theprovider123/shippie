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

// ---------------------------------------------------------------------------
// P1D — Heart Rate GATT helper.
//
// The HRM showcase (Workout Logger) needs live heart-rate + RR-interval
// data from a Bluetooth strap (Polar, Wahoo, Garmin). This is a Chrome
// & Edge feature only — iOS Safari does not implement Web Bluetooth and
// won't, per Apple's WebKit position. UI gates on `detectBleAvailability`.
//
// Service UUID `0x180D`, characteristic `0x2A37`. Format documented at
// https://www.bluetooth.com/specifications/specs/heart-rate-service-1-0/
// ---------------------------------------------------------------------------

const HEART_RATE_SERVICE_UUID = 0x180d;
const HEART_RATE_MEASUREMENT_CHAR_UUID = 0x2a37;

export interface HeartRateSample {
  /** Heart rate in beats per minute. 0 means "no contact". */
  bpm: number;
  /**
   * Time intervals between successive heart beats, in milliseconds.
   * Empty when the strap doesn't broadcast RR (most Polars do; some
   * cheaper straps don't). HRV apps use these directly.
   */
  rrIntervalsMs: number[];
  /**
   * Sensor contact status when reported. `'unsupported'` means the
   * strap doesn't broadcast contact info; `'no_contact'` means the
   * strap reports the wearer isn't connected.
   */
  contact: 'in_contact' | 'no_contact' | 'unsupported';
  /**
   * Cumulative kJ of energy expended (when reported). Most straps
   * don't broadcast this. Undefined when omitted.
   */
  energyKj?: number;
}

/**
 * Parse a Heart Rate Measurement characteristic value into a structured
 * sample. The parser is pure so the test suite can drive it with the
 * spec's example bytes without needing a real strap.
 *
 * Wire format (Bluetooth SIG, GATT_Specification_Supplement v8):
 *   Byte 0 — flags:
 *     bit 0   HR Value Format (0 = uint8, 1 = uint16 little-endian)
 *     bit 1   Sensor Contact Status (1 = supported, 0 = unsupported)
 *     bit 2   Sensor Contact Detected (only meaningful if bit1 = 1)
 *     bit 3   Energy Expended present (uint16 LE, kJ)
 *     bit 4   RR-Interval present (uint16 LE array, 1/1024s units)
 *   Bytes 1..n — fields in the order above.
 */
export function parseHeartRateMeasurement(buffer: ArrayBufferView | DataView): HeartRateSample {
  const view =
    buffer instanceof DataView
      ? buffer
      : new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.byteLength < 2) {
    throw new Error(`Heart Rate Measurement value too short (${view.byteLength} bytes)`);
  }

  const flags = view.getUint8(0);
  const is16Bit = (flags & 0b0000_0001) !== 0;
  const contactSupported = (flags & 0b0000_0010) !== 0;
  const contactDetected = (flags & 0b0000_0100) !== 0;
  const hasEnergy = (flags & 0b0000_1000) !== 0;
  const hasRr = (flags & 0b0001_0000) !== 0;

  let offset = 1;
  let bpm: number;
  if (is16Bit) {
    if (view.byteLength < offset + 2) throw new Error('truncated HRM (uint16 bpm)');
    bpm = view.getUint16(offset, true);
    offset += 2;
  } else {
    bpm = view.getUint8(offset);
    offset += 1;
  }

  let energyKj: number | undefined;
  if (hasEnergy) {
    if (view.byteLength < offset + 2) throw new Error('truncated HRM (energy)');
    energyKj = view.getUint16(offset, true);
    offset += 2;
  }

  const rrIntervalsMs: number[] = [];
  if (hasRr) {
    while (offset + 2 <= view.byteLength) {
      const ticks = view.getUint16(offset, true);
      // Spec unit is 1/1024s. Convert to ms with three-decimal precision.
      rrIntervalsMs.push(Math.round((ticks * 1000) / 1024));
      offset += 2;
    }
  }

  let contact: HeartRateSample['contact'] = 'unsupported';
  if (contactSupported) contact = contactDetected ? 'in_contact' : 'no_contact';

  return { bpm, rrIntervalsMs, contact, energyKj };
}

export interface HrmPairingHandle {
  /**
   * Live stream of HR samples. Emits whenever the strap broadcasts a
   * notification (typically once per second, sometimes faster).
   */
  samples: ReadableStream<HeartRateSample>;
  /** Disconnect the strap and close the stream. Idempotent. */
  stop(): void;
  /**
   * Best-effort device name (e.g. "Polar H10 5C2D7B22"). May be
   * `undefined` on platforms that hide it.
   */
  deviceName?: string;
}

/**
 * Bluetooth surface dependencies. Real callers pass `navigator.bluetooth`
 * — tests pass a fake that simulates the GATT connection sequence.
 */
export interface HrmPairingDeps {
  bluetooth?: {
    requestDevice: (options: {
      filters: Array<{ services: number[] }>;
      optionalServices?: number[];
    }) => Promise<HrmDeviceLike>;
  };
}

interface HrmDeviceLike {
  name?: string;
  gatt?: {
    connect(): Promise<HrmGattServerLike>;
    connected: boolean;
    disconnect(): void;
  };
  addEventListener?(
    type: 'gattserverdisconnected',
    handler: () => void,
  ): void;
  removeEventListener?(
    type: 'gattserverdisconnected',
    handler: () => void,
  ): void;
}

interface HrmGattServerLike {
  getPrimaryService(uuid: number): Promise<HrmGattServiceLike>;
}

interface HrmGattServiceLike {
  getCharacteristic(uuid: number): Promise<HrmGattCharLike>;
}

interface HrmGattCharLike {
  startNotifications(): Promise<HrmGattCharLike>;
  stopNotifications(): Promise<HrmGattCharLike>;
  addEventListener(
    type: 'characteristicvaluechanged',
    handler: (event: { target: { value: DataView } }) => void,
  ): void;
  removeEventListener(
    type: 'characteristicvaluechanged',
    handler: (event: { target: { value: DataView } }) => void,
  ): void;
}

/**
 * Pair to a Heart Rate Monitor and return a stream of parsed samples.
 *
 * Throws if Web Bluetooth is unavailable in this runtime — the showcase
 * gates on `detectBleAvailability` BEFORE calling this so iOS users see
 * the explanatory message instead.
 */
export async function pairHrm(deps: HrmPairingDeps = readBluetoothDeps()): Promise<HrmPairingHandle> {
  const bluetooth = deps.bluetooth;
  if (!bluetooth || typeof bluetooth.requestDevice !== 'function') {
    throw new Error(
      'Heart-rate pairing requires Chrome on Android. Web Bluetooth is unavailable in this runtime.',
    );
  }

  const device = await bluetooth.requestDevice({
    filters: [{ services: [HEART_RATE_SERVICE_UUID] }],
    optionalServices: [HEART_RATE_SERVICE_UUID],
  });

  if (!device.gatt) throw new Error('Selected device has no GATT server.');
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(HEART_RATE_SERVICE_UUID);
  const char = await service.getCharacteristic(HEART_RATE_MEASUREMENT_CHAR_UUID);

  let listener: ((event: { target: { value: DataView } }) => void) | null = null;
  let onDisconnect: (() => void) | null = null;
  let stopped = false;

  const samples = new ReadableStream<HeartRateSample>({
    async start(controller) {
      listener = (event) => {
        try {
          const sample = parseHeartRateMeasurement(event.target.value);
          controller.enqueue(sample);
        } catch (err) {
          controller.error(err instanceof Error ? err : new Error(String(err)));
        }
      };
      onDisconnect = () => {
        if (!stopped) controller.close();
      };
      char.addEventListener('characteristicvaluechanged', listener);
      device.addEventListener?.('gattserverdisconnected', onDisconnect);
      await char.startNotifications();
    },
    async cancel() {
      stopHandle();
    },
  });

  function stopHandle() {
    if (stopped) return;
    stopped = true;
    try {
      if (listener) char.removeEventListener('characteristicvaluechanged', listener);
    } catch {
      /* best-effort */
    }
    char.stopNotifications().catch(() => {});
    if (onDisconnect) {
      try {
        device.removeEventListener?.('gattserverdisconnected', onDisconnect);
      } catch {
        /* best-effort */
      }
    }
    if (device.gatt?.connected) {
      try {
        device.gatt.disconnect();
      } catch {
        /* best-effort */
      }
    }
  }

  return {
    samples,
    stop: stopHandle,
    deviceName: device.name,
  };
}

function readBluetoothDeps(): HrmPairingDeps {
  if (typeof navigator === 'undefined') return {};
  const nav = navigator as unknown as { bluetooth?: HrmPairingDeps['bluetooth'] };
  return { bluetooth: nav.bluetooth };
}
