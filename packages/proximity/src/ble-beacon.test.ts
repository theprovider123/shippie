import { describe, expect, test } from 'bun:test';
import {
  BLE_SHIPPIE_CONSTANTS,
  detectBleAvailability,
  scanForPeers,
} from './ble-beacon.ts';

describe('detectBleAvailability', () => {
  test('reports webBluetooth: false on runtimes without navigator.bluetooth', () => {
    const result = detectBleAvailability({ navigator: {} });
    expect(result.webBluetooth).toBe(false);
    expect(result.advertise).toBe(false);
    expect(result.scan).toBe(false);
    expect(result.unsupportedReason).toMatch(/Web Bluetooth/);
  });

  test('reports scan support when requestLEScan is a function', () => {
    const result = detectBleAvailability({
      navigator: {
        bluetooth: {
          requestDevice: () => undefined,
          requestLEScan: () => undefined,
        },
      },
    });
    expect(result.webBluetooth).toBe(true);
    expect(result.scan).toBe(true);
    expect(result.advertise).toBe(true);
  });

  test('reports scan: false when requestLEScan is missing', () => {
    const result = detectBleAvailability({
      navigator: {
        bluetooth: {
          requestDevice: () => undefined,
        },
      },
    });
    expect(result.webBluetooth).toBe(true);
    expect(result.scan).toBe(false);
    expect(result.advertise).toBe(true);
  });
});

describe('scanForPeers — graceful unsupported behaviour', () => {
  test('returns a handle whose peers() is empty when Web Bluetooth is missing', async () => {
    let endReason: string | null = null;
    let endError: Error | undefined;
    const handle = scanForPeers({
      onEnd: (reason, error) => {
        endReason = reason;
        endError = error;
      },
    });
    // Wait one microtask for the async init to bail out.
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(handle.peers()).toEqual([]);
    // In the bun:test environment navigator.bluetooth is undefined, so
    // the primitive should cleanly report `error` without crashing.
    expect(endReason).toBe('error');
    expect(endError?.message ?? '').toMatch(/requestLEScan/);
  });

  test('handle.stop is idempotent', async () => {
    const handle = scanForPeers({});
    await new Promise((resolve) => setTimeout(resolve, 5));
    handle.stop();
    handle.stop(); // second call must not throw
    expect(handle.peers()).toEqual([]);
  });
});

describe('BLE_SHIPPIE_CONSTANTS', () => {
  test('exposes a stable service UUID and characteristic UUID', () => {
    expect(BLE_SHIPPIE_CONSTANTS.SERVICE_UUID).toMatch(/^[0-9a-f-]{36}$/);
    expect(BLE_SHIPPIE_CONSTANTS.JOIN_CODE_CHARACTERISTIC_UUID).toMatch(/^[0-9a-f-]{36}$/);
    expect(BLE_SHIPPIE_CONSTANTS.SERVICE_UUID).not.toBe(
      BLE_SHIPPIE_CONSTANTS.JOIN_CODE_CHARACTERISTIC_UUID,
    );
  });
});
