import { describe, expect, test } from 'bun:test';
import {
  readCommentaryPosts,
  readFollowedTeam,
  readPredictionReceipts,
  readPulseVote,
  readSavedRooms,
  readUserProfile,
  removeRoomShortcut,
  saveCommentaryPost,
  saveFollowedTeam,
  savePredictionReceipt,
  savePulseVote,
  saveRoomShortcut,
  saveUserProfile,
} from './local-store.ts';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  };
}

describe('match-room local receipts', () => {
  test('keeps the latest receipt per match', () => {
    const storage = memoryStorage();
    savePredictionReceipt({ matchId: 'match-001', matchTitle: 'Mexico v South Africa', home: 2, away: 1 }, storage);
    savePredictionReceipt({ matchId: 'match-001', matchTitle: 'Mexico v South Africa', home: 1, away: 1 }, storage);
    const receipts = readPredictionReceipts(storage);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.home).toBe(1);
  });

  test('stores and removes multiple saved boards', () => {
    const storage = memoryStorage();
    saveRoomShortcut({
      id: 'room-friends',
      title: 'Friends board',
      role: 'host',
      template: 'friends',
      url: 'https://shippie.app/run/match-room/?room=room-friends',
    }, storage);
    saveRoomShortcut({
      id: 'room-company',
      title: 'Company board',
      role: 'host',
      template: 'office',
      url: 'https://shippie.app/run/match-room/?room=room-company',
    }, storage);
    expect(readSavedRooms(storage).map((room) => room.title)).toEqual(['Company board', 'Friends board']);
    expect(removeRoomShortcut('room-friends', storage).map((room) => room.id)).toEqual(['room-company']);
  });

  test('stores followed team, commentary, and pulse votes', () => {
    const storage = memoryStorage();
    saveFollowedTeam('BRA', storage);
    expect(readFollowedTeam(storage)?.code).toBe('BRA');
    saveCommentaryPost({ text: 'This group is chaos.', scope: 'room' }, storage);
    expect(readCommentaryPosts(storage)[0]?.text).toBe('This group is chaos.');
    savePulseVote({ questionId: 'opening-room-mood', option: 'Draw' }, storage);
    expect(readPulseVote('opening-room-mood', storage)?.option).toBe('Draw');
  });

  test('stores a match identity profile with primary and followed teams', () => {
    const storage = memoryStorage();
    saveUserProfile({
      displayName: 'Maya',
      primaryTeam: 'JPN',
      followedTeams: ['BRA', 'JPN', 'MEX'],
      locale: 'pt',
      timeZone: 'America/Sao_Paulo',
      themeMode: 'team',
    }, storage);
    const profile = readUserProfile(storage);
    expect(profile.displayName).toBe('Maya');
    expect(profile.primaryTeam).toBe('JPN');
    expect(profile.followedTeams).toEqual(['JPN', 'BRA', 'MEX']);
    expect(profile.themeMode).toBe('team');
    expect(readFollowedTeam(storage)?.code).toBe('JPN');
  });
});
