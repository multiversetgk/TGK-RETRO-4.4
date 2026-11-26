import test from 'node:test';
import assert from 'node:assert/strict';
import type { INesEmulatorCore } from '../emulator/core/INesEmulatorCore';
import {
  createEmptyManualOverrides,
  DEFAULT_RACE_CONFIG,
  evaluateRaceMatch,
  formatRaceClock,
  readCoreTelemetry,
  resolveRamProfile,
  type RaceMatchConfig,
} from '../emulator/race/ramJudge';
import { CHAOS_DURATION_MS, ChaosModifierEngine } from '../emulator/race/chaosEngine';
import { FriendRivalryStore } from '../emulator/race/rivalryStore';
import { createTestInesRom, DeterministicMockNesCore } from './testHelpers';

function mockRamCore(mem: Uint8Array): INesEmulatorCore {
  return {
    hasRomLoaded: () => true,
    readRamByte: (addr: number) => mem[addr & 0x07ff] ?? 0,
  } as unknown as INesEmulatorCore;
}

test('Dual independent INesEmulatorCore instances keep RAM telemetry completely isolated per player', () => {
  const romBytes = createTestInesRom(42);
  const core1 = new DeterministicMockNesCore();
  const core2 = new DeterministicMockNesCore();

  let frames1 = 0;
  let frames2 = 0;
  core1.onFrame(() => {
    frames1 += 1;
  });
  core2.onFrame(() => {
    frames2 += 1;
  });

  core1.loadRom(romBytes, 'Super_Mario_Bros.nes');
  core2.loadRom(romBytes, 'Super_Mario_Bros.nes');

  const profile = resolveRamProfile('Super_Mario_Bros.nes');
  assert.equal(profile.id, 'smb1-nes');
  assert.equal(profile.isRamMapped, true);

  // Player 1 runs RIGHT while Player 2 stays idle — zero RAM cross-talk between instances
  core1.setButton(1, 'RIGHT', true);
  for (let frame = 0; frame < 12; frame++) {
    core1.stepFrame();
    core2.stepFrame();
  }
  core1.setButton(1, 'RIGHT', false);

  assert.equal(frames1, 12);
  assert.equal(frames2, 12);

  const t1 = readCoreTelemetry(core1, profile, 1.0);
  const t2 = readCoreTelemetry(core2, profile, 1.0);

  assert.equal(t1.isRamMapped, true);
  assert.equal(t2.isRamMapped, true);
  assert.ok(t1.score > t2.score, `Expected P1 score (${t1.score}) > P2 score (${t2.score})`);
  assert.ok(t1.coins > t2.coins, `Expected P1 coins (${t1.coins}) > P2 coins (${t2.coins})`);
  assert.equal(t2.coins, 0, 'Core 2 RAM must remain completely isolated from Core 1 inputs');

  const slice1 = core1.readRamSlice(0x0010, 6);
  assert.ok(slice1 && slice1.length === 6);

  core1.dispose();
  core2.dispose();
});

test('RAM Judge decodes Super Mario Bros. memory map and evaluates Score Attack, First-to-Stage, 1-Life Survival & Handicap', () => {
  const smbProfile = resolveRamProfile('Super_Mario_Bros_USA.nes');
  assert.equal(smbProfile.id, 'smb1-nes');
  assert.equal(smbProfile.isRamMapped, true);

  // Synthetic SMB1 RAM snapshot
  const memP1 = new Uint8Array(2048);
  // Score digits 0, 1, 2, 5, 0, 0 -> 125000 (x10)
  memP1[0x07dd] = 0;
  memP1[0x07de] = 1;
  memP1[0x07df] = 2;
  memP1[0x07e0] = 5;
  memP1[0x07e1] = 0;
  memP1[0x07e2] = 0;
  memP1[0x075e] = 14; // coins
  memP1[0x075a] = 2; // raw lives = 2 -> 3 lives
  memP1[0x075f] = 0; // World 1
  memP1[0x075c] = 1; // Stage 2

  const memP2 = new Uint8Array(2048);
  memP2[0x07dd] = 0;
  memP2[0x07de] = 0;
  memP2[0x07df] = 8;
  memP2[0x07e0] = 0;
  memP2[0x07e1] = 0;
  memP2[0x07e2] = 0; // 80000
  memP2[0x075e] = 9;
  memP2[0x075a] = 1; // raw lives = 1 -> 2 lives (dropped from 3!)
  memP2[0x075f] = 0;
  memP2[0x075c] = 0; // Stage 1

  const t1 = readCoreTelemetry(mockRamCore(memP1), smbProfile, 35);
  const t2 = readCoreTelemetry(mockRamCore(memP2), smbProfile, 35);

  assert.equal(t1.score, 125000);
  assert.equal(t1.coins, 14);
  assert.equal(t1.lives, 3);
  assert.equal(t1.world, 1);
  assert.equal(t1.stage, 2);

  // Score Attack with P2 +500 handicap
  const scoreAttackEval = evaluateRaceMatch({
    config: {
      ...DEFAULT_RACE_CONFIG,
      mode: 'score-attack',
      durationSeconds: 90,
      handicap: 'p2-plus-500',
    },
    p1: t1,
    p2: t2,
    p1BaselineLives: 3,
    p2BaselineLives: 3,
    elapsedSeconds: 35,
    manual: createEmptyManualOverrides(),
  });
  assert.equal(scoreAttackEval.p1EffectiveScore, 125000);
  assert.equal(scoreAttackEval.p2EffectiveScore, 80500);
  assert.equal(scoreAttackEval.leader, 1);
  assert.equal(scoreAttackEval.finished, false);

  // First to Stage 2 -> P1 wins immediately
  const stageConfig: RaceMatchConfig = {
    ...DEFAULT_RACE_CONFIG,
    mode: 'first-to-stage',
    targetStage: 2,
  };
  const stageEval = evaluateRaceMatch({
    config: stageConfig,
    p1: t1,
    p2: t2,
    p1BaselineLives: 3,
    p2BaselineLives: 3,
    elapsedSeconds: 35,
    manual: createEmptyManualOverrides(),
  });
  assert.equal(stageEval.finished, true);
  assert.equal(stageEval.winner, 1);

  // 1-Life Survival -> P2 lost a life -> P1 wins
  const survivalEval = evaluateRaceMatch({
    config: { ...DEFAULT_RACE_CONFIG, mode: 'survival-1life' },
    p1: t1,
    p2: t2,
    p1BaselineLives: 3,
    p2BaselineLives: 3,
    elapsedSeconds: 35,
    manual: createEmptyManualOverrides(),
  });
  assert.equal(survivalEval.finished, true);
  assert.equal(survivalEval.winner, 1);

  assert.equal(formatRaceClock(95), '1:35');
});

test('Unmapped ROM falls back cleanly to Universal Timer / Manual Judge', () => {
  const generic = resolveRamProfile('Random_Homebrew_Mystery.nes');
  assert.equal(generic.id, 'generic-fallback');
  assert.equal(generic.isRamMapped, false);

  const emptyMem = new Uint8Array(2048);
  const t1 = readCoreTelemetry(mockRamCore(emptyMem), generic, 20);
  const t2 = readCoreTelemetry(mockRamCore(emptyMem), generic, 20);
  assert.equal(t1.isRamMapped, false);

  const manual = createEmptyManualOverrides();
  manual.p2BonusScore = 300;
  manual.p1ManualEliminated = true;

  const evalRes = evaluateRaceMatch({
    config: { ...DEFAULT_RACE_CONFIG, mode: 'survival-1life' },
    p1: t1,
    p2: t2,
    p1BaselineLives: 3,
    p2BaselineLives: 3,
    elapsedSeconds: 20,
    manual,
  });
  assert.equal(evalRes.finished, true);
  assert.equal(evalRes.winner, 2);
});

test('ChaosModifierEngine triggers random 10s twists between 30-45s and expires automatically', () => {
  const engine = new ChaosModifierEngine(() => 0.5); // midpoint -> 37.5s interval
  engine.configure(true, 1000);

  const before = engine.tick(30_000);
  assert.equal(before.newlyTriggered, null);
  assert.equal(before.snapshot.activeTwist, null);

  const triggered = engine.tick(40_000);
  assert.ok(triggered.newlyTriggered !== null);
  assert.ok(triggered.snapshot.activeTwist !== null);
  assert.equal(
    triggered.snapshot.activeTwist.endsAtMs - triggered.snapshot.activeTwist.startedAtMs,
    CHAOS_DURATION_MS
  );

  const expired = engine.tick(51_000);
  assert.equal(expired.snapshot.activeTwist, null);
});

test('FriendRivalryStore persists friends, wins/losses/draws, streak, and high score', () => {
  const store = new FriendRivalryStore();
  const friend = store.addFriend('Vikram');
  assert.equal(friend.name, 'Vikram');

  store.recordMatchResult({
    rivalId: friend.id,
    rivalNameFallback: friend.name,
    outcome: 'win',
    p1Score: 4200,
    p2Score: 3100,
    romName: 'Super_Mario_Bros.nes',
  });
  store.recordMatchResult({
    rivalId: friend.id,
    rivalNameFallback: friend.name,
    outcome: 'win',
    p1Score: 5600,
    p2Score: 2900,
    romName: 'Super_Mario_Bros.nes',
  });
  store.recordMatchResult({
    rivalId: friend.id,
    rivalNameFallback: friend.name,
    outcome: 'loss',
    p1Score: 1200,
    p2Score: 6000,
    romName: 'Super_Mario_Bros.nes',
  });

  const updated = store.listRivals().find((r) => r.id === friend.id);
  assert.ok(updated);
  assert.equal(updated.wins, 2);
  assert.equal(updated.losses, 1);
  assert.equal(updated.draws, 0);
  assert.equal(updated.highScore, 5600);
  assert.equal(updated.rivalHighScore, 6000);
  assert.equal(updated.currentStreak, -1);

  store.removeFriend(friend.id);
  assert.equal(store.listRivals().find((r) => r.id === friend.id), undefined);
});
