import test from 'node:test';
import assert from 'node:assert/strict';
import { TurboEngine } from '../emulator/input/turboEngine';
import {
  EmulatorSettingsStore,
  createDefaultEmulatorSettings,
} from '../emulator/settings/emulatorSettingsStore';
import {
  GameLayoutStore,
  clampClusterPosition,
} from '../emulator/settings/gameLayoutStore';
import { HighlightBookmarkStore } from '../emulator/settings/highlightBookmarkStore';

test('TurboEngine oscillates at configured Hz and releases cleanly without stuck buttons', () => {
  const turbo = new TurboEngine();
  turbo.setRateHz(30); // 1 frame ON, 1 frame OFF
  assert.equal(turbo.getHalfPeriodFrames(), 1);

  const pressEdges = turbo.setTurboHeld(1, 'A', true);
  assert.deepEqual(pressEdges, [{ port: 1, button: 'A', pressed: true }]);

  let toggles = 0;
  for (let f = 0; f < 10; f++) {
    const events = turbo.tickFrame();
    toggles += events.length;
  }
  assert.ok(toggles >= 8, `Expected rapid oscillation at 30Hz, got ${toggles}`);

  // Slow down to 5Hz (6 frames half-period)
  turbo.setRateHz(5);
  assert.equal(turbo.getHalfPeriodFrames(), 6);

  // Release must immediately emit pressed: false if button was down
  turbo.setTurboHeld(1, 'B', true);
  const rel = turbo.releaseAll();
  assert.ok(rel.some((e) => e.port === 1 && e.button === 'B' && e.pressed === false));
  assert.equal(turbo.isTurboHeld(1, 'A'), false);
  assert.equal(turbo.isTurboHeld(1, 'B'), false);
});

test('EmulatorSettingsStore persists and resets primary FCEUmm core settings cleanly', () => {
  const store = new EmulatorSettingsStore();

  const fceummDefault = createDefaultEmulatorSettings('libretro-fceumm');
  assert.equal(fceummDefault.videoFilter, 'pixel-crisp');
  assert.equal(fceummDefault.crtMode, 'scanlines');

  store.updateSettings('libretro-fceumm', {
    videoFilter: 'mono-pocket',
    crtMode: 'off',
    audioLatencyMs: 96,
    turboRateHz: 30,
    audioFocus: 'voice-duck',
  });

  const updated = store.getSettings('libretro-fceumm');
  assert.equal(updated.videoFilter, 'mono-pocket');
  assert.equal(updated.crtMode, 'off');
  assert.equal(updated.audioLatencyMs, 96);
  assert.equal(updated.turboRateHz, 30);
  assert.equal(updated.audioFocus, 'voice-duck');

  const reset = store.resetSettings('libretro-fceumm');
  assert.equal(reset.videoFilter, fceummDefault.videoFilter);
  assert.equal(reset.turboRateHz, fceummDefault.turboRateHz);
});

test('GameLayoutStore saves independent custom layouts per game ROM hash and clamps coordinates', () => {
  const store = new GameLayoutStore();

  const clamped = clampClusterPosition({ x: -12, y: 140 });
  assert.equal(clamped.x, 6);
  assert.equal(clamped.y, 92);

  const romA = store.getLayout('hash-mario', 'Super Mario Bros.nes');
  store.saveLayout({
    ...romA,
    stickMode: 'thumbstick',
    scale: 1.25,
    opacity: 0.72,
    zones: {
      ...romA.zones,
      actions: { x: 82, y: 65 },
    },
  });

  const reloadedA = store.getLayout('hash-mario', 'Super Mario Bros.nes');
  const romB = store.getLayout('hash-contra', 'Contra.nes');

  assert.equal(reloadedA.isCustomized, true);
  assert.equal(reloadedA.stickMode, 'thumbstick');
  assert.equal(reloadedA.scale, 1.25);
  assert.equal(reloadedA.zones.actions.x, 82);

  // Separate game retains its own clean default layout
  assert.equal(romB.isCustomized, false);
  assert.equal(romB.stickMode, 'dpad');
  assert.equal(romB.scale, 1.0);
});

test('HighlightBookmarkStore captures save-state + timestamp bookmarks for FCEUmm and retrieves/deletes cleanly', () => {
  const store = new HighlightBookmarkStore();
  const payload = {
    version: 1 as const,
    coreId: 'libretro-fceumm' as const,
    romName: 'Super Mario Bros.nes',
    romHash: 'hash-mario',
    frameCount: 420,
    savedAt: Date.now(),
    stateJson: '{"frame":420}',
  };

  const added = store.addBookmark(payload, { label: 'World 1-1 Flagpole' });
  const list = store.listBookmarks('libretro-fceumm', 'hash-mario');
  assert.equal(list.length, 1);
  assert.equal(list[0].label, 'World 1-1 Flagpole');
  assert.equal(list[0].frameCount, 420);

  const loaded = store.getBookmark('libretro-fceumm', 'hash-mario', added.id);
  assert.equal(loaded?.statePayload.stateJson, '{"frame":420}');

  store.deleteBookmark('libretro-fceumm', 'hash-mario', added.id);
  assert.equal(store.listBookmarks('libretro-fceumm', 'hash-mario').length, 0);
});
