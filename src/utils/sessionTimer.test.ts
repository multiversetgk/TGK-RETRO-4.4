import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SessionTimerStore,
  formatHumanDuration,
  formatSessionDuration,
} from '../emulator/settings/sessionTimerStore';
import { EmulatorSettingsStore } from '../emulator/settings/emulatorSettingsStore';

test('formatSessionDuration formats MM:SS from 00:00 and expands to H:MM:SS after 1 hour', () => {
  assert.equal(formatSessionDuration(0), '00:00');
  assert.equal(formatSessionDuration(9), '00:09');
  assert.equal(formatSessionDuration(65), '01:05');
  assert.equal(formatSessionDuration(3661), '1:01:01');
  assert.equal(formatSessionDuration(-5), '00:00');
});

test('formatHumanDuration formats readable playtime summaries', () => {
  assert.equal(formatHumanDuration(42), '42s');
  assert.equal(formatHumanDuration(120), '2m');
  assert.equal(formatHumanDuration(195), '3m 15s');
  assert.equal(formatHumanDuration(3900), '1h 05m');
});

test('SessionTimerStore aggregates playtime per game, orders recent games, and resets cleanly', () => {
  const store = new SessionTimerStore();
  store.clearReports();

  // Zero-second sessions are ignored
  assert.equal(
    store.recordSession({
      gameId: 'mario',
      gameName: 'Super Mario Bros',
      startedAt: 1000,
      endedAt: 1000,
      durationSeconds: 0,
    }),
    null
  );

  store.recordSession({
    gameId: 'mario',
    gameName: 'Super Mario Bros',
    startedAt: 1000,
    endedAt: 61_000,
    durationSeconds: 60,
  });
  store.recordSession({
    gameId: 'contra',
    gameName: 'Contra',
    startedAt: 70_000,
    endedAt: 190_000,
    durationSeconds: 120,
  });
  store.recordSession({
    gameId: 'mario',
    gameName: 'Super Mario Bros',
    startedAt: 200_000,
    endedAt: 245_000,
    durationSeconds: 45,
  });

  const snap = store.getSnapshot();
  assert.equal(snap.totalSessions, 3);
  assert.equal(snap.totalPlaySeconds, 225);
  assert.equal(snap.games.length, 2);
  // Most recently played game is first
  assert.equal(snap.games[0].gameId, 'mario');
  assert.equal(snap.games[0].totalSeconds, 105);
  assert.equal(snap.games[0].sessions, 2);
  assert.equal(snap.games[1].gameId, 'contra');
  assert.equal(snap.games[1].totalSeconds, 120);

  store.clearReports();
  const cleared = store.getSnapshot();
  assert.equal(cleared.totalSessions, 0);
  assert.equal(cleared.totalPlaySeconds, 0);
  assert.equal(cleared.games.length, 0);
});

test('EmulatorSettingsStore persists organized display and gameplay settings', () => {
  const store = new EmulatorSettingsStore();
  store.updateSettings('libretro-fceumm', {
    aspectRatio: 'full',
    orientation: 'landscape',
    autoSaveEnabled: false,
    fastForwardEnabled: true,
    rewindEnabled: true,
    cheatsEnabled: true,
  });

  const saved = store.getSettings('libretro-fceumm');
  assert.equal(saved.aspectRatio, 'full');
  assert.equal(saved.orientation, 'landscape');
  assert.equal(saved.autoSaveEnabled, false);
  assert.equal(saved.fastForwardEnabled, true);
  assert.equal(saved.rewindEnabled, true);
  assert.equal(saved.cheatsEnabled, true);
});
