import type { FrameInputEntry, PlayerPort } from './protocol';
import type { SyncPulsePacket } from './rollbackEngine';

export interface OutgoingInputBatchPacket {
  port: PlayerPort;
  latestFrame: number;
  ackFrame: number;
  inputs: FrameInputEntry[];
}

export interface OutgoingChecksumPacket {
  frame: number;
  checksum: string;
}

export interface NetplayOutboxHandlers {
  sendFrameInputs: (batch: OutgoingInputBatchPacket) => void;
  sendChecksum: (checksum: OutgoingChecksumPacket) => void;
  sendSyncPulse: (pulse: SyncPulsePacket) => void;
}

/**
 * Non-blocking asynchronous packet coalescer for 2-Player Netplay.
 *
 * Collects outgoing lightweight input batches, periodic checksums, and sync pulses
 * during the 60Hz emulation loop and flushes them asynchronously via microtask
 * (never blocking stepFrame() or requestAnimationFrame()). When multiple catch-up
 * steps execute within a single render frame, only the newest redundant input batch
 * is transmitted so the socket never backs up.
 */
export class AsyncNetplayOutbox {
  private pendingInput: OutgoingInputBatchPacket | null = null;
  private pendingChecksum: OutgoingChecksumPacket | null = null;
  private pendingSyncPulse: SyncPulsePacket | null = null;
  private flushScheduled = false;
  private disposed = false;
  private flushedCount = 0;

  public enqueueInput(batch: OutgoingInputBatchPacket, handlers: NetplayOutboxHandlers): void {
    if (this.disposed || batch.inputs.length === 0) return;
    this.pendingInput = batch;
    this.scheduleFlush(handlers);
  }

  public enqueueChecksum(
    checksum: OutgoingChecksumPacket,
    handlers: NetplayOutboxHandlers
  ): void {
    if (this.disposed) return;
    this.pendingChecksum = checksum;
    this.scheduleFlush(handlers);
  }

  public enqueueSyncPulse(pulse: SyncPulsePacket, handlers: NetplayOutboxHandlers): void {
    if (this.disposed) return;
    this.pendingSyncPulse = pulse;
    this.scheduleFlush(handlers);
  }

  private scheduleFlush(handlers: NetplayOutboxHandlers): void {
    if (this.flushScheduled || this.disposed) return;
    this.flushScheduled = true;

    const run = () => {
      this.flushScheduled = false;
      if (this.disposed) return;
      this.flushNow(handlers);
    };

    if (typeof queueMicrotask === 'function') {
      queueMicrotask(run);
    } else {
      void Promise.resolve().then(run);
    }
  }

  public flushNow(handlers: NetplayOutboxHandlers): void {
    const input = this.pendingInput;
    const checksum = this.pendingChecksum;
    const pulse = this.pendingSyncPulse;
    this.pendingInput = null;
    this.pendingChecksum = null;
    this.pendingSyncPulse = null;

    if (input) {
      this.flushedCount += 1;
      try {
        handlers.sendFrameInputs(input);
      } catch {
        // Never allow transport error to disrupt 60 FPS emulation
      }
    }
    if (checksum) {
      this.flushedCount += 1;
      try {
        handlers.sendChecksum(checksum);
      } catch {
        // Non-blocking
      }
    }
    if (pulse) {
      this.flushedCount += 1;
      try {
        handlers.sendSyncPulse(pulse);
      } catch {
        // Non-blocking
      }
    }
  }

  public clearPending(): void {
    this.pendingInput = null;
    this.pendingChecksum = null;
    this.pendingSyncPulse = null;
  }

  public getFlushedPacketCount(): number {
    return this.flushedCount;
  }

  public dispose(): void {
    this.disposed = true;
    this.clearPending();
  }
}

/**
 * Backpressure-guarded asynchronous scheduler for Dual-Screen 1P VS Mode
 * opponent screen-share frames.
 *
 * Ensures that slow JPEG encoding or slow network uploads NEVER pile up or
 * block the local player's 100% independent 60 FPS FCEUmm core.
 */
export class AsyncFrameShareGate {
  private inFlight = false;
  private lastSentAtMs = 0;
  private droppedDueToBackpressure = 0;
  private completedFrames = 0;

  constructor(private readonly minIntervalMs = 150) {}

  public canStartCapture(nowMs: number): boolean {
    if (this.inFlight) {
      this.droppedDueToBackpressure += 1;
      return false;
    }
    if (this.lastSentAtMs > 0 && nowMs - this.lastSentAtMs < this.minIntervalMs) {
      return false;
    }
    this.inFlight = true;
    this.lastSentAtMs = nowMs;
    return true;
  }

  public markCaptureComplete(): void {
    this.inFlight = false;
    this.completedFrames += 1;
  }

  public markCaptureAborted(): void {
    this.inFlight = false;
  }

  public getStats(): {
    inFlight: boolean;
    completedFrames: number;
    droppedDueToBackpressure: number;
  } {
    return {
      inFlight: this.inFlight,
      completedFrames: this.completedFrames,
      droppedDueToBackpressure: this.droppedDueToBackpressure,
    };
  }
}
