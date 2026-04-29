/**
 * P1D — Heart Rate Measurement parser + pairing flow.
 *
 * The parser exercises every flag-bit combination from the GATT
 * Heart Rate Service spec (1.0):
 *   - 8-bit BPM, no extras (the most common Polar/Wahoo broadcast)
 *   - 16-bit BPM (sport watches that go above 255)
 *   - sensor contact bits in supported / detected / not-detected forms
 *   - energy-expended (kJ) when present
 *   - RR-intervals in 1/1024s units → ms conversion
 *
 * The pairing flow runs against an in-memory fake of the Web
 * Bluetooth surface so we cover the full GATT chain without real
 * hardware.
 */
import { describe, expect, test } from 'bun:test';
import {
  pairHrm,
  parseHeartRateMeasurement,
  type HeartRateSample,
} from './ble-beacon.ts';

function bytes(...values: number[]): DataView {
  const buffer = new ArrayBuffer(values.length);
  const view = new DataView(buffer);
  for (let i = 0; i < values.length; i++) view.setUint8(i, values[i]!);
  return view;
}

describe('parseHeartRateMeasurement — 8-bit BPM (the common case)', () => {
  test('flags=0 with bpm=72 returns the bare reading', () => {
    const v = bytes(0b0000_0000, 72);
    expect(parseHeartRateMeasurement(v)).toEqual({
      bpm: 72,
      rrIntervalsMs: [],
      contact: 'unsupported',
    });
  });

  test('contact "no contact" is detected when bit1 supported and bit2 cleared', () => {
    const v = bytes(0b0000_0010, 0);
    const sample = parseHeartRateMeasurement(v);
    expect(sample.contact).toBe('no_contact');
    expect(sample.bpm).toBe(0);
  });

  test('contact "in contact" is detected when both bits are set', () => {
    const v = bytes(0b0000_0110, 65);
    expect(parseHeartRateMeasurement(v).contact).toBe('in_contact');
  });
});

describe('parseHeartRateMeasurement — 16-bit BPM', () => {
  test('flags bit0 set reads bpm as little-endian uint16', () => {
    const v = bytes(0b0000_0001, 0x2c, 0x01); // 0x012c = 300 bpm
    expect(parseHeartRateMeasurement(v).bpm).toBe(300);
  });
});

describe('parseHeartRateMeasurement — energy expended', () => {
  test('reads kJ from bytes following the BPM', () => {
    // flags = energy bit | nothing else; bpm = 88; energy = 0x0190 = 400 kJ
    const v = bytes(0b0000_1000, 88, 0x90, 0x01);
    const sample = parseHeartRateMeasurement(v);
    expect(sample.energyKj).toBe(400);
    expect(sample.bpm).toBe(88);
  });
});

describe('parseHeartRateMeasurement — RR intervals', () => {
  test('converts uint16 ticks (1/1024s) to ms', () => {
    // flags = RR bit; bpm = 60; one RR = 0x0400 = 1024 ticks ⇒ exactly 1000 ms
    const v = bytes(0b0001_0000, 60, 0x00, 0x04);
    expect(parseHeartRateMeasurement(v).rrIntervalsMs).toEqual([1000]);
  });

  test('handles multiple RR intervals in a single broadcast', () => {
    // flags = RR; bpm = 75; RR ticks 819 (≈800 ms), 870 (≈850 ms), 922 (≈900 ms)
    const v = bytes(
      0b0001_0000,
      75,
      0x33, 0x03, // 0x0333 = 819 → 799.8 → 800 ms
      0x66, 0x03, // 0x0366 = 870 → 849.6 → 850 ms
      0x9a, 0x03, // 0x039a = 922 → 900.4 → 900 ms
    );
    expect(parseHeartRateMeasurement(v).rrIntervalsMs).toEqual([800, 850, 900]);
  });

  test('combines energy + RR when both flags are present', () => {
    // flags = energy | RR; bpm = 70; energy = 0x0064 = 100 kJ; one RR = 1024 ticks
    const v = bytes(
      0b0001_1000,
      70,
      0x64, 0x00,
      0x00, 0x04,
    );
    const sample = parseHeartRateMeasurement(v);
    expect(sample).toEqual({
      bpm: 70,
      rrIntervalsMs: [1000],
      contact: 'unsupported',
      energyKj: 100,
    } satisfies HeartRateSample);
  });
});

describe('parseHeartRateMeasurement — error paths', () => {
  test('throws on a buffer too short to contain even flags + bpm', () => {
    expect(() => parseHeartRateMeasurement(bytes(0b0000_0000))).toThrow(/too short/i);
  });

  test('throws when bit0 promises 16-bit bpm but only one byte follows', () => {
    expect(() => parseHeartRateMeasurement(bytes(0b0000_0001, 60))).toThrow(/truncated/i);
  });
});

describe('pairHrm — Web Bluetooth gating + connection sequence', () => {
  test('throws an iOS-friendly message when navigator.bluetooth is missing', async () => {
    await expect(pairHrm({})).rejects.toThrow(/Chrome on Android/i);
  });

  test('connects via GATT and emits parsed samples through the stream', async () => {
    let listener: ((event: { target: { value: DataView } }) => void) | null = null;
    let notificationsStarted = false;

    const fakeChar = {
      startNotifications: async () => {
        notificationsStarted = true;
        return fakeChar;
      },
      stopNotifications: async () => fakeChar,
      addEventListener: (_t: string, h: typeof listener) => {
        listener = h;
      },
      removeEventListener: () => {
        listener = null;
      },
    };
    const fakeService = {
      getCharacteristic: async () => fakeChar,
    };
    const fakeServer = {
      getPrimaryService: async () => fakeService,
    };
    const fakeDevice = {
      name: 'Polar H10 5C2D7B22',
      gatt: {
        connect: async () => fakeServer,
        connected: true,
        disconnect: () => {
          fakeDevice.gatt.connected = false;
        },
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    const fakeBluetooth = {
      requestDevice: async () => fakeDevice,
    };

    const handle = await pairHrm({ bluetooth: fakeBluetooth });
    expect(handle.deviceName).toBe('Polar H10 5C2D7B22');

    // The reader pulls one sample, the fake characteristic emits one
    // notification carrying flags=0 + bpm=82.
    const reader = handle.samples.getReader();
    const pullPromise = reader.read();

    // Wait for startNotifications to install the listener before firing.
    await Promise.resolve();
    expect(notificationsStarted).toBe(true);
    expect(listener).not.toBeNull();
    listener!({ target: { value: bytes(0b0000_0000, 82) } });

    const result = await pullPromise;
    expect(result.done).toBe(false);
    expect(result.value?.bpm).toBe(82);

    handle.stop();
    expect(fakeDevice.gatt.connected).toBe(false);
  });
});
