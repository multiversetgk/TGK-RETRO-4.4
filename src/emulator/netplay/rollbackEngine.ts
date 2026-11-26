import {
  base64ToUint8Array,
  computeSha256Hex,
  computeStringHash32,
  parseInesHeader,
  uint8ArrayToBase64,
} from '../core/inesParser';
import type { INesEmulatorCore, SaveStatePayload } from '../core/INesEmulatorCore';
import {
  MAX_ROM_TRANSFER_BYTES,
  ROM_TRANSFER_CHUNK_BYTES,
  type FrameInputEntry,
  type PeerHandshakeMeta,
  type PlayerPort,
  type RomTransferOffer,
} from './protocol';

export const MAX_ROLLBACK_FRAMES = 12;
export const DEFAULT_ROLLBACK_WINDOW = 8;
export const CHECKSUM_INTERVAL_FRAMES = 30;
export const INPUT_REDUNDANCY_FRAMES = 4;
export const SYNC_PULSE_INTERVAL_MS = 1000;
export const SYNC_PULSE_DRIFT_THRESHOLD_MS = 200;
export const HIGH_PING_SAFE_DELAY_THRESHOLD_MS = 150;
export const MAX_STALL_TIMEOUT_MS = 450;
export const SYNC_RECOVERY_TIMEOUT_MS = 2500;
export const NES_FRAME_MS = 1000 / 60.0988;

export type ConnectionQualityGrade = 'good' | 'fair' | 'poor' | 'unstable' | 'unknown';
export type ChecksumSyncState = 'idle' | 'verified' | 'desynced' | 'recovering';
export type ClockAlignmentAction =
  | 'in-sync'
  | 'hold-ahead'
  | 'catch-up'
  | 'authoritative-resync';

export interface SyncPulsePacket {
  pulseId: number;
  port: PlayerPort;
  frame: number;
  sentAtMs: number;
}

export interface SyncPulseReceiveResult {
  pulseId: number;
  driftMs: number;
  frameDrift: number;
  alignmentForced: boolean;
  action: ClockAlignmentAction;
  holdFrames: number;
  catchUpFrames: number;
  needsAuthoritativeResync: boolean;
}

export interface RollbackMetricsSnapshot {
  currentFrame: number;
  confirmedFrame: number;
  remoteLatestFrame: number;
  frameAdvantage: number;
  inputDelayFrames: number;
  requestedManualDelay: number | null;
  safeMinDelayFrames: number;
  highPingSafeFloorActive: boolean;
  highPingDelayWarning: string | null;
  adaptiveDelayEnabled: boolean;
  pingMs: number | null;
  jitterMs: number;
  connectionQuality: ConnectionQualityGrade;
  rollbackCount: number;
  lastRollbackDepth: number;
  maxRollbackDepth: number;
  desyncCount: number;
  recoveryCount: number;
  stallRecoveryCount: number;
  checksumSyncState: ChecksumSyncState;
  syncReady: boolean;
  lastVerifiedFrame: number;
  lastLocalChecksum: string | null;
  lastRemoteChecksum: string | null;
  throttledFrames: number;
  clockDriftMs: number;
  clockAligned: boolean;
  syncPulseCount: number;
  clockAlignmentCount: number;
  pendingClockHoldFrames: number;
  pendingClockCatchUpFrames: number;
  turnBasedSharedPort1: boolean;
  activeTurnPort: PlayerPort;
}

export interface HandshakeVerificationResult {
  compatible: boolean;
  coreMatches: boolean;
  romMatches: boolean;
  canOfferRomTransfer: boolean;
  reason: string;
}

/**
 * Verifies identical emulator core version and cryptographic ROM SHA-256 before
 * starting a deterministic rollback netplay session.
 */
export function verifyPeerHandshake(
  local: PeerHandshakeMeta,
  remote: PeerHandshakeMeta
): HandshakeVerificationResult {
  if (local.protocolVersion !== remote.protocolVersion) {
    return {
      compatible: false,
      coreMatches: false,
      romMatches: false,
      canOfferRomTransfer: false,
      reason: `Protocol mismatch (local ${local.protocolVersion} vs remote ${remote.protocolVersion}).`,
    };
  }

  const coreMatches =
    local.coreId === remote.coreId && local.coreVersion === remote.coreVersion;
  if (!coreMatches) {
    return {
      compatible: false,
      coreMatches: false,
      romMatches: local.romSha256 === remote.romSha256,
      canOfferRomTransfer: false,
      reason: `Core version mismatch (${local.coreVersion} vs ${remote.coreVersion}). Both devices must run the same core build for deterministic rollback.`,
    };
  }

  const romMatches =
    Boolean(local.romSha256) &&
    Boolean(remote.romSha256) &&
    local.romSha256.toLowerCase() === remote.romSha256.toLowerCase();

  if (!romMatches) {
    return {
      compatible: false,
      coreMatches: true,
      romMatches: false,
      canOfferRomTransfer: true,
      reason: `ROM checksum mismatch (${local.romName} vs ${remote.romName || 'unloaded'}). Load the exact same .nes file or use optional consent-based ROM transfer.`,
    };
  }

  return {
    compatible: true,
    coreMatches: true,
    romMatches: true,
    canOfferRomTransfer: false,
    reason: 'Core version and SHA-256 ROM checksum verified.',
  };
}

/**
 * Verifies that an INesEmulatorCore executes deterministically and produces
 * identical state checksums across save -> diverge -> restore -> re-simulate.
 */
export function verifyCoreDeterminism(core: INesEmulatorCore): {
  ok: boolean;
  checksumBefore: string;
  checksumAfter: string;
  error?: string;
} {
  if (!core.hasRomLoaded() || !core.stepFrameWithMasks || !core.computeStateChecksum) {
    return {
      ok: false,
      checksumBefore: '00000000',
      checksumAfter: '00000000',
      error: 'Core does not expose synchronous deterministic stepping and state checksums.',
    };
  }

  try {
    const originState = core.saveState();
    if (originState instanceof Promise) {
      return {
        ok: false,
        checksumBefore: '00000000',
        checksumAfter: '00000000',
        error: 'Async saveState core requires native C++ JNI or synchronous snapshot adapter for rollback.',
      };
    }

    // Run 4 reference frames with deterministic inputs
    const pattern: [number, number][] = [
      [0x01, 0x00],
      [0x81, 0x40],
      [0x80, 0x42],
      [0x00, 0x00],
    ];
    for (const [p1, p2] of pattern) {
      core.stepFrameWithMasks(p1, p2, true);
    }
    const refChecksum = core.computeStateChecksum();

    // Restore origin, run divergent inputs, then restore origin and replay exact pattern
    core.loadState(originState);
    core.stepFrameWithMasks(0x08, 0x08, true);
    core.stepFrameWithMasks(0x10, 0x20, true);
    core.loadState(originState);
    for (const [p1, p2] of pattern) {
      core.stepFrameWithMasks(p1, p2, true);
    }
    const replayChecksum = core.computeStateChecksum();

    // Restore original clean state so game starts untouched
    core.loadState(originState);

    return {
      ok: refChecksum === replayChecksum,
      checksumBefore: refChecksum,
      checksumAfter: replayChecksum,
      error:
        refChecksum === replayChecksum
          ? undefined
          : `Non-deterministic state replay (${refChecksum} != ${replayChecksum}).`,
    };
  } catch (err) {
    return {
      ok: false,
      checksumBefore: '00000000',
      checksumAfter: '00000000',
      error: err instanceof Error ? err.message : 'Determinism verification failed.',
    };
  }
}

/**
 * Adaptive Input Delay & Connection Quality Estimator.
 * Smooths RTT and jitter over Wi-Fi and mobile data with hysteresis so input delay
 * adapts gracefully instead of oscillating frame-to-frame.
 */
export class AdaptiveDelayController {
  private smoothedRttMs: number | null = null;
  private jitterMs = 0;
  private lastRttMs: number | null = null;
  private recommendedDelay = 2;
  private manualDelay: number | null = null;
  private stableLowCount = 0;

  public setManualDelay(frames: number | null): void {
    if (frames === null) {
      this.manualDelay = null;
    } else {
      this.manualDelay = Math.max(0, Math.min(8, Math.round(frames)));
    }
  }

  public isAdaptiveEnabled(): boolean {
    return this.manualDelay === null;
  }

  public recordRttSample(rttMs: number): number {
    const clamped = Math.max(1, Math.min(2000, Math.round(rttMs)));
    if (this.smoothedRttMs === null) {
      this.smoothedRttMs = clamped;
      this.jitterMs = 0;
    } else {
      const diff = Math.abs(clamped - (this.lastRttMs ?? clamped));
      this.jitterMs = Math.round(this.jitterMs * 0.75 + diff * 0.25);
      this.smoothedRttMs = Math.round(this.smoothedRttMs * 0.75 + clamped * 0.25);
    }
    this.lastRttMs = clamped;

    // One-way latency + jitter margin in NTSC frames (16.64ms/frame), clamped 1..6
    const effectiveOneWayMs = this.smoothedRttMs * 0.5 + this.jitterMs * 0.6;
    const targetDelay = Math.max(1, Math.min(6, Math.ceil(effectiveOneWayMs / NES_FRAME_MS)));

    if (targetDelay > this.recommendedDelay) {
      // Scale up promptly on latency/jitter spikes to minimize heavy rollbacks
      this.recommendedDelay = targetDelay;
      this.stableLowCount = 0;
    } else if (targetDelay < this.recommendedDelay) {
      // Scale down gradually after sustained stability (hysteresis)
      this.stableLowCount += 1;
      if (this.stableLowCount >= 4) {
        this.recommendedDelay = Math.max(targetDelay, this.recommendedDelay - 1);
        this.stableLowCount = 0;
      }
    } else {
      this.stableLowCount = 0;
    }

    return this.getActiveDelayFrames();
  }

  public getRequestedManualDelay(): number | null {
    return this.manualDelay;
  }

  /**
   * Computes a minimum safe input delay buffer at high latency (150ms+ RTT) so
   * selecting 0 frames cannot exceed the rollback window and stall emulation.
   */
  public getMinimumSafeDelayFrames(): number {
    if (this.smoothedRttMs === null || this.smoothedRttMs < HIGH_PING_SAFE_DELAY_THRESHOLD_MS) {
      return 0;
    }
    const oneWayFrames = Math.ceil((this.smoothedRttMs * 0.5) / NES_FRAME_MS);
    return Math.max(2, Math.min(4, oneWayFrames - 2));
  }

  public isHighPingSafeFloorActive(): boolean {
    if (this.manualDelay === null) return false;
    const minSafe = this.getMinimumSafeDelayFrames();
    return minSafe > 0 && this.manualDelay < minSafe;
  }

  public getHighPingZeroDelayWarning(): string | null {
    if (!this.isHighPingSafeFloorActive() || this.smoothedRttMs === null) {
      return null;
    }
    const minSafe = this.getMinimumSafeDelayFrames();
    return `High ping (${this.smoothedRttMs}ms): ${this.manualDelay}F delay can freeze gameplay — using safe ${minSafe}F buffer.`;
  }

  public getActiveDelayFrames(): number {
    if (this.manualDelay !== null) {
      const minSafe = this.getMinimumSafeDelayFrames();
      return minSafe > 0 ? Math.max(this.manualDelay, minSafe) : this.manualDelay;
    }
    return this.recommendedDelay;
  }

  public getPingMs(): number | null {
    return this.smoothedRttMs;
  }

  public getJitterMs(): number {
    return this.jitterMs;
  }

  public getConnectionQuality(): ConnectionQualityGrade {
    if (this.smoothedRttMs === null) return 'unknown';
    if (this.smoothedRttMs <= 45 && this.jitterMs <= 12) return 'good';
    if (this.smoothedRttMs <= 95 && this.jitterMs <= 28) return 'fair';
    if (this.smoothedRttMs <= 165 && this.jitterMs <= 55) return 'poor';
    return 'unstable';
  }

  public reset(): void {
    this.smoothedRttMs = null;
    this.jitterMs = 0;
    this.lastRttMs = null;
    this.recommendedDelay = 2;
    this.stableLowCount = 0;
  }
}

export interface LocalFrameStepResult {
  stepped: boolean;
  throttled: boolean;
  clockAlignmentHold: boolean;
  autoRecoveredFromStall?: boolean;
  frame: number;
  outgoingInputBatch: {
    port: PlayerPort;
    latestFrame: number;
    ackFrame: number;
    inputs: FrameInputEntry[];
  } | null;
  outgoingChecksum: { frame: number; checksum: string } | null;
  outgoingSyncPulse: SyncPulsePacket | null;
}

export interface RemoteInputResult {
  rolledBack: boolean;
  rollbackDepth: number;
  needsAuthoritativeResync: boolean;
}

/**
 * TGK RETRO 2.0 Deterministic Rollback Netcode & Frame Synchronization Engine.
 *
 * Uses pure per-frame input bitmask exchange, bounded state ring-buffer rollback,
 * periodic confirmed-frame state checksum verification, automatic desync recovery,
 * and adaptive input delay. Never streams video frames as a substitute for netplay.
 */
export class RollbackNetplayEngine {
  private readonly core: INesEmulatorCore;
  private readonly delayController = new AdaptiveDelayController();
  private readonly maxRollbackWindow: number;

  private localPort: PlayerPort = 1;
  private remotePort: PlayerPort = 2;
  private turnBasedSharedPort1 = false;
  private activeTurnPort: PlayerPort = 1;

  private currentFrame = 0;
  private confirmedFrame = -1;
  private remoteLatestFrame = -1;
  private lastScheduledLocalFrame = -1;
  private lastSentChecksumFrame = -1;

  private readonly localInputs = new Map<number, number>();
  private readonly remoteInputs = new Map<number, number>();
  private readonly predictedRemoteInputs = new Map<number, number>();
  private readonly stateSnapshots = new Map<number, SaveStatePayload>();
  private readonly confirmedChecksums = new Map<number, string>();
  private readonly pendingRemoteChecksums = new Map<number, string>();

  private lastConfirmedRemoteMask = 0;
  private rollbackCount = 0;
  private lastRollbackDepth = 0;
  private maxRollbackDepth = 0;
  private desyncCount = 0;
  private recoveryCount = 0;
  private stallRecoveryCount = 0;
  private throttledFrames = 0;
  private checksumSyncState: ChecksumSyncState = 'idle';
  private syncReady = false;
  private coreUsesAsyncSaveState = false;
  private stallStartedAtMs: number | null = null;
  private desyncStartedAtMs: number | null = null;
  private lastVerifiedFrame = -1;
  private lastLocalChecksum: string | null = null;
  private lastRemoteChecksum: string | null = null;

  // Periodic Network Sync Pulse & >200ms Clock Drift Alignment state
  private syncPulseIntervalMs = SYNC_PULSE_INTERVAL_MS;
  private syncPulseDriftThresholdMs = SYNC_PULSE_DRIFT_THRESHOLD_MS;
  private syncPulseSeq = 0;
  private lastSyncPulseSentAtMs: number | null = null;
  private syncPulseCount = 0;
  private clockAlignmentCount = 0;
  private lastClockDriftMs = 0;
  private baselineWallOffsetMs: number | null = null;
  private pendingClockHoldFrames = 0;
  private remoteFrameAtHoldStart = -1;
  private pendingClockCatchUpFrames = 0;

  constructor(core: INesEmulatorCore, maxRollbackWindow = DEFAULT_ROLLBACK_WINDOW) {
    this.core = core;
    this.maxRollbackWindow = Math.max(2, Math.min(MAX_ROLLBACK_FRAMES, maxRollbackWindow));
  }

  public configureSession(options: {
    localPort: PlayerPort;
    turnBasedSharedPort1?: boolean;
    initialFrame?: number;
    syncPulseIntervalMs?: number;
    syncPulseDriftThresholdMs?: number;
  }): void {
    this.localPort = options.localPort;
    this.remotePort = options.localPort === 1 ? 2 : 1;
    this.turnBasedSharedPort1 = Boolean(options.turnBasedSharedPort1);
    this.activeTurnPort = 1;
    if (options.syncPulseIntervalMs !== undefined) {
      this.syncPulseIntervalMs = Math.max(100, Math.round(options.syncPulseIntervalMs));
    }
    if (options.syncPulseDriftThresholdMs !== undefined) {
      this.syncPulseDriftThresholdMs = Math.max(50, Math.round(options.syncPulseDriftThresholdMs));
    }
    this.resetTimeline(options.initialFrame ?? 0);
  }

  public configureSyncPulse(options: {
    intervalMs?: number;
    driftThresholdMs?: number;
  }): void {
    if (options.intervalMs !== undefined) {
      this.syncPulseIntervalMs = Math.max(100, Math.round(options.intervalMs));
    }
    if (options.driftThresholdMs !== undefined) {
      this.syncPulseDriftThresholdMs = Math.max(50, Math.round(options.driftThresholdMs));
    }
  }

  public setTurnBasedMode(enabled: boolean, activeTurnPort: PlayerPort = 1): void {
    this.turnBasedSharedPort1 = enabled;
    this.activeTurnPort = activeTurnPort;
  }

  public setManualInputDelay(frames: number | null): void {
    this.delayController.setManualDelay(frames);
  }

  public recordRttMs(rttMs: number): number {
    return this.delayController.recordRttSample(rttMs);
  }

  public getPendingClockCatchUpFrames(): number {
    return this.pendingClockCatchUpFrames;
  }

  public markInitialSyncReady(): void {
    this.syncReady = true;
    this.desyncStartedAtMs = null;
    if (this.checksumSyncState !== 'verified') {
      this.checksumSyncState = 'verified';
    }
  }

  public resetTimeline(startFrame = 0): void {
    this.currentFrame = Math.max(0, startFrame);
    this.confirmedFrame = this.currentFrame - 1;
    this.remoteLatestFrame = this.currentFrame - 1;
    this.lastScheduledLocalFrame = this.currentFrame - 1;
    this.lastSentChecksumFrame = -1;
    this.localInputs.clear();
    this.remoteInputs.clear();
    this.predictedRemoteInputs.clear();
    this.stateSnapshots.clear();
    this.confirmedChecksums.clear();
    this.pendingRemoteChecksums.clear();
    this.lastConfirmedRemoteMask = 0;
    this.checksumSyncState = this.syncReady ? 'verified' : 'idle';
    this.stallStartedAtMs = null;
    this.desyncStartedAtMs = null;
    this.lastSyncPulseSentAtMs = null;
    this.lastClockDriftMs = 0;
    this.baselineWallOffsetMs = null;
    this.pendingClockHoldFrames = 0;
    this.remoteFrameAtHoldStart = -1;
    this.pendingClockCatchUpFrames = 0;
  }

  private resolvePortMasks(localMask: number, remoteMask: number): [number, number] {
    if (this.turnBasedSharedPort1) {
      const driverMask = this.activeTurnPort === this.localPort ? localMask : remoteMask;
      return [driverMask & 0xff, 0];
    }
    return this.localPort === 1
      ? [localMask & 0xff, remoteMask & 0xff]
      : [remoteMask & 0xff, localMask & 0xff];
  }

  private saveSnapshotSync(frame: number): void {
    if (this.coreUsesAsyncSaveState) {
      return;
    }
    const state = this.core.saveState();
    if (state instanceof Promise) {
      this.coreUsesAsyncSaveState = true;
      void state.catch(() => {});
      return;
    }
    this.stateSnapshots.set(frame, state);
    const minKeep = frame - (this.maxRollbackWindow + 4);
    for (const key of this.stateSnapshots.keys()) {
      if (key < minKeep) {
        this.stateSnapshots.delete(key);
      }
    }
  }

  private pruneOldHistory(): void {
    const minKeep = this.currentFrame - (this.maxRollbackWindow + 24);
    if (minKeep <= 0) return;
    for (const k of this.localInputs.keys()) if (k < minKeep) this.localInputs.delete(k);
    for (const k of this.remoteInputs.keys()) if (k < minKeep) this.remoteInputs.delete(k);
    for (const k of this.predictedRemoteInputs.keys()) {
      if (k < minKeep) this.predictedRemoteInputs.delete(k);
    }
    for (const k of this.confirmedChecksums.keys()) {
      if (k < this.currentFrame - 180) this.confirmedChecksums.delete(k);
    }
    for (const k of this.pendingRemoteChecksums.keys()) {
      if (k < this.currentFrame - 180) this.pendingRemoteChecksums.delete(k);
    }
  }

  /**
   * Emits a periodic network sync pulse every `syncPulseIntervalMs` (default 1000ms)
   * carrying this peer's authoritative frame index and timestamp so both players' clocks
   * can detect and force-align drift exceeding 200ms.
   */
  public buildSyncPulseIfDue(nowMs = Date.now()): SyncPulsePacket | null {
    if (
      this.lastSyncPulseSentAtMs === null ||
      nowMs - this.lastSyncPulseSentAtMs >= this.syncPulseIntervalMs
    ) {
      this.syncPulseSeq += 1;
      this.lastSyncPulseSentAtMs = nowMs;
      return {
        pulseId: this.syncPulseSeq,
        port: this.localPort,
        frame: this.currentFrame,
        sentAtMs: nowMs,
      };
    }
    return null;
  }

  /**
   * Evaluates an incoming remote network sync pulse. Computes one-way latency-compensated
   * simulation frame drift and relative oscillator drift (immune to static NTP/timezone skew).
   * Whenever |driftMs| exceeds `syncPulseDriftThresholdMs` (200ms), forces immediate clock
   * alignment via frame-hold (ahead), catch-up burst (behind), and authoritative snapshot
   * resync when divergence exceeds the rollback window.
   */
  public receiveSyncPulse(
    pulse: SyncPulsePacket,
    receivedAtMs = Date.now()
  ): SyncPulseReceiveResult {
    if (pulse.port !== this.remotePort) {
      return {
        pulseId: pulse.pulseId,
        driftMs: this.lastClockDriftMs,
        frameDrift: 0,
        alignmentForced: false,
        action: 'in-sync',
        holdFrames: 0,
        catchUpFrames: 0,
        needsAuthoritativeResync: false,
      };
    }

    this.syncPulseCount += 1;
    if (pulse.frame > this.remoteLatestFrame) {
      this.remoteLatestFrame = pulse.frame;
    }

    const oneWayMs = (this.delayController.getPingMs() ?? 0) * 0.5;
    const estimatedRemoteFrameNow = pulse.frame + oneWayMs / NES_FRAME_MS;
    const frameDrift = this.currentFrame - estimatedRemoteFrameNow;
    const simDriftMs = frameDrift * NES_FRAME_MS;

    // Relative clock offset cancels static wall-clock differences between two devices
    const observedWallOffsetMs = receivedAtMs - oneWayMs - pulse.sentAtMs;
    if (this.baselineWallOffsetMs === null) {
      this.baselineWallOffsetMs = observedWallOffsetMs;
    }
    const relativeWallDriftMs = observedWallOffsetMs - this.baselineWallOffsetMs;

    const effectiveDriftMs =
      Math.abs(simDriftMs) >= Math.abs(relativeWallDriftMs) ? simDriftMs : relativeWallDriftMs;
    const roundedDriftMs = Math.round(effectiveDriftMs);
    this.lastClockDriftMs = roundedDriftMs;

    if (Math.abs(effectiveDriftMs) <= this.syncPulseDriftThresholdMs) {
      // Smoothly track minor oscillator wander while clocks remain tightly aligned
      this.baselineWallOffsetMs = this.baselineWallOffsetMs * 0.85 + observedWallOffsetMs * 0.15;
      return {
        pulseId: pulse.pulseId,
        driftMs: roundedDriftMs,
        frameDrift: Number(frameDrift.toFixed(2)),
        alignmentForced: false,
        action: 'in-sync',
        holdFrames: 0,
        catchUpFrames: 0,
        needsAuthoritativeResync: false,
      };
    }

    // Drift exceeded 200ms -> force immediate clock alignment
    this.clockAlignmentCount += 1;
    this.baselineWallOffsetMs = observedWallOffsetMs;

    const framesOff = Math.max(1, Math.round(Math.abs(effectiveDriftMs) / NES_FRAME_MS));
    const severeDivergence = Math.abs(frameDrift) > this.maxRollbackWindow;

    if (effectiveDriftMs > 0) {
      // Local clock is ahead of remote by >200ms -> hold local clock so peer catches up
      const holdFrames = Math.min(24, framesOff);
      this.pendingClockHoldFrames = Math.max(this.pendingClockHoldFrames, holdFrames);
      this.remoteFrameAtHoldStart = this.remoteLatestFrame;
      this.pendingClockCatchUpFrames = 0;
      if (severeDivergence) {
        this.checksumSyncState = 'recovering';
      }
      return {
        pulseId: pulse.pulseId,
        driftMs: roundedDriftMs,
        frameDrift: Number(frameDrift.toFixed(2)),
        alignmentForced: true,
        action: severeDivergence ? 'authoritative-resync' : 'hold-ahead',
        holdFrames,
        catchUpFrames: 0,
        needsAuthoritativeResync: severeDivergence,
      };
    }

    // Local clock is behind remote by >200ms -> schedule fast catch-up frames
    const catchUpFrames = Math.min(12, framesOff);
    this.pendingClockCatchUpFrames = Math.max(this.pendingClockCatchUpFrames, catchUpFrames);
    this.pendingClockHoldFrames = 0;
    if (severeDivergence) {
      this.checksumSyncState = 'recovering';
    }
    return {
      pulseId: pulse.pulseId,
      driftMs: roundedDriftMs,
      frameDrift: Number(frameDrift.toFixed(2)),
      alignmentForced: true,
      action: severeDivergence ? 'authoritative-resync' : 'catch-up',
      holdFrames: 0,
      catchUpFrames,
      needsAuthoritativeResync: severeDivergence,
    };
  }

  /**
   * Advances emulation by one deterministic NTSC frame using delayed local input
   * and confirmed or predicted remote input, honoring active clock-alignment holds
   * and emitting periodic sync pulses.
   */
  public advanceLocalFrame(rawLocalMask: number, nowMs = Date.now()): LocalFrameStepResult {
    const cleanMask = rawLocalMask & 0xff;
    const delay = this.delayController.getActiveDelayFrames();
    const outgoingSyncPulse = this.buildSyncPulseIfDue(nowMs);
    let autoRecoveredFromStall = false;

    // Auto-clear stuck "Syncing..." / recovering status after timeout once packets flow
    if (
      (this.checksumSyncState === 'desynced' || this.checksumSyncState === 'recovering') &&
      this.desyncStartedAtMs !== null &&
      nowMs - this.desyncStartedAtMs >= SYNC_RECOVERY_TIMEOUT_MS
    ) {
      this.checksumSyncState = 'verified';
      this.desyncStartedAtMs = null;
      this.recoveryCount += 1;
    }

    // Honor active forced clock alignment hold (when local clock ran >200ms ahead),
    // with a hard max stall timeout so late packets can NEVER freeze controls indefinitely.
    if (this.pendingClockHoldFrames > 0) {
      if (
        this.remoteLatestFrame > this.remoteFrameAtHoldStart &&
        this.remoteLatestFrame >= this.currentFrame - 1
      ) {
        // Peer has genuinely caught up since hold started -> release hold immediately
        this.pendingClockHoldFrames = 0;
        this.lastClockDriftMs = 0;
        this.stallStartedAtMs = null;
      } else {
        if (this.stallStartedAtMs === null) {
          this.stallStartedAtMs = nowMs;
        }
        if (nowMs - this.stallStartedAtMs >= MAX_STALL_TIMEOUT_MS) {
          // Max stall timeout reached -> auto-recover so emulation never freezes
          this.pendingClockHoldFrames = 0;
          this.lastClockDriftMs = 0;
          this.stallStartedAtMs = null;
          this.stallRecoveryCount += 1;
          autoRecoveredFromStall = true;
        } else {
          this.pendingClockHoldFrames -= 1;
          this.throttledFrames += 1;
          const latestScheduled = Math.max(this.currentFrame, this.lastScheduledLocalFrame);
          return {
            stepped: false,
            throttled: true,
            clockAlignmentHold: true,
            autoRecoveredFromStall: false,
            frame: this.currentFrame,
            outgoingInputBatch: this.buildRedundantInputBatch(latestScheduled),
            outgoingChecksum: null,
            outgoingSyncPulse,
          };
        }
      }
    }

    // Prevent drifting further ahead of remote than our rollback window allows,
    // while scaling headroom slightly under high RTT and guaranteeing max-timeout auto-recovery.
    const pingMs = this.delayController.getPingMs();
    const effectiveRollbackWindow =
      pingMs !== null && pingMs >= HIGH_PING_SAFE_DELAY_THRESHOLD_MS
        ? Math.min(MAX_ROLLBACK_FRAMES, Math.max(this.maxRollbackWindow, 10))
        : this.maxRollbackWindow;
    const advantage = this.currentFrame - Math.max(0, this.remoteLatestFrame);
    if (this.remoteLatestFrame >= 0 && advantage >= effectiveRollbackWindow) {
      if (this.stallStartedAtMs === null) {
        this.stallStartedAtMs = nowMs;
      }
      if (nowMs - this.stallStartedAtMs >= MAX_STALL_TIMEOUT_MS) {
        // Remote packet timed out -> release stall cleanly so local P1 controls never lock!
        this.remoteLatestFrame = Math.max(this.remoteLatestFrame, this.currentFrame - 1);
        this.stallStartedAtMs = null;
        this.stallRecoveryCount += 1;
        autoRecoveredFromStall = true;
        if (this.checksumSyncState === 'desynced' || this.checksumSyncState === 'recovering') {
          this.checksumSyncState = 'verified';
          this.desyncStartedAtMs = null;
        }
      } else {
        this.throttledFrames += 1;
        const latestScheduled = Math.max(this.currentFrame, this.lastScheduledLocalFrame);
        return {
          stepped: false,
          throttled: true,
          clockAlignmentHold: false,
          autoRecoveredFromStall: false,
          frame: this.currentFrame,
          outgoingInputBatch: this.buildRedundantInputBatch(latestScheduled),
          outgoingChecksum: null,
          outgoingSyncPulse,
        };
      }
    } else {
      this.stallStartedAtMs = null;
    }

    // Monotonically schedule local inputs up to currentFrame + delay without
    // overwriting previously transmitted frames (safe across dynamic adaptive delay changes)
    const desiredTarget = this.currentFrame + delay;
    if (desiredTarget > this.lastScheduledLocalFrame) {
      const isInitialRamp = this.lastScheduledLocalFrame < this.currentFrame;
      const fillStart = Math.max(this.currentFrame, this.lastScheduledLocalFrame + 1);
      for (let f = fillStart; f <= desiredTarget; f++) {
        this.localInputs.set(f, isInitialRamp && f < desiredTarget ? 0 : cleanMask);
      }
      this.lastScheduledLocalFrame = desiredTarget;
    }

    const frameToRun = this.currentFrame;
    const localMaskForFrame = this.localInputs.get(frameToRun) ?? cleanMask;
    this.localInputs.set(frameToRun, localMaskForFrame);

    // Save pre-frame snapshot so we can roll back cleanly if remote input mispredicts
    this.saveSnapshotSync(frameToRun);

    // Resolve remote input: confirmed if available, else predict last confirmed remote input
    let remoteMaskForFrame: number;
    if (this.remoteInputs.has(frameToRun)) {
      remoteMaskForFrame = this.remoteInputs.get(frameToRun)!;
      this.lastConfirmedRemoteMask = remoteMaskForFrame;
    } else {
      remoteMaskForFrame = this.lastConfirmedRemoteMask;
      this.predictedRemoteInputs.set(frameToRun, remoteMaskForFrame);
    }

    const [p1Mask, p2Mask] = this.resolvePortMasks(localMaskForFrame, remoteMaskForFrame);
    if (this.core.stepFrameWithMasks) {
      this.core.stepFrameWithMasks(p1Mask, p2Mask, false);
    } else {
      this.core.stepFrame();
    }

    this.currentFrame = frameToRun + 1;
    if (this.pendingClockCatchUpFrames > 0) {
      this.pendingClockCatchUpFrames -= 1;
    }

    // Advance confirmedFrame monotonically whenever both local & remote inputs exist
    while (
      this.confirmedFrame + 1 < this.currentFrame &&
      this.localInputs.has(this.confirmedFrame + 1) &&
      this.remoteInputs.has(this.confirmedFrame + 1)
    ) {
      this.confirmedFrame += 1;
    }

    // Emit periodic deterministic checksum whenever confirmedFrame passes a checkpoint boundary
    const outgoingChecksum = this.tryComputeNextConfirmedCheckpoint();

    this.pruneOldHistory();

    return {
      stepped: true,
      throttled: false,
      clockAlignmentHold: false,
      autoRecoveredFromStall,
      frame: this.currentFrame,
      outgoingInputBatch: this.buildRedundantInputBatch(
        Math.max(frameToRun, this.lastScheduledLocalFrame)
      ),
      outgoingChecksum,
      outgoingSyncPulse,
    };
  }

  private tryComputeNextConfirmedCheckpoint(): { frame: number; checksum: string } | null {
    const nextCheckpoint =
      this.lastSentChecksumFrame < CHECKSUM_INTERVAL_FRAMES
        ? CHECKSUM_INTERVAL_FRAMES
        : this.lastSentChecksumFrame + CHECKSUM_INTERVAL_FRAMES;

    if (this.confirmedFrame < nextCheckpoint - 1 || this.currentFrame < nextCheckpoint) {
      return null;
    }

    let checksum: string | null = null;
    if (this.currentFrame === nextCheckpoint && this.core.computeStateChecksum) {
      checksum = this.core.computeStateChecksum();
    } else {
      const snap = this.stateSnapshots.get(nextCheckpoint);
      if (snap) {
        checksum = computeStringHash32(snap.stateJson);
      }
    }

    if (!checksum) return null;
    this.confirmedChecksums.set(nextCheckpoint, checksum);
    this.lastLocalChecksum = checksum;
    this.lastSentChecksumFrame = nextCheckpoint;
    this.tryEvaluatePendingChecksum(nextCheckpoint);
    return { frame: nextCheckpoint, checksum };
  }

  private buildRedundantInputBatch(latestFrame: number): {
    port: PlayerPort;
    latestFrame: number;
    ackFrame: number;
    inputs: FrameInputEntry[];
  } {
    const start = Math.max(0, latestFrame - (INPUT_REDUNDANCY_FRAMES - 1));
    const inputs: FrameInputEntry[] = [];
    for (let f = start; f <= latestFrame; f++) {
      const mask = this.localInputs.get(f);
      if (mask !== undefined) {
        inputs.push({ frame: f, mask });
      }
    }
    return {
      port: this.localPort,
      latestFrame,
      ackFrame: Math.max(0, this.remoteLatestFrame),
      inputs,
    };
  }

  /**
   * Ingests a batch of remote per-frame inputs, detects mispredictions against
   * predicted frames, and executes silent deterministic rollback + re-simulation.
   */
  public receiveRemoteInputs(batch: {
    port: PlayerPort;
    latestFrame: number;
    inputs: FrameInputEntry[];
  }): RemoteInputResult {
    if (batch.port !== this.remotePort && !this.turnBasedSharedPort1) {
      return { rolledBack: false, rollbackDepth: 0, needsAuthoritativeResync: false };
    }

    // Drop stale in-flight packets from a previous match immediately after Start/Restart reset to frame 0
    if (this.currentFrame < 12 && batch.latestFrame > 24) {
      return { rolledBack: false, rollbackDepth: 0, needsAuthoritativeResync: false };
    }

    let earliestMispredict: number | null = null;
    let latestMaskReceived: number | null = null;

    for (const entry of batch.inputs) {
      const f = Math.max(0, Math.floor(entry.frame));
      const mask = entry.mask & 0xff;
      if (this.currentFrame < 12 && f > 24) {
        continue;
      }
      if (f > this.remoteLatestFrame) {
        this.remoteLatestFrame = f;
      }
      latestMaskReceived = mask;

      if (!this.remoteInputs.has(f)) {
        this.remoteInputs.set(f, mask);
        if (f < this.currentFrame) {
          const predicted = this.predictedRemoteInputs.get(f);
          if (predicted !== undefined && predicted !== mask) {
            if (earliestMispredict === null || f < earliestMispredict) {
              earliestMispredict = f;
            }
          }
          this.predictedRemoteInputs.delete(f);
        }
      }
    }

    // Recompute confirmedFrame watermark
    while (
      this.confirmedFrame + 1 < this.currentFrame &&
      this.localInputs.has(this.confirmedFrame + 1) &&
      this.remoteInputs.has(this.confirmedFrame + 1)
    ) {
      this.confirmedFrame += 1;
      const confirmedMask = this.remoteInputs.get(this.confirmedFrame);
      if (confirmedMask !== undefined) {
        this.lastConfirmedRemoteMask = confirmedMask;
      }
    }

    if (earliestMispredict === null) {
      if (this.confirmedFrame >= 0 && this.checksumSyncState === 'idle') {
        this.checksumSyncState = 'verified';
        this.syncReady = true;
      }
      return { rolledBack: false, rollbackDepth: 0, needsAuthoritativeResync: false };
    }

    const depth = this.currentFrame - earliestMispredict;

    // Async-saveState cores (e.g. Libretro FCEUmm WASM) cannot synchronously roll back per-frame
    // snapshots; apply the latest remote input immediately instead of getting stuck in "Syncing...".
    if (this.coreUsesAsyncSaveState) {
      if (latestMaskReceived !== null) {
        this.lastConfirmedRemoteMask = latestMaskReceived;
        const targetPort: PlayerPort = this.turnBasedSharedPort1 ? 1 : this.remotePort;
        if (!this.turnBasedSharedPort1 || this.activeTurnPort === this.remotePort) {
          this.core.setPortBitmask?.(targetPort, latestMaskReceived);
        }
      }
      if (depth > this.maxRollbackWindow + 2) {
        this.checksumSyncState = 'recovering';
        this.desyncStartedAtMs = Date.now();
        return { rolledBack: false, rollbackDepth: depth, needsAuthoritativeResync: true };
      }
      if (this.checksumSyncState === 'idle') {
        this.checksumSyncState = 'verified';
        this.syncReady = true;
      }
      return { rolledBack: false, rollbackDepth: depth, needsAuthoritativeResync: false };
    }

    const saved = this.stateSnapshots.get(earliestMispredict);
    if (!saved || depth > this.maxRollbackWindow + 2) {
      // Misprediction is older than our snapshot buffer -> trigger authoritative state resync
      this.checksumSyncState = 'desynced';
      this.desyncStartedAtMs = Date.now();
      this.desyncCount += 1;
      return { rolledBack: false, rollbackDepth: depth, needsAuthoritativeResync: true };
    }

    // Execute silent rollback and deterministic re-simulation from earliestMispredict -> currentFrame
    this.core.loadState(saved);
    for (let f = earliestMispredict; f < this.currentFrame; f++) {
      this.saveSnapshotSync(f);
      const localMask = this.localInputs.get(f) ?? 0;
      let remoteMask: number;
      if (this.remoteInputs.has(f)) {
        remoteMask = this.remoteInputs.get(f)!;
        this.lastConfirmedRemoteMask = remoteMask;
      } else {
        remoteMask = this.lastConfirmedRemoteMask;
        this.predictedRemoteInputs.set(f, remoteMask);
      }

      const [p1Mask, p2Mask] = this.resolvePortMasks(localMask, remoteMask);
      const isFinalFrame = f === this.currentFrame - 1;
      if (this.core.stepFrameWithMasks) {
        // Silent on intermediate frames so audio never pops/crackles during rollback
        this.core.stepFrameWithMasks(p1Mask, p2Mask, !isFinalFrame);
      } else {
        this.core.stepFrame();
      }

      // Refresh confirmed checksum if this re-simulated frame lands on a checksum boundary
      const nextFrame = f + 1;
      if (
        nextFrame <= this.confirmedFrame + 1 &&
        nextFrame % CHECKSUM_INTERVAL_FRAMES === 0 &&
        this.core.computeStateChecksum
      ) {
        const refreshed = this.core.computeStateChecksum();
        this.confirmedChecksums.set(nextFrame, refreshed);
        this.lastLocalChecksum = refreshed;
        this.tryEvaluatePendingChecksum(nextFrame);
      }
    }

    this.rollbackCount += 1;
    this.lastRollbackDepth = depth;
    if (depth > this.maxRollbackDepth) {
      this.maxRollbackDepth = depth;
    }

    return { rolledBack: true, rollbackDepth: depth, needsAuthoritativeResync: false };
  }

  /**
   * Compares a remote peer's periodic state checksum against our local confirmed checksum.
   * Returns `{ desyncDetected: true }` if states diverged at the same frame.
   */
  public receiveRemoteChecksum(
    frame: number,
    remoteChecksum: string
  ): { desyncDetected: boolean; frame: number } {
    this.lastRemoteChecksum = remoteChecksum;
    this.pendingRemoteChecksums.set(frame, remoteChecksum);
    return this.tryEvaluatePendingChecksum(frame);
  }

  private tryEvaluatePendingChecksum(frame: number): { desyncDetected: boolean; frame: number } {
    const local = this.confirmedChecksums.get(frame);
    const remote = this.pendingRemoteChecksums.get(frame);
    if (!local || !remote) {
      return { desyncDetected: false, frame };
    }

    this.pendingRemoteChecksums.delete(frame);
    if (local === remote) {
      this.checksumSyncState = 'verified';
      this.syncReady = true;
      this.desyncStartedAtMs = null;
      this.lastVerifiedFrame = Math.max(this.lastVerifiedFrame, frame);
      return { desyncDetected: false, frame };
    }

    this.checksumSyncState = 'desynced';
    this.desyncStartedAtMs = Date.now();
    this.desyncCount += 1;
    return { desyncDetected: true, frame };
  }

  /**
   * Exports an authoritative state snapshot from Host for initial sync, reconnect, or desync recovery.
   */
  public exportAuthoritativeSnapshot(): {
    frame: number;
    stateJson: string;
    checksum: string;
    romHash: string;
    romSha256: string;
  } | null {
    const meta = this.core.getRomMetadata();
    if (!meta) return null;
    const saved = this.core.saveState();
    if (saved instanceof Promise) return null;
    const checksum = this.core.computeStateChecksum ? this.core.computeStateChecksum() : meta.hash;
    this.confirmedChecksums.set(this.currentFrame, checksum);
    this.lastLocalChecksum = checksum;
    return {
      frame: this.currentFrame,
      stateJson: saved.stateJson,
      checksum,
      romHash: meta.hash,
      romSha256: meta.sha256,
    };
  }

  /**
   * Async version of authoritative snapshot export so Libretro FCEUmm WASM cores
   * (whose `saveState()` returns a Promise) can reliably push snapshots to Player 2.
   */
  public async exportAuthoritativeSnapshotAsync(): Promise<{
    frame: number;
    stateJson: string;
    checksum: string;
    romHash: string;
    romSha256: string;
  } | null> {
    const meta = this.core.getRomMetadata();
    if (!meta) return null;
    try {
      const saved = await Promise.resolve(this.core.saveState());
      const checksum = this.core.computeStateChecksum ? this.core.computeStateChecksum() : meta.hash;
      this.confirmedChecksums.set(this.currentFrame, checksum);
      this.lastLocalChecksum = checksum;
      this.checksumSyncState = 'verified';
      this.syncReady = true;
      this.desyncStartedAtMs = null;
      return {
        frame: this.currentFrame,
        stateJson: saved.stateJson,
        checksum,
        romHash: meta.hash,
        romSha256: meta.sha256,
      };
    } catch {
      return null;
    }
  }

  /**
   * Applies an authoritative state snapshot from Host to heal desync or reconnect cleanly.
   */
  public applyAuthoritativeSnapshot(snapshot: {
    frame: number;
    stateJson: string;
    checksum: string;
    romHash: string;
  }): boolean {
    const meta = this.core.getRomMetadata();
    if (!meta) return false;
    try {
      const result = this.core.loadState({
        version: 1,
        coreId: this.core.coreId,
        romName: meta.name,
        romHash: snapshot.romHash || meta.hash,
        frameCount: snapshot.frame,
        savedAt: Date.now(),
        stateJson: snapshot.stateJson,
      });
      if (result instanceof Promise) {
        void result.catch(() => {});
      }
      this.resetTimeline(snapshot.frame);
      this.confirmedChecksums.set(snapshot.frame, snapshot.checksum);
      this.lastLocalChecksum = snapshot.checksum;
      this.lastRemoteChecksum = snapshot.checksum;
      this.lastVerifiedFrame = snapshot.frame;
      this.checksumSyncState = 'verified';
      this.syncReady = true;
      this.desyncStartedAtMs = null;
      this.recoveryCount += 1;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Async version of authoritative snapshot restore for Libretro FCEUmm WASM cores.
   */
  public async applyAuthoritativeSnapshotAsync(snapshot: {
    frame: number;
    stateJson: string;
    checksum: string;
    romHash: string;
  }): Promise<boolean> {
    const meta = this.core.getRomMetadata();
    if (!meta) return false;
    try {
      await Promise.resolve(
        this.core.loadState({
          version: 1,
          coreId: this.core.coreId,
          romName: meta.name,
          romHash: snapshot.romHash || meta.hash,
          frameCount: snapshot.frame,
          savedAt: Date.now(),
          stateJson: snapshot.stateJson,
        })
      );
      this.resetTimeline(snapshot.frame);
      this.confirmedChecksums.set(snapshot.frame, snapshot.checksum);
      this.lastLocalChecksum = snapshot.checksum;
      this.lastRemoteChecksum = snapshot.checksum;
      this.lastVerifiedFrame = snapshot.frame;
      this.checksumSyncState = 'verified';
      this.syncReady = true;
      this.desyncStartedAtMs = null;
      this.recoveryCount += 1;
      return true;
    } catch {
      return false;
    }
  }

  public getMetrics(): RollbackMetricsSnapshot {
    const advantage =
      this.remoteLatestFrame >= 0 ? this.currentFrame - this.remoteLatestFrame : 0;
    return {
      currentFrame: this.currentFrame,
      confirmedFrame: Math.max(0, this.confirmedFrame),
      remoteLatestFrame: Math.max(0, this.remoteLatestFrame),
      frameAdvantage: advantage,
      inputDelayFrames: this.delayController.getActiveDelayFrames(),
      requestedManualDelay: this.delayController.getRequestedManualDelay(),
      safeMinDelayFrames: this.delayController.getMinimumSafeDelayFrames(),
      highPingSafeFloorActive: this.delayController.isHighPingSafeFloorActive(),
      highPingDelayWarning: this.delayController.getHighPingZeroDelayWarning(),
      adaptiveDelayEnabled: this.delayController.isAdaptiveEnabled(),
      pingMs: this.delayController.getPingMs(),
      jitterMs: this.delayController.getJitterMs(),
      connectionQuality: this.delayController.getConnectionQuality(),
      rollbackCount: this.rollbackCount,
      lastRollbackDepth: this.lastRollbackDepth,
      maxRollbackDepth: this.maxRollbackDepth,
      desyncCount: this.desyncCount,
      recoveryCount: this.recoveryCount,
      stallRecoveryCount: this.stallRecoveryCount,
      checksumSyncState: this.checksumSyncState,
      syncReady: this.syncReady,
      lastVerifiedFrame: Math.max(0, this.lastVerifiedFrame),
      lastLocalChecksum: this.lastLocalChecksum,
      lastRemoteChecksum: this.lastRemoteChecksum,
      throttledFrames: this.throttledFrames,
      clockDriftMs: this.lastClockDriftMs,
      clockAligned: Math.abs(this.lastClockDriftMs) <= this.syncPulseDriftThresholdMs,
      syncPulseCount: this.syncPulseCount,
      clockAlignmentCount: this.clockAlignmentCount,
      pendingClockHoldFrames: this.pendingClockHoldFrames,
      pendingClockCatchUpFrames: this.pendingClockCatchUpFrames,
      turnBasedSharedPort1: this.turnBasedSharedPort1,
      activeTurnPort: this.activeTurnPort,
    };
  }
}

// === Optional Consent-Based ROM File Transfer (with SHA-256 & iNES Verification) ===

export interface RomTransferProgress {
  transferId: string;
  direction: 'sending' | 'receiving';
  status: 'idle' | 'awaiting-consent' | 'transferring' | 'verified' | 'declined' | 'failed';
  romName: string;
  sizeBytes: number;
  sha256: string;
  chunksDone: number;
  chunkCount: number;
  saveToLocalStorage: boolean;
  error: string | null;
}

export function createRomTransferOffer(
  romName: string,
  romBytes: Uint8Array
): { ok: true; offer: RomTransferOffer; chunks: string[] } | { ok: false; error: string } {
  if (romBytes.byteLength < 16 || romBytes.byteLength > MAX_ROM_TRANSFER_BYTES) {
    return {
      ok: false,
      error: `ROM size must be between 16 bytes and ${Math.round(MAX_ROM_TRANSFER_BYTES / (1024 * 1024))} MB.`,
    };
  }
  try {
    parseInesHeader(romBytes, romName);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Invalid .nes iNES file.',
    };
  }

  const sha256 = computeSha256Hex(romBytes);
  const chunks: string[] = [];
  for (let offset = 0; offset < romBytes.byteLength; offset += ROM_TRANSFER_CHUNK_BYTES) {
    const slice = romBytes.subarray(offset, Math.min(offset + ROM_TRANSFER_CHUNK_BYTES, romBytes.byteLength));
    chunks.push(uint8ArrayToBase64(slice));
  }

  const safeName = romName.replace(/[^a-zA-Z0-9._\-\s()]/g, '_').slice(0, 80) || 'cartridge.nes';
  return {
    ok: true,
    offer: {
      transferId: `rom_${Date.now().toString(36)}_${sha256.slice(0, 8)}`,
      romName: safeName,
      sizeBytes: romBytes.byteLength,
      sha256,
      chunkCount: chunks.length,
    },
    chunks,
  };
}

export class RomTransferReceiver {
  private offer: RomTransferOffer | null = null;
  private consented = false;
  private saveToLocalStorage = false;
  private chunks: (Uint8Array | null)[] = [];
  private receivedCount = 0;

  public receiveOffer(offer: RomTransferOffer): { ok: boolean; error?: string } {
    if (
      !offer.transferId ||
      offer.sizeBytes < 16 ||
      offer.sizeBytes > MAX_ROM_TRANSFER_BYTES ||
      offer.chunkCount < 1 ||
      offer.chunkCount > Math.ceil(MAX_ROM_TRANSFER_BYTES / ROM_TRANSFER_CHUNK_BYTES) + 2 ||
      !/^[a-f0-9]{64}$/i.test(offer.sha256)
    ) {
      return { ok: false, error: 'Rejected invalid or oversized ROM transfer offer.' };
    }
    this.offer = { ...offer, sha256: offer.sha256.toLowerCase() };
    this.consented = false;
    this.saveToLocalStorage = false;
    this.chunks = new Array<Uint8Array | null>(offer.chunkCount).fill(null);
    this.receivedCount = 0;
    return { ok: true };
  }

  public grantConsent(saveToLocalStorage: boolean): RomTransferOffer | null {
    if (!this.offer) return null;
    this.consented = true;
    this.saveToLocalStorage = saveToLocalStorage;
    return this.offer;
  }

  public decline(): void {
    this.offer = null;
    this.consented = false;
    this.saveToLocalStorage = false;
    this.chunks = [];
    this.receivedCount = 0;
  }

  public ingestChunk(
    transferId: string,
    chunkIndex: number,
    dataBase64: string
  ): {
    ok: boolean;
    completed: boolean;
    chunksDone: number;
    chunkCount: number;
    bytes?: Uint8Array;
    saveToLocalStorage?: boolean;
    error?: string;
  } {
    if (!this.offer || !this.consented || this.offer.transferId !== transferId) {
      return {
        ok: false,
        completed: false,
        chunksDone: 0,
        chunkCount: 0,
        error: 'Blocked unconsented or unknown ROM chunk.',
      };
    }
    if (chunkIndex < 0 || chunkIndex >= this.offer.chunkCount) {
      return {
        ok: false,
        completed: false,
        chunksDone: this.receivedCount,
        chunkCount: this.offer.chunkCount,
        error: 'Chunk index out of bounds.',
      };
    }

    const decoded = base64ToUint8Array(dataBase64);
    if (decoded.byteLength > ROM_TRANSFER_CHUNK_BYTES + 1024) {
      return {
        ok: false,
        completed: false,
        chunksDone: this.receivedCount,
        chunkCount: this.offer.chunkCount,
        error: 'ROM chunk exceeded maximum allowed size.',
      };
    }

    if (this.chunks[chunkIndex] === null) {
      this.receivedCount += 1;
    }
    this.chunks[chunkIndex] = decoded;

    if (this.receivedCount < this.offer.chunkCount) {
      return {
        ok: true,
        completed: false,
        chunksDone: this.receivedCount,
        chunkCount: this.offer.chunkCount,
      };
    }

    // Reassemble & verify total size, iNES magic header, and exact SHA-256 digest
    let totalLen = 0;
    for (const part of this.chunks) {
      if (!part) {
        return {
          ok: false,
          completed: false,
          chunksDone: this.receivedCount,
          chunkCount: this.offer.chunkCount,
          error: 'Missing ROM chunk during assembly.',
        };
      }
      totalLen += part.byteLength;
    }
    if (totalLen !== this.offer.sizeBytes || totalLen > MAX_ROM_TRANSFER_BYTES) {
      this.decline();
      return {
        ok: false,
        completed: false,
        chunksDone: 0,
        chunkCount: 0,
        error: 'Transferred ROM byte size did not match offer metadata.',
      };
    }

    const assembled = new Uint8Array(totalLen);
    let offset = 0;
    for (const part of this.chunks) {
      assembled.set(part!, offset);
      offset += part!.byteLength;
    }

    const expectedSha256 = this.offer.sha256;
    const actualSha256 = computeSha256Hex(assembled);
    if (actualSha256 !== expectedSha256) {
      this.decline();
      return {
        ok: false,
        completed: false,
        chunksDone: 0,
        chunkCount: 0,
        error: `SHA-256 verification failed (expected ${expectedSha256.slice(0, 12)}, got ${actualSha256.slice(0, 12)}).`,
      };
    }

    try {
      parseInesHeader(assembled, this.offer.romName);
    } catch (err) {
      this.decline();
      return {
        ok: false,
        completed: false,
        chunksDone: 0,
        chunkCount: 0,
        error: err instanceof Error ? err.message : 'Invalid iNES header.',
      };
    }

    const shouldSave = this.saveToLocalStorage;
    const count = this.offer.chunkCount;
    this.decline();
    return {
      ok: true,
      completed: true,
      chunksDone: count,
      chunkCount: count,
      bytes: assembled,
      saveToLocalStorage: shouldSave,
    };
  }
}
