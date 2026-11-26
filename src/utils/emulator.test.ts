import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInesHeader } from '../emulator/core/inesParser';
import {
  DEFAULT_CONTROLLER_BINDINGS,
  resolveKeyboardBinding,
} from '../emulator/input/controllerMappings';
import {
  isValidRoomCode,
  sanitizeRoomCode,
} from '../emulator/netplay/protocol';
import {
  createNesCore,
  NES_CORE_REGISTRY,
  PRIMARY_NES_CORE,
  PRIMARY_NES_CORE_ID,
} from '../emulator/core/CoreRegistry';
import { SaveStateStore } from '../emulator/core/saveStateStore';
import { UserRomLibraryStore } from '../emulator/roms/userRomLibraryStore';
import { createTestInesRom, DeterministicMockNesCore } from './testHelpers';

test('iNES header parser validates real .nes ROM bytes and rejects malformed data', () => {
  const romBytes = createTestInesRom(7);
  const meta = parseInesHeader(romBytes, 'Super_Mario_Bros.nes');
  assert.equal(meta.mapperId, 0);
  assert.equal(meta.mapperName, 'NROM');
  assert.equal(meta.prgRomSizeKb, 16);
  assert.equal(meta.chrRomSizeKb, 8);
  assert.equal(meta.hash.length, 8);
  assert.equal(meta.sha256.length, 64);

  assert.throws(() => parseInesHeader(new Uint8Array([0x00, 0x01, 0x02])), /Invalid .nes file/);
  assert.throws(() => parseInesHeader(new Uint8Array(64)), /missing iNES header magic/);
});

test('UserRomLibraryStore saves, lists, retrieves, and removes user-selected .nes ROMs', async () => {
  const store = new UserRomLibraryStore();
  assert.deepEqual(await store.listRoms(), []);

  const romA = createTestInesRom(11);
  const romB = createTestInesRom(22);

  const savedA = await store.saveRom(romA, 'Contra.nes');
  assert.equal(savedA.name, 'Contra.nes');
  assert.equal(savedA.fileName, 'Contra.nes');
  assert.equal(savedA.mapperName, 'NROM');
  assert.equal(savedA.sha256.length, 64);

  const savedB = await store.saveRom(romB, 'Mega_Man_2.nes');
  const listed = await store.listRoms();
  assert.equal(listed.length, 2);
  assert.ok(listed.some((r) => r.id === savedA.id));
  assert.ok(listed.some((r) => r.id === savedB.id));

  const fetched = await store.getRom(savedA.id);
  assert.ok(fetched !== null);
  assert.equal(fetched?.bytes.byteLength, romA.byteLength);

  // Reject invalid .nes payload
  await assert.rejects(() => store.saveRom(new Uint8Array(64), 'bad.nes'));

  await store.removeRom(savedA.id);
  const afterRemove = await store.listRoms();
  assert.equal(afterRemove.length, 1);
  assert.equal(afterRemove[0].id, savedB.id);
});

test('CoreRegistry exposes ONLY FCEUmm (libretro-fceumm) as single default primary NES core', () => {
  assert.equal(PRIMARY_NES_CORE_ID, 'libretro-fceumm');
  assert.equal(NES_CORE_REGISTRY.length, 1);
  assert.equal(NES_CORE_REGISTRY[0].id, 'libretro-fceumm');
  assert.equal(PRIMARY_NES_CORE.repoUrl, 'https://github.com/libretro/libretro-fceumm');

  const fceummCore = createNesCore();
  assert.equal(fceummCore.coreId, 'libretro-fceumm');
  assert.equal(fceummCore.repoUrl, 'https://github.com/libretro/libretro-fceumm');
  assert.equal(fceummCore.rendersOwnCanvas, true);
  assert.equal(fceummCore.hasRomLoaded(), false);

  // SaveStateStore saves & loads cleanly for libretro-fceumm
  const store = new SaveStateStore();
  store.save(1, {
    version: 1,
    coreId: 'libretro-fceumm',
    romName: 'Contra.nes',
    romHash: 'deadbeef',
    frameCount: 42,
    savedAt: Date.now(),
    stateJson: '{"frame":42}',
  });
  const loaded = store.load('libretro-fceumm', 'deadbeef', 1);
  assert.ok(loaded !== null);
  assert.equal(loaded?.frameCount, 42);

  fceummCore.dispose();
});

test('INesEmulatorCore lifecycle handles Load, Pause, Resume, Reset, Port 1/2 isolation, and Save/Load State', () => {
  const romBytes = createTestInesRom(99);
  const core = new DeterministicMockNesCore();

  let emittedFrames = 0;
  core.onFrame(() => {
    emittedFrames += 1;
  });

  const meta = core.loadRom(romBytes, 'User_Cartridge.nes');
  assert.equal(meta.name, 'User_Cartridge.nes');
  assert.equal(core.hasRomLoaded(), true);
  assert.equal(core.isRunning(), true);

  for (let i = 0; i < 30; i++) core.stepFrame();
  assert.equal(emittedFrames, 30);

  const saved = core.saveState();
  assert.equal(saved.frameCount, 30);

  // Pause stops stepping
  core.pause();
  assert.equal(core.isPaused(), true);
  core.stepFrame();
  assert.equal(emittedFrames, 30);

  // Resume + Port 1 & Port 2 independent masks
  core.resume();
  core.setButton(1, 'A', true);
  core.setButton(2, 'B', true);
  assert.notEqual(core.getPortBitmask(1), core.getPortBitmask(2));
  for (let i = 0; i < 15; i++) core.stepFrame();
  assert.equal(core.getFrameCount(), 45);

  // Load state restores exact frame
  core.loadState(saved);
  assert.equal(core.getFrameCount(), 30);

  // Reset returns frame count to 0
  core.reset();
  assert.equal(core.getFrameCount(), 0);
  core.dispose();
});

test('Controller bindings separate Port 1 & Port 2 keys and Netplay room codes sanitize cleanly', () => {
  assert.deepEqual(resolveKeyboardBinding('KeyW', DEFAULT_CONTROLLER_BINDINGS), {
    port: 1,
    button: 'UP',
  });
  assert.deepEqual(resolveKeyboardBinding('ArrowUp', DEFAULT_CONTROLLER_BINDINGS), {
    port: 2,
    button: 'UP',
  });
  assert.equal(resolveKeyboardBinding('KeyW', DEFAULT_CONTROLLER_BINDINGS, [2]), null);

  assert.equal(sanitizeRoomCode(' tgk-482 '), 'TGK482');
  assert.equal(isValidRoomCode('TGK482'), true);
  assert.equal(isValidRoomCode('AB'), false);
});
