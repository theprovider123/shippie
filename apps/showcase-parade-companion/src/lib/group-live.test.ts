import { describe, expect, test } from 'bun:test';
import {
  buildGroupSignalUrl,
  decodeGroupLivePayload,
  encodeGroupLivePayload,
  groupLiveMembersForMap,
  makeGroupLivePacket,
  mergeGroupLiveMembers,
  type GroupLiveMember,
} from './group-live';

describe('group live relay helpers', () => {
  test('encrypts and decrypts a group live packet with the room key', async () => {
    const packet = makeGroupLivePacket({
      kind: 'presence',
      sourceId: 'fan_dev',
      displayName: 'Dev',
      supporterTag: 'A123',
      memberName: 'Dev #A123',
      point: { lng: -0.104812, lat: 51.54871, accuracyM: 12 },
      now: new Date('2026-05-31T14:00:00+01:00'),
    });

    const payload = await encodeGroupLivePayload('room-secret', packet);
    const decoded = await decodeGroupLivePayload('room-secret', payload);

    expect(decoded).toMatchObject({
      kind: 'presence',
      source_id: 'fan_dev',
      member_name: 'Dev #A123',
      lng: -0.104812,
      lat: 51.54871,
    });
    expect(await decodeGroupLivePayload('wrong-secret', payload)).toBeNull();
  });

  test('merges joins and later presence by source id', () => {
    const join = makeGroupLivePacket({
      kind: 'join',
      sourceId: 'fan_1',
      displayName: 'Raya',
      supporterTag: 'RAYA1',
      memberName: 'Raya #RAYA1',
      now: new Date('2026-05-31T14:00:00+01:00'),
    });
    const presence = makeGroupLivePacket({
      kind: 'presence',
      sourceId: 'fan_1',
      displayName: 'Raya',
      supporterTag: 'RAYA1',
      memberName: 'Raya #RAYA1',
      point: { lng: -0.1, lat: 51.55, accuracyM: 20 },
      now: new Date('2026-05-31T14:01:00+01:00'),
    });

    const members = mergeGroupLiveMembers(mergeGroupLiveMembers([], join), presence);

    expect(members).toHaveLength(1);
    expect(members[0]?.memberName).toBe('Raya #RAYA1');
    expect(members[0]?.hasLocation).toBe(true);
    expect(members[0]?.accuracyM).toBe(20);
  });

  test('map members hides local source and members without location', () => {
    const remote = makeGroupLivePacket({
      kind: 'presence',
      sourceId: 'fan_remote',
      displayName: 'Gabriel',
      supporterTag: 'GABI',
      memberName: 'Gabriel #GABI',
      point: { lng: -0.1, lat: 51.55, accuracyM: 15 },
    });
    const local = makeGroupLivePacket({
      kind: 'presence',
      sourceId: 'fan_local',
      displayName: 'Me',
      supporterTag: 'ME01',
      memberName: 'Me #ME01',
      point: { lng: -0.11, lat: 51.54, accuracyM: 11 },
    });
    const joinOnly = makeGroupLivePacket({
      kind: 'join',
      sourceId: 'fan_join',
      displayName: 'Kai',
      supporterTag: 'KAI',
      memberName: 'Kai #KAI',
    });

    const members = [remote, local, joinOnly].reduce<GroupLiveMember[]>(
      (acc, packet) => mergeGroupLiveMembers(acc, packet),
      [],
    );

    expect(groupLiveMembersForMap(members, 'fan_local').map((member) => member.memberName)).toEqual(['Gabriel #GABI']);
  });

  test('localhost signal URL uses the deployed Shippie relay', () => {
    Object.defineProperty(globalThis, 'window', {
      value: { location: { hostname: 'localhost', origin: 'http://localhost:5252' } },
      configurable: true,
    });

    expect(buildGroupSignalUrl('room-1')).toBe('wss://shippie.app/__shippie/signal/room-1');
  });
});
