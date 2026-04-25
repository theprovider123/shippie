import { describe, expect, test } from 'bun:test';
import { HubState, type PeerSocket } from './state.ts';

function fakePeer(id: string): PeerSocket & { sent: string[] } {
  const sent: string[] = [];
  return {
    peerId: id,
    sent,
    send(s) {
      sent.push(s);
    },
    close() {},
  };
}

describe('HubState', () => {
  test('joinRoom announces existing peers to the joiner and the joiner to existing peers', () => {
    const state = new HubState();
    const a = fakePeer('a');
    const b = fakePeer('b');

    state.joinRoom('room-1', a);
    state.joinRoom('room-1', b);

    expect(b.sent.some((m) => m.includes('peer-joined') && m.includes('"a"'))).toBe(true);
    expect(a.sent.some((m) => m.includes('peer-joined') && m.includes('"b"'))).toBe(true);
  });

  test('forward routes a "to" message only to the addressed peer', () => {
    const state = new HubState();
    const a = fakePeer('a');
    const b = fakePeer('b');
    const c = fakePeer('c');
    state.joinRoom('r', a);
    state.joinRoom('r', b);
    state.joinRoom('r', c);

    a.sent.length = 0;
    b.sent.length = 0;
    c.sent.length = 0;

    state.forward('r', 'a', { t: 'offer', to: 'b' });
    expect(b.sent).toHaveLength(1);
    expect(b.sent[0]).toContain('"t":"offer"');
    expect(c.sent).toHaveLength(0);
    expect(a.sent).toHaveLength(0);
  });

  test('leaveRoom announces departure to remaining peers', () => {
    const state = new HubState();
    const a = fakePeer('a');
    const b = fakePeer('b');
    state.joinRoom('r', a);
    state.joinRoom('r', b);
    a.sent.length = 0;
    b.sent.length = 0;

    state.leaveRoom('r', 'a');
    expect(b.sent.some((m) => m.includes('peer-left') && m.includes('"a"'))).toBe(true);
  });

  test('rooms drop when empty', () => {
    const state = new HubState();
    const a = fakePeer('a');
    state.joinRoom('r', a);
    expect(state.stats()).toHaveLength(1);
    state.leaveRoom('r', 'a');
    expect(state.stats()).toHaveLength(0);
  });
});
