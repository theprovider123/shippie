import { describe, expect, test } from 'bun:test';
import { extractRoomId } from './signal.ts';

describe('extractRoomId', () => {
  test('matches /__shippie/signal/<roomId>', () => {
    expect(extractRoomId('/__shippie/signal/abc123')).toBe('abc123');
  });
  test('also matches /signal/<roomId>', () => {
    expect(extractRoomId('/signal/zz')).toBe('zz');
  });
  test('returns null for unrelated paths', () => {
    expect(extractRoomId('/health')).toBeNull();
    expect(extractRoomId('/__shippie/health')).toBeNull();
    expect(extractRoomId('/signal/')).toBeNull();
  });
});
