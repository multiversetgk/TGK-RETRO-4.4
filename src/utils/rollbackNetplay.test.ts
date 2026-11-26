import assert from 'node:assert/strict';
import test from 'node:test';
import { computeSha256Hex } from '../emulator/core/inesParser';
import type { INesEmulatorCore } from '../emulator/core/INesEmulatorCore';
import {
  AdaptiveDelayController,
  createRomTransferOffer,
  HIGH_PING_SAFE_DELAY_THRESHOLD_MS,
  MAX_STALL_TIMEOUT_MS,
  NES_FRAME_MS,
  RollbackNetplayEngine,
  RomTransferReceiver,
  SYNC_PULSE_DRIFT_THRESHOLD_MS,
  SYNC_PULSE_INTERVAL_MS,
  verifyCoreDeterminism,
  verifyPeerHandshake,
} from '../emulator/netplay/rollbackEngine';
import { NETPLAY_PROTOCOL_VERSION, type PeerHandshakeMeta } from '../emulator/netplay/protocol';
import { createTestInesRom, DeterministicMockNesCore } from './testHelpers';

test('SHA-256 produces exact NIST test vector and matches ROM metadata', () => {
  const abcBytes = new TextEncoder().encode('abc');
  assert.equal(
    computeSha256Hex(abcBytes),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );

  const romBytes = createTestInesRom(1);
  const core = new DeterministicMockNesCore();
  const meta = core.loadRom(romBytes, 'Contra.nes');
  assert.equal(meta.sha256.length, 64);
  assert.equal(meta.sha256, computeSha256Hex(romBytes));
  core.dispose();
});

test('Core determinism & save-state serialization self-test passes bit-exactly', () => {
  const romBytes = createTestInesRom(2);
  const coreA = new DeterministicMockNesCore();
  const coreB = new DeterministicMockNesCore();
  coreA.loadRom(romBytes, 'Contra.nes');
  coreB.loadRom(romBytes, 'Contra.nes');

  const det = verifyCoreDeterminism(coreA);
  assert.equal(det.ok, true, det.error);
  assert.equal(det.checksumBefore, det.checksumAfter);

  // Run 90 frames on both independent instances with identical inputs -> identical checksums
  const pattern: [number, number][] = [
    [0x00, 0x00],
    [0x01, 0x02],
    [0x80, 0x40],
    [0x81, 0x42],
    [0x10, 0x20],
  ];
  for (let f = 0; f < 90; f++) {
    const [p1, p2] = pattern[f % pattern.length];
    coreA.stepFrameWithMasks(p1, p2, true);
    coreB.stepFrameWithMasks(p1, p2, true);
  }
  assert.equal(coreA.computeStateChecksum(), coreB.computeStateChecksum());

  coreA.dispose();
  coreB.dispose();
});

test('Two-peer RollbackNetplayEngine converges bit-exactly across 3-frame delayed inputs and silent rollbacks', () => {
  const romBytes = createTestInesRom(3);
  const coreHost = new DeterministicMockNesCore();
  const coreGuest = new DeterministicMockNesCore();
  coreHost.loadRom(romBytes, 'Contra.nes');
  coreGuest.loadRom(romBytes, 'Contra.nes');

  const hostEngine = new RollbackNetplayEngine(coreHost, 8);
  const guestEngine = new RollbackNetplayEngine(coreGuest, 8);
  hostEngine.configureSession({ localPort: 1, initialFrame: 0 });
  guestEngine.configureSession({ localPort: 2, initialFrame: 0 });
  hostEngine.setManualInputDelay(1);
  guestEngine.setManualInputDelay(1);

  type DelayedPacket = {
    deliverAt: number;
    to: 'host' | 'guest';
    batch: {
      port: 1 | 2;
      latestFrame: number;
      inputs: { frame: number; mask: number }[];
    };
  };
  const wire: DelayedPacket[] = [];

  for (let tick = 0; tick < 75; tick++) {
    for (let i = wire.length - 1; i >= 0; i--) {
      if (wire[i].deliverAt <= tick) {
        const pkt = wire.splice(i, 1)[0];
        if (pkt.to === 'host') {
          hostEngine.receiveRemoteInputs(pkt.batch);
        } else {
          guestEngine.receiveRemoteInputs(pkt.batch);
        }
      }
    }

    const p1Mask = tick % 7 === 0 ? 0x81 : tick % 5 === 0 ? 0x01 : 0x00;
    const p2Mask = tick % 6 === 0 ? 0x42 : tick % 4 === 0 ? 0x20 : 0x00;

    const hostStep = hostEngine.advanceLocalFrame(p1Mask);
    const guestStep = guestEngine.advanceLocalFrame(p2Mask);

    if (hostStep.outgoingInputBatch) {
      wire.push({
        deliverAt: tick + 3,
        to: 'guest',
        batch: {
          port: hostStep.outgoingInputBatch.port,
          latestFrame: hostStep.outgoingInputBatch.latestFrame,
          inputs: hostStep.outgoingInputBatch.inputs,
        },
      });
    }
    if (guestStep.outgoingInputBatch) {
      wire.push({
        deliverAt: tick + 3,
        to: 'host',
        batch: {
          port: guestStep.outgoingInputBatch.port,
          latestFrame: guestStep.outgoingInputBatch.latestFrame,
          inputs: guestStep.outgoingInputBatch.inputs,
        },
      });
    }
  }

  for (const pkt of wire) {
    if (pkt.to === 'host') {
      hostEngine.receiveRemoteInputs(pkt.batch);
    } else {
      guestEngine.receiveRemoteInputs(pkt.batch);
    }
  }

  const hostMetrics = hostEngine.getMetrics();
  const guestMetrics = guestEngine.getMetrics();
  assert.ok(hostMetrics.rollbackCount > 0, 'Host should have executed at least one rollback');
  assert.ok(guestMetrics.rollbackCount > 0, 'Guest should have executed at least one rollback');
  assert.equal(hostMetrics.currentFrame, guestMetrics.currentFrame);
  assert.equal(coreHost.computeStateChecksum(), coreGuest.computeStateChecksum());

  coreHost.dispose();
  coreGuest.dispose();
});

test('Periodic state checksum mismatch triggers automatic authoritative snapshot desync recovery', () => {
  const romBytes = createTestInesRom(4);
  const coreHost = new DeterministicMockNesCore();
  const coreGuest = new DeterministicMockNesCore();
  coreHost.loadRom(romBytes, 'Contra.nes');
  coreGuest.loadRom(romBytes, 'Contra.nes');

  const hostEngine = new RollbackNetplayEngine(coreHost, 8);
  const guestEngine = new RollbackNetplayEngine(coreGuest, 8);
  hostEngine.configureSession({ localPort: 1, initialFrame: 0 });
  guestEngine.configureSession({ localPort: 2, initialFrame: 0 });
  hostEngine.setManualInputDelay(0);
  guestEngine.setManualInputDelay(0);

  let detectedDesync = false;
  for (let tick = 0; tick < 35; tick++) {
    if (tick === 20) {
      coreGuest.stepFrameWithMasks(0xff, 0xff, true);
    }

    const hs = hostEngine.advanceLocalFrame(0x01);
    const gs = guestEngine.advanceLocalFrame(0x02);
    if (gs.outgoingInputBatch) hostEngine.receiveRemoteInputs(gs.outgoingInputBatch);
    if (hs.outgoingInputBatch) guestEngine.receiveRemoteInputs(hs.outgoingInputBatch);

    if (hs.outgoingChecksum) {
      const verdict = guestEngine.receiveRemoteChecksum(
        hs.outgoingChecksum.frame,
        hs.outgoingChecksum.checksum
      );
      if (verdict.desyncDetected) detectedDesync = true;
    }
    if (gs.outgoingChecksum) {
      const verdict = hostEngine.receiveRemoteChecksum(
        gs.outgoingChecksum.frame,
        gs.outgoingChecksum.checksum
      );
      if (verdict.desyncDetected) detectedDesync = true;
    }
  }

  assert.equal(detectedDesync, true, 'Desync should be detected at 30-frame checksum boundary');

  const authSnap = hostEngine.exportAuthoritativeSnapshot();
  assert.ok(authSnap, 'Host should export authoritative snapshot');
  const recovered = guestEngine.applyAuthoritativeSnapshot({
    frame: authSnap.frame,
    stateJson: authSnap.stateJson,
    checksum: authSnap.checksum,
    romHash: authSnap.romHash,
  });
  assert.equal(recovered, true);
  assert.equal(coreHost.computeStateChecksum(), coreGuest.computeStateChecksum());
  assert.equal(guestEngine.getMetrics().checksumSyncState, 'verified');
  assert.equal(guestEngine.getMetrics().recoveryCount, 1);

  coreHost.dispose();
  coreGuest.dispose();
});

test('AdaptiveDelayController scales delay smoothly with RTT/jitter and supports manual override', () => {
  const ctrl = new AdaptiveDelayController();
  assert.equal(ctrl.isAdaptiveEnabled(), true);
  assert.equal(ctrl.getConnectionQuality(), 'unknown');

  for (let i = 0; i < 6; i++) ctrl.recordRttSample(20);
  assert.equal(ctrl.getConnectionQuality(), 'good');
  assert.equal(ctrl.getActiveDelayFrames(), 1);

  ctrl.recordRttSample(140);
  ctrl.recordRttSample(165);
  assert.ok(ctrl.getActiveDelayFrames() >= 3);
  assert.notEqual(ctrl.getConnectionQuality(), 'good');

  ctrl.setManualDelay(4);
  assert.equal(ctrl.isAdaptiveEnabled(), false);
  assert.equal(ctrl.getActiveDelayFrames(), 4);
  ctrl.setManualDelay(null);
  assert.equal(ctrl.isAdaptiveEnabled(), true);
});

test('Peer handshake verifies protocol, FCEUmm core version, and SHA-256 ROM checksum', () => {
  const base: PeerHandshakeMeta = {
    protocolVersion: NETPLAY_PROTOCOL_VERSION,
    coreId: 'libretro-fceumm',
    coreVersion: 'libretro-fceumm-wasm-2.0',
    romName: 'Contra.nes',
    romHash: 'abcd1234',
    romSha256: 'a'.repeat(64),
    romSizeBytes: 40976,
    determinismVerified: true,
  };

  const ok = verifyPeerHandshake(base, { ...base });
  assert.equal(ok.compatible, true);

  const coreMismatch = verifyPeerHandshake(base, {
    ...base,
    coreVersion: 'libretro-fceumm-jni-1.9',
  });
  assert.equal(coreMismatch.compatible, false);
  assert.equal(coreMismatch.coreMatches, false);

  const romMismatch = verifyPeerHandshake(base, {
    ...base,
    romSha256: 'b'.repeat(64),
  });
  assert.equal(romMismatch.compatible, false);
  assert.equal(romMismatch.coreMatches, true);
  assert.equal(romMismatch.canOfferRomTransfer, true);
});

test('Consent-based ROM transfer blocks unconsented chunks, verifies SHA-256, and rejects tampering', () => {
  const romBytes = createTestInesRom(5);
  const prepared = createRomTransferOffer('Super_Mario_Bros.nes', romBytes);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  const receiver = new RomTransferReceiver();
  assert.equal(receiver.receiveOffer(prepared.offer).ok, true);

  const blocked = receiver.ingestChunk(prepared.offer.transferId, 0, prepared.chunks[0]);
  assert.equal(blocked.ok, false);

  assert.ok(receiver.grantConsent(true));
  let finalRes: ReturnType<RomTransferReceiver['ingestChunk']> | null = null;
  for (let i = 0; i < prepared.chunks.length; i++) {
    finalRes = receiver.ingestChunk(prepared.offer.transferId, i, prepared.chunks[i]);
    assert.equal(finalRes.ok, true);
  }
  assert.ok(finalRes?.completed);
  assert.equal(finalRes?.saveToLocalStorage, true);
  assert.equal(computeSha256Hex(finalRes!.bytes!), prepared.offer.sha256);

  const receiver2 = new RomTransferReceiver();
  receiver2.receiveOffer(prepared.offer);
  receiver2.grantConsent(false);
  const badChunkBytes = new Uint8Array(romBytes);
  badChunkBytes[badChunkBytes.length - 1] ^= 0xff;
  const tamperedOffer = createRomTransferOffer('Super_Mario_Bros.nes', badChunkBytes);
  assert.equal(tamperedOffer.ok, true);
  if (tamperedOffer.ok) {
    let last: ReturnType<RomTransferReceiver['ingestChunk']> | null = null;
    for (let i = 0; i < tamperedOffer.chunks.length; i++) {
      last = receiver2.ingestChunk(prepared.offer.transferId, i, tamperedOffer.chunks[i]);
    }
    assert.equal(last?.ok, false);
  }
});

test('Turn-based shared Port 1 mode routes only the active turn owner into Port 1', () => {
  const romBytes = createTestInesRom(6);
  const core1 = new DeterministicMockNesCore();
  const core2 = new DeterministicMockNesCore();
  core1.loadRom(romBytes, 'Super_Mario_Bros.nes');
  core2.loadRom(romBytes, 'Super_Mario_Bros.nes');

  const host = new RollbackNetplayEngine(core1, 8);
  const guest = new RollbackNetplayEngine(core2, 8);
  host.configureSession({ localPort: 1, turnBasedSharedPort1: true, initialFrame: 0 });
  guest.configureSession({ localPort: 2, turnBasedSharedPort1: true, initialFrame: 0 });
  host.setManualInputDelay(0);
  guest.setManualInputDelay(0);

  host.setTurnBasedMode(true, 2);
  guest.setTurnBasedMode(true, 2);

  for (let i = 0; i < 10; i++) {
    const hs = host.advanceLocalFrame(0x80);
    const gs = guest.advanceLocalFrame(0x01);
    if (gs.outgoingInputBatch) host.receiveRemoteInputs(gs.outgoingInputBatch);
    if (hs.outgoingInputBatch) guest.receiveRemoteInputs(hs.outgoingInputBatch);
  }

  assert.equal(core1.computeStateChecksum(), core2.computeStateChecksum());
  assert.equal(host.getMetrics().activeTurnPort, 2);
  assert.equal(guest.getMetrics().activeTurnPort, 2);

  core1.dispose();
  core2.dispose();
});

test('Network sync pulse emits periodically at 1000ms intervals and ignores drift <= 200ms despite static device clock offset', () => {
  const romBytes = createTestInesRom(7);
  const coreHost = new DeterministicMockNesCore();
  coreHost.loadRom(romBytes, 'Contra.nes');

  const engine = new RollbackNetplayEngine(coreHost, 8);
  engine.configureSession({ localPort: 1, initialFrame: 0 });
  engine.setManualInputDelay(0);
  engine.recordRttMs(20); // 10ms one-way latency

  // Pulse emits immediately on first tick, stays quiet at +500ms, emits again at +1000ms
  const step0 = engine.advanceLocalFrame(0x00, 10_000);
  assert.ok(step0.outgoingSyncPulse, 'First tick should emit initial sync pulse');
  assert.equal(step0.outgoingSyncPulse?.pulseId, 1);

  const stepMid = engine.advanceLocalFrame(0x00, 10_000 + Math.floor(SYNC_PULSE_INTERVAL_MS / 2));
  assert.equal(stepMid.outgoingSyncPulse, null, 'Should not emit pulse before interval elapses');

  const stepNext = engine.advanceLocalFrame(0x00, 10_000 + SYNC_PULSE_INTERVAL_MS);
  assert.ok(stepNext.outgoingSyncPulse, 'Should emit next sync pulse once interval elapses');
  assert.equal(stepNext.outgoingSyncPulse?.pulseId, 2);

  // Remote device clock is statically 5 hours ahead, but simulation is only ~2 frames (~33ms) behind
  const fiveHoursMs = 5 * 60 * 60 * 1000;
  const inSyncRes = engine.receiveSyncPulse(
    {
      pulseId: 1,
      port: 2,
      frame: 1,
      sentAtMs: 10_000 + fiveHoursMs,
    },
    10_010
  );
  assert.equal(inSyncRes.alignmentForced, false);
  assert.equal(inSyncRes.action, 'in-sync');
  assert.ok(Math.abs(inSyncRes.driftMs) <= SYNC_PULSE_DRIFT_THRESHOLD_MS);
  assert.equal(engine.getMetrics().clockAligned, true);
  assert.equal(engine.getMetrics().clockAlignmentCount, 0);

  coreHost.dispose();
});

test('Network sync pulse forces clock alignment when local clock drifts >200ms ahead or behind', () => {
  const romBytes = createTestInesRom(8);
  const coreHost = new DeterministicMockNesCore();
  const coreGuest = new DeterministicMockNesCore();
  coreHost.loadRom(romBytes, 'Contra.nes');
  coreGuest.loadRom(romBytes, 'Contra.nes');

  const host = new RollbackNetplayEngine(coreHost, 8);
  const guest = new RollbackNetplayEngine(coreGuest, 8);
  host.configureSession({ localPort: 1, initialFrame: 0 });
  guest.configureSession({ localPort: 2, initialFrame: 0 });
  host.setManualInputDelay(0);
  guest.setManualInputDelay(0);

  // Advance both to frame 30 cleanly
  for (let i = 0; i < 30; i++) {
    const hs = host.advanceLocalFrame(0x01, 20_000 + i * 16);
    const gs = guest.advanceLocalFrame(0x02, 20_000 + i * 16);
    if (gs.outgoingInputBatch) host.receiveRemoteInputs(gs.outgoingInputBatch);
    if (hs.outgoingInputBatch) guest.receiveRemoteInputs(hs.outgoingInputBatch);
  }

  // Case 1: Host receives a pulse showing Guest is 14 frames (~233ms > 200ms) behind -> Host must hold
  const aheadRes = host.receiveSyncPulse(
    {
      pulseId: 10,
      port: 2,
      frame: 16,
      sentAtMs: 20_500,
    },
    20_500
  );
  assert.equal(aheadRes.alignmentForced, true);
  assert.ok(aheadRes.driftMs > SYNC_PULSE_DRIFT_THRESHOLD_MS);
  assert.ok(aheadRes.holdFrames > 0);
  assert.equal(aheadRes.needsAuthoritativeResync, true); // 14 frames > maxRollbackWindow (8)
  assert.equal(aheadRes.action, 'authoritative-resync');
  assert.equal(host.getMetrics().clockAligned, false);
  assert.equal(host.getMetrics().clockAlignmentCount, 1);

  // Next local frame step on Host must honor the clock-alignment hold without advancing frame
  const frameBeforeHold = host.getMetrics().currentFrame;
  const heldStep = host.advanceLocalFrame(0x01, 20_516);
  assert.equal(heldStep.stepped, false);
  assert.equal(heldStep.clockAlignmentHold, true);
  assert.equal(host.getMetrics().currentFrame, frameBeforeHold);

  // Case 2: Guest receives a pulse showing Host is 15 frames (~250ms > 200ms) ahead -> Guest schedules catch-up
  const behindRes = guest.receiveSyncPulse(
    {
      pulseId: 11,
      port: 1,
      frame: 45,
      sentAtMs: 20_500,
    },
    20_500
  );
  assert.equal(behindRes.alignmentForced, true);
  assert.ok(behindRes.driftMs < -SYNC_PULSE_DRIFT_THRESHOLD_MS);
  assert.ok(behindRes.catchUpFrames > 0);
  assert.equal(behindRes.needsAuthoritativeResync, true);
  assert.ok(guest.getPendingClockCatchUpFrames() > 0);

  // Stepping Guest consumes a catch-up frame
  const pendingBefore = guest.getPendingClockCatchUpFrames();
  const catchUpStep = guest.advanceLocalFrame(0x02, 20_516);
  assert.equal(catchUpStep.stepped, true);
  assert.equal(guest.getPendingClockCatchUpFrames(), pendingBefore - 1);

  // Host exports authoritative snapshot to hard-align both clocks and state checksums
  const authSnap = host.exportAuthoritativeSnapshot();
  assert.ok(authSnap);
  const applied = guest.applyAuthoritativeSnapshot({
    frame: authSnap.frame,
    stateJson: authSnap.stateJson,
    checksum: authSnap.checksum,
    romHash: authSnap.romHash,
  });
  assert.equal(applied, true);
  assert.equal(guest.getMetrics().currentFrame, host.getMetrics().currentFrame);
  assert.equal(guest.getMetrics().clockDriftMs, 0);
  assert.equal(guest.getMetrics().clockAligned, true);
  assert.equal(coreHost.computeStateChecksum(), coreGuest.computeStateChecksum());

  coreHost.dispose();
  coreGuest.dispose();
});

test('Network sync pulse detects >200ms relative wall-clock oscillator drift and forces alignment', () => {
  const romBytes = createTestInesRom(9);
  const core = new DeterministicMockNesCore();
  core.loadRom(romBytes, 'Contra.nes');

  const engine = new RollbackNetplayEngine(core, 8);
  engine.configureSession({ localPort: 1, initialFrame: 20 });

  // Anchor baseline wall-clock offset on pulse #1 (0ms relative drift)
  const p1 = engine.receiveSyncPulse(
    { pulseId: 1, port: 2, frame: 20, sentAtMs: 50_000 },
    50_000
  );
  assert.equal(p1.alignmentForced, false);

  // Pulse #2 arrives 260ms skewed relative to baseline oscillator -> forces alignment
  const p2 = engine.receiveSyncPulse(
    { pulseId: 2, port: 2, frame: 20, sentAtMs: 51_000 },
    51_260
  );
  assert.equal(p2.alignmentForced, true);
  assert.equal(p2.action, 'hold-ahead');
  assert.ok(p2.driftMs > SYNC_PULSE_DRIFT_THRESHOLD_MS);
  assert.equal(p2.holdFrames, Math.round(260 / NES_FRAME_MS));

  core.dispose();
});

test('Start/Restart clean reset drops stale pre-reset packets and keeps P1 START immediately responsive', () => {
  const romBytes = createTestInesRom(10);
  const core = new DeterministicMockNesCore();
  core.loadRom(romBytes, 'SuperMarioBros.nes');

  const engine = new RollbackNetplayEngine(core, 8);
  engine.configureSession({ localPort: 1, initialFrame: 0 });
  engine.markInitialSyncReady();

  // Simulate playing 60 frames before hitting Restart
  for (let i = 0; i < 60; i++) {
    engine.receiveRemoteInputs({
      port: 2,
      latestFrame: i,
      inputs: [{ frame: i, mask: 0x00 }],
    });
    engine.advanceLocalFrame(0x01, 1000 + i * 16);
  }
  assert.equal(engine.getMetrics().currentFrame, 60);

  // Clean Restart back to frame 0
  engine.resetTimeline(0);
  engine.markInitialSyncReady();
  assert.equal(engine.getMetrics().currentFrame, 0);
  assert.equal(engine.getMetrics().checksumSyncState, 'verified');
  assert.equal(engine.getMetrics().syncReady, true);

  // Stale in-flight packet from frame 58 arrives right after Restart -> must be ignored
  const staleRes = engine.receiveRemoteInputs({
    port: 2,
    latestFrame: 58,
    inputs: [
      { frame: 57, mask: 0x80 },
      { frame: 58, mask: 0x80 },
    ],
  });
  assert.equal(staleRes.rolledBack, false);
  assert.equal(engine.getMetrics().remoteLatestFrame, 0);

  // P1 presses START (0x10) on title screen -> must step immediately with zero lock/freeze
  engine.setManualInputDelay(0);
  const step0 = engine.advanceLocalFrame(0x10, 5000);
  assert.equal(step0.stepped, true);
  assert.equal(step0.throttled, false);
  assert.equal(step0.frame, 1);
  assert.ok(step0.outgoingInputBatch);
  assert.equal(step0.outgoingInputBatch.inputs.some((entry) => entry.mask === 0x10), true);

  core.dispose();
});

test('Late or dropped remote packets auto-recover after MAX_STALL_TIMEOUT_MS instead of freezing infinitely', () => {
  const romBytes = createTestInesRom(11);
  const core = new DeterministicMockNesCore();
  core.loadRom(romBytes, 'Contra.nes');

  const engine = new RollbackNetplayEngine(core, 8);
  engine.configureSession({ localPort: 1, initialFrame: 0 });
  engine.setManualInputDelay(0);
  engine.markInitialSyncReady();

  // Remote confirms frame 0, then drops completely
  engine.receiveRemoteInputs({
    port: 2,
    latestFrame: 0,
    inputs: [{ frame: 0, mask: 0x00 }],
  });

  // Advance until rollback window advantage (8 frames) triggers stall throttle
  let now = 10_000;
  for (let i = 0; i < 8; i++) {
    const r = engine.advanceLocalFrame(0x01, now);
    assert.equal(r.stepped, true);
    now += 16;
  }

  // Next frame hits advantage >= 8 and throttles while waiting for late packet
  const stalled = engine.advanceLocalFrame(0x10, now);
  assert.equal(stalled.stepped, false);
  assert.equal(stalled.throttled, true);
  assert.equal(stalled.autoRecoveredFromStall, false);

  // Advance clock past MAX_STALL_TIMEOUT_MS -> must auto-recover cleanly and step P1 START
  const recovered = engine.advanceLocalFrame(0x10, now + MAX_STALL_TIMEOUT_MS + 20);
  assert.equal(recovered.stepped, true);
  assert.equal(recovered.throttled, false);
  assert.equal(recovered.autoRecoveredFromStall, true);
  assert.equal(engine.getMetrics().stallRecoveryCount, 1);
  assert.equal(engine.getMetrics().checksumSyncState, 'verified');

  core.dispose();
});

test('Async-saveState FCEUmm core stays Synced / Ready and supports async authoritative snapshots', async () => {
  const romBytes = createTestInesRom(12);
  const baseHost = new DeterministicMockNesCore();
  const baseGuest = new DeterministicMockNesCore();
  baseHost.loadRom(romBytes, 'Contra.nes');
  baseGuest.loadRom(romBytes, 'Contra.nes');

  // Wrap saveState/loadState as Promises to mirror LibretroFceummAdapter (WASM)
  const makeAsyncCore = (inner: DeterministicMockNesCore): INesEmulatorCore => {
    const wrapped = Object.create(inner) as INesEmulatorCore;
    wrapped.saveState = () => Promise.resolve(inner.saveState());
    wrapped.loadState = (payload) => Promise.resolve(inner.loadState(payload));
    return wrapped;
  };

  const asyncHost = makeAsyncCore(baseHost);
  const asyncGuest = makeAsyncCore(baseGuest);

  const hostEngine = new RollbackNetplayEngine(asyncHost, 8);
  const guestEngine = new RollbackNetplayEngine(asyncGuest, 8);
  hostEngine.configureSession({ localPort: 1, initialFrame: 0 });
  guestEngine.configureSession({ localPort: 2, initialFrame: 0 });
  hostEngine.markInitialSyncReady();
  guestEngine.markInitialSyncReady();

  // Step 4 frames, then receive a differing remote button mask on frame 1 (misprediction)
  for (let i = 0; i < 4; i++) {
    hostEngine.advanceLocalFrame(0x10, 20_000 + i * 16);
  }
  const mispredictRes = hostEngine.receiveRemoteInputs({
    port: 2,
    latestFrame: 1,
    inputs: [
      { frame: 0, mask: 0x00 },
      { frame: 1, mask: 0x80 },
    ],
  });
  assert.equal(mispredictRes.needsAuthoritativeResync, false);
  assert.equal(hostEngine.getMetrics().checksumSyncState, 'verified');
  assert.equal(hostEngine.getMetrics().syncReady, true);

  // Async authoritative snapshot export + apply must succeed for async-saveState cores
  const snap = await hostEngine.exportAuthoritativeSnapshotAsync();
  assert.ok(snap);
  assert.equal(snap.frame, hostEngine.getMetrics().currentFrame);

  const applied = await guestEngine.applyAuthoritativeSnapshotAsync({
    frame: snap.frame,
    stateJson: snap.stateJson,
    checksum: snap.checksum,
    romHash: snap.romHash,
  });
  assert.equal(applied, true);
  assert.equal(guestEngine.getMetrics().currentFrame, hostEngine.getMetrics().currentFrame);
  assert.equal(guestEngine.getMetrics().checksumSyncState, 'verified');
  assert.equal(guestEngine.getMetrics().syncReady, true);

  baseHost.dispose();
  baseGuest.dispose();
});

test('150ms+ ping with 0F manual smoothness enforces safe minimum buffer, exposes warning, and prevents loop stall', () => {
  const controller = new AdaptiveDelayController();
  controller.setManualDelay(0);
  // Low ping: 0F is allowed without warning
  controller.recordRttSample(40);
  assert.equal(controller.getActiveDelayFrames(), 0);
  assert.equal(controller.isHighPingSafeFloorActive(), false);
  assert.equal(controller.getHighPingZeroDelayWarning(), null);

  // High ping (180ms >= 150ms): enforces safe minimum floor >= 2F and returns clear warning
  for (let i = 0; i < 10; i++) {
    controller.recordRttSample(180);
  }
  assert.ok((controller.getPingMs() ?? 0) >= HIGH_PING_SAFE_DELAY_THRESHOLD_MS);
  assert.equal(controller.isHighPingSafeFloorActive(), true);
  assert.ok(controller.getActiveDelayFrames() >= 2);
  assert.ok(controller.getHighPingZeroDelayWarning()?.includes('High ping'));
  assert.ok(controller.getHighPingZeroDelayWarning()?.includes('safe'));

  // End-to-end 2-peer simulation at 180ms RTT with user requesting 0F: must keep stepping cleanly
  const romBytes = createTestInesRom(13);
  const coreHost = new DeterministicMockNesCore();
  const coreGuest = new DeterministicMockNesCore();
  coreHost.loadRom(romBytes, 'Contra.nes');
  coreGuest.loadRom(romBytes, 'Contra.nes');

  const host = new RollbackNetplayEngine(coreHost, 8);
  const guest = new RollbackNetplayEngine(coreGuest, 8);
  host.configureSession({ localPort: 1, initialFrame: 0 });
  guest.configureSession({ localPort: 2, initialFrame: 0 });
  host.setManualInputDelay(0);
  guest.setManualInputDelay(0);
  for (let i = 0; i < 8; i++) {
    host.recordRttMs(180);
    guest.recordRttMs(180);
  }

  assert.equal(host.getMetrics().highPingSafeFloorActive, true);
  assert.ok(host.getMetrics().inputDelayFrames >= 2);
  assert.ok(host.getMetrics().highPingDelayWarning);

  type OutgoingBatch = NonNullable<
    ReturnType<RollbackNetplayEngine['advanceLocalFrame']>['outgoingInputBatch']
  >;
  type DelayedBatch = {
    deliverAtFrame: number;
    batch: OutgoingBatch;
  };
  const h2g: DelayedBatch[] = [];
  const g2h: DelayedBatch[] = [];
  const oneWayDelayFrames = 5; // ~83ms one-way (~166ms RTT)
  let hostSteps = 0;
  let guestSteps = 0;

  for (let tick = 0; tick < 60; tick++) {
    const nowMs = 30_000 + tick * 16;
    for (let i = h2g.length - 1; i >= 0; i--) {
      if (h2g[i].deliverAtFrame <= tick) {
        guest.receiveRemoteInputs(h2g[i].batch);
        h2g.splice(i, 1);
      }
    }
    for (let i = g2h.length - 1; i >= 0; i--) {
      if (g2h[i].deliverAtFrame <= tick) {
        host.receiveRemoteInputs(g2h[i].batch);
        g2h.splice(i, 1);
      }
    }

    const hRes = host.advanceLocalFrame(tick % 4 === 0 ? 0x10 : 0x01, nowMs);
    const gRes = guest.advanceLocalFrame(tick % 5 === 0 ? 0x80 : 0x02, nowMs);
    if (hRes.stepped) hostSteps += 1;
    if (gRes.stepped) guestSteps += 1;
    if (hRes.outgoingInputBatch) {
      h2g.push({ deliverAtFrame: tick + oneWayDelayFrames, batch: hRes.outgoingInputBatch });
    }
    if (gRes.outgoingInputBatch) {
      g2h.push({ deliverAtFrame: tick + oneWayDelayFrames, batch: gRes.outgoingInputBatch });
    }
  }

  assert.ok(hostSteps >= 50, `Expected Host to keep stepping cleanly under 180ms RTT, got ${hostSteps}`);
  assert.ok(guestSteps >= 50, `Expected Guest to keep stepping cleanly under 180ms RTT, got ${guestSteps}`);

  coreHost.dispose();
  coreGuest.dispose();
});


