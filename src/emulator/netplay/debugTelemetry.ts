import { INPUT_REDUNDANCY_FRAMES, NES_FRAME_MS } from './rollbackEngine';
import type { PeerDebugTelemetryPayload, PlayerPort } from './protocol';

export const DEBUG_JITTER_HISTORY_LIMIT = 24;
export const DEFAULT_BUFFER_CAPACITY_FRAMES = 12;

export interface NetplayEndpointDebugStats {
  /** Smoothed packet arrival jitter in milliseconds */
  packetJitterMs: number;
  /** Peak observed packet arrival jitter in milliseconds */
  peakJitterMs: number;
  /** Rolling history of recent arrival jitter samples (ms) for sparkline visualization */
  jitterHistoryMs: number[];
  /** Cumulative packets detected as lost (frame/pulse gaps or timed-out packets) */
  packetsLost: number;
  /** Total packets received (for real loss rate calculation) */
  packetsReceived: number;
  /** Real packet loss percentage (0.0 - 100.0) */
  packetLossPercent: number;
  /** Current total buffer size in frames (active input delay + buffered queue frames) */
  bufferSizeFrames: number;
  /** Active input delay buffer in frames */
  inputDelayFrames: number;
  /** Buffered/queued frames awaiting dispatch or confirmation */
  bufferedQueueFrames: number;
  /** Target maximum buffer capacity in frames */
  bufferCapacityFrames: number;
  /** Most recent measured packet inter-arrival interval in ms */
  lastInterArrivalMs: number | null;
  /** Timestamp (ms) of last telemetry update */
  updatedAtMs: number | null;
}

export interface NetplayDebugSnapshot {
  local: NetplayEndpointDebugStats;
  peer: NetplayEndpointDebugStats | null;
  transportChannel: 'websocket' | 'webrtc';
  peerTelemetryLive: boolean;
}

function roundTenth(value: number): number {
  return Math.round(Math.max(0, value) * 10) / 10;
}

function computeLossPercent(lost: number, received: number): number {
  const total = lost + received;
  if (total <= 0) return 0;
  return Math.round((lost / total) * 1000) / 10;
}

function createEmptyEndpointStats(capacity = DEFAULT_BUFFER_CAPACITY_FRAMES): NetplayEndpointDebugStats {
  return {
    packetJitterMs: 0,
    peakJitterMs: 0,
    jitterHistoryMs: [],
    packetsLost: 0,
    packetsReceived: 0,
    packetLossPercent: 0,
    bufferSizeFrames: 0,
    inputDelayFrames: 0,
    bufferedQueueFrames: 0,
    bufferCapacityFrames: Math.max(1, capacity),
    lastInterArrivalMs: null,
    updatedAtMs: null,
  };
}

/**
 * Pure, decoupled packet arrival jitter, packet loss, and buffer depth tracker
 * for both local and peer Netplay connections.
 */
export class NetplayDebugTracker {
  private localStats: NetplayEndpointDebugStats = createEmptyEndpointStats();
  private peerStats: NetplayEndpointDebugStats | null = null;
  private transportChannel: 'websocket' | 'webrtc' = 'websocket';

  // Local arrival estimators
  private lastPingRttMs: number | null = null;
  private lastFramePacketAtMs: number | null = null;
  private lastRemoteFrameSeen: number | null = null;
  private lastPulseAtMs: number | null = null;
  private lastPulseIdSeen: number | null = null;

  public setTransportChannel(channel: 'websocket' | 'webrtc'): void {
    this.transportChannel = channel;
  }

  private pushLocalJitterSample(instantJitterMs: number, nowMs: number): void {
    const clamped = Math.max(0, Math.min(500, instantJitterMs));
    // RFC 3550-inspired smoothed jitter with responsive alpha (0.25) for live HUD clarity
    const nextSmoothed =
      this.localStats.jitterHistoryMs.length === 0
        ? clamped
        : this.localStats.packetJitterMs * 0.75 + clamped * 0.25;

    this.localStats.packetJitterMs = roundTenth(nextSmoothed);
    if (clamped > this.localStats.peakJitterMs) {
      this.localStats.peakJitterMs = roundTenth(clamped);
    }

    this.localStats.jitterHistoryMs.push(roundTenth(clamped));
    if (this.localStats.jitterHistoryMs.length > DEBUG_JITTER_HISTORY_LIMIT) {
      this.localStats.jitterHistoryMs.splice(
        0,
        this.localStats.jitterHistoryMs.length - DEBUG_JITTER_HISTORY_LIMIT
      );
    }
    this.localStats.updatedAtMs = nowMs;
  }

  /**
   * Records a real WebSocket/DataChannel RTT ping/pong sample.
   * Updates local packet arrival jitter even before gameplay starts (lobby warm-up).
   */
  public recordPingSample(rttMs: number, nowMs = Date.now()): void {
    const cleanRtt = Math.max(1, Math.min(2000, rttMs));
    this.localStats.packetsReceived += 1;
    this.localStats.packetLossPercent = computeLossPercent(
      this.localStats.packetsLost,
      this.localStats.packetsReceived
    );

    if (this.lastPingRttMs !== null) {
      const rttDelta = Math.abs(cleanRtt - this.lastPingRttMs);
      this.pushLocalJitterSample(rttDelta, nowMs);
    } else {
      // Seed initial 0ms baseline so sparkline renders immediately upon first ping
      this.pushLocalJitterSample(0, nowMs);
    }
    this.lastPingRttMs = cleanRtt;
    this.localStats.updatedAtMs = nowMs;
  }

  /**
   * Records an incoming `input:frame` batch from the remote peer.
   * Measures arrival jitter against expected frame spacing and counts unrecovered
   * sequence gaps (> INPUT_REDUNDANCY_FRAMES) as lost packets.
   */
  public recordIncomingFramePacket(
    latestFrame: number,
    nowMs = Date.now(),
    redundancyWindow = INPUT_REDUNDANCY_FRAMES
  ): void {
    const frame = Math.max(0, Math.floor(latestFrame));
    this.localStats.packetsReceived += 1;

    // Handle clean restart back to frame 0 without false packet loss spikes
    if (this.lastRemoteFrameSeen !== null && frame < this.lastRemoteFrameSeen - 12) {
      this.lastRemoteFrameSeen = frame;
      this.lastFramePacketAtMs = nowMs;
      this.localStats.updatedAtMs = nowMs;
      this.localStats.packetLossPercent = computeLossPercent(
        this.localStats.packetsLost,
        this.localStats.packetsReceived
      );
      return;
    }

    if (this.lastRemoteFrameSeen !== null && this.lastFramePacketAtMs !== null) {
      const frameDelta = frame - this.lastRemoteFrameSeen;
      const actualDeltaMs = Math.max(0, nowMs - this.lastFramePacketAtMs);
      this.localStats.lastInterArrivalMs = roundTenth(actualDeltaMs);

      if (frameDelta > 0) {
        const expectedDeltaMs = frameDelta * NES_FRAME_MS;
        const arrivalJitterMs = Math.abs(actualDeltaMs - expectedDeltaMs);
        this.pushLocalJitterSample(arrivalJitterMs, nowMs);

        // If the jump exceeds redundant frame bundling, intermediate packets were lost
        if (frameDelta > Math.max(1, redundancyWindow)) {
          const missedPackets = frameDelta - Math.max(1, redundancyWindow);
          this.localStats.packetsLost += missedPackets;
        }
      }
    }

    this.lastRemoteFrameSeen = frame;
    this.lastFramePacketAtMs = nowMs;
    this.localStats.packetLossPercent = computeLossPercent(
      this.localStats.packetsLost,
      this.localStats.packetsReceived
    );
    this.localStats.updatedAtMs = nowMs;
  }

  /**
   * Records an incoming `sync:pulse` packet and detects missing pulse IDs.
   */
  public recordIncomingSyncPulse(
    pulseId: number,
    expectedIntervalMs = 1000,
    nowMs = Date.now()
  ): void {
    const id = Math.max(0, Math.floor(pulseId));
    this.localStats.packetsReceived += 1;

    if (this.lastPulseIdSeen !== null && id > this.lastPulseIdSeen) {
      const missed = id - this.lastPulseIdSeen - 1;
      if (missed > 0) {
        this.localStats.packetsLost += missed;
      }
      if (this.lastPulseAtMs !== null) {
        const actualDeltaMs = Math.max(0, nowMs - this.lastPulseAtMs);
        const expectedMs = (id - this.lastPulseIdSeen) * expectedIntervalMs;
        this.localStats.lastInterArrivalMs = roundTenth(actualDeltaMs);
        this.pushLocalJitterSample(Math.abs(actualDeltaMs - expectedMs), nowMs);
      }
    }

    this.lastPulseIdSeen = id;
    this.lastPulseAtMs = nowMs;
    this.localStats.packetLossPercent = computeLossPercent(
      this.localStats.packetsLost,
      this.localStats.packetsReceived
    );
    this.localStats.updatedAtMs = nowMs;
  }

  /**
   * Records an explicit packet loss event caused by stall timeout recovery.
   */
  public recordStallTimeoutLoss(count = 1, nowMs = Date.now()): void {
    const add = Math.max(1, Math.floor(count));
    this.localStats.packetsLost += add;
    this.localStats.packetLossPercent = computeLossPercent(
      this.localStats.packetsLost,
      this.localStats.packetsReceived
    );
    this.localStats.updatedAtMs = nowMs;
  }

  /**
   * Updates the current local buffer breakdown (active input delay buffer + queued frames).
   */
  public updateLocalBuffer(
    inputDelayFrames: number,
    bufferedQueueFrames: number,
    bufferCapacityFrames = DEFAULT_BUFFER_CAPACITY_FRAMES,
    nowMs = Date.now()
  ): void {
    const cleanDelay = Math.max(0, Math.floor(inputDelayFrames));
    const cleanQueue = Math.max(0, Math.floor(bufferedQueueFrames));
    const cleanCap = Math.max(1, Math.floor(bufferCapacityFrames));

    this.localStats.inputDelayFrames = cleanDelay;
    this.localStats.bufferedQueueFrames = cleanQueue;
    this.localStats.bufferSizeFrames = cleanDelay + cleanQueue;
    this.localStats.bufferCapacityFrames = cleanCap;
    this.localStats.updatedAtMs = nowMs;
  }

  /**
   * Builds a lightweight payload summarizing local telemetry to share with the remote peer.
   */
  public exportSummaryForPeer(port: PlayerPort): PeerDebugTelemetryPayload {
    return {
      port,
      packetJitterMs: this.localStats.packetJitterMs,
      peakJitterMs: this.localStats.peakJitterMs,
      packetsLost: this.localStats.packetsLost,
      packetsReceived: this.localStats.packetsReceived,
      bufferSizeFrames: this.localStats.bufferSizeFrames,
      inputDelayFrames: this.localStats.inputDelayFrames,
      bufferedQueueFrames: this.localStats.bufferedQueueFrames,
      bufferCapacityFrames: this.localStats.bufferCapacityFrames,
    };
  }

  /**
   * Ingests a remote peer's real telemetry report and appends its jitter point to peer history.
   */
  public ingestPeerSummary(payload: PeerDebugTelemetryPayload, nowMs = Date.now()): void {
    const jitter = roundTenth(Math.min(500, Math.max(0, payload.packetJitterMs)));
    const peak = roundTenth(Math.min(500, Math.max(jitter, payload.peakJitterMs)));
    const lost = Math.max(0, Math.floor(payload.packetsLost));
    const received = Math.max(0, Math.floor(payload.packetsReceived));
    const inputDelay = Math.max(0, Math.floor(payload.inputDelayFrames));
    const queued = Math.max(0, Math.floor(payload.bufferedQueueFrames));
    const bufferSize = Math.max(0, Math.floor(payload.bufferSizeFrames));
    const capacity = Math.max(1, Math.floor(payload.bufferCapacityFrames || DEFAULT_BUFFER_CAPACITY_FRAMES));

    const prevHistory = this.peerStats?.jitterHistoryMs ?? [];
    const nextHistory = [...prevHistory, jitter];
    if (nextHistory.length > DEBUG_JITTER_HISTORY_LIMIT) {
      nextHistory.splice(0, nextHistory.length - DEBUG_JITTER_HISTORY_LIMIT);
    }

    this.peerStats = {
      packetJitterMs: jitter,
      peakJitterMs: Math.max(this.peerStats?.peakJitterMs ?? 0, peak),
      jitterHistoryMs: nextHistory,
      packetsLost: lost,
      packetsReceived: received,
      packetLossPercent: computeLossPercent(lost, received),
      bufferSizeFrames: bufferSize,
      inputDelayFrames: inputDelay,
      bufferedQueueFrames: queued,
      bufferCapacityFrames: capacity,
      lastInterArrivalMs: null,
      updatedAtMs: nowMs,
    };
  }

  public clearPeer(): void {
    this.peerStats = null;
  }

  public resetCounters(): void {
    const prevDelay = this.localStats.inputDelayFrames;
    const prevQueue = this.localStats.bufferedQueueFrames;
    const prevCap = this.localStats.bufferCapacityFrames;
    this.localStats = createEmptyEndpointStats(prevCap);
    this.localStats.inputDelayFrames = prevDelay;
    this.localStats.bufferedQueueFrames = prevQueue;
    this.localStats.bufferSizeFrames = prevDelay + prevQueue;
    if (this.peerStats) {
      this.peerStats = {
        ...this.peerStats,
        peakJitterMs: this.peerStats.packetJitterMs,
        jitterHistoryMs: [this.peerStats.packetJitterMs],
        packetsLost: 0,
        packetsReceived: 0,
        packetLossPercent: 0,
      };
    }
    this.lastFramePacketAtMs = null;
    this.lastRemoteFrameSeen = null;
    this.lastPulseAtMs = null;
    this.lastPulseIdSeen = null;
  }

  public reset(): void {
    this.localStats = createEmptyEndpointStats();
    this.peerStats = null;
    this.lastPingRttMs = null;
    this.lastFramePacketAtMs = null;
    this.lastRemoteFrameSeen = null;
    this.lastPulseAtMs = null;
    this.lastPulseIdSeen = null;
  }

  public getSnapshot(): NetplayDebugSnapshot {
    return {
      local: {
        ...this.localStats,
        jitterHistoryMs: [...this.localStats.jitterHistoryMs],
      },
      peer: this.peerStats
        ? {
            ...this.peerStats,
            jitterHistoryMs: [...this.peerStats.jitterHistoryMs],
          }
        : null,
      transportChannel: this.transportChannel,
      peerTelemetryLive: this.peerStats !== null,
    };
  }
}

export interface SparklineGeometry {
  linePath: string;
  areaPath: string;
  lastPoint: { x: number; y: number } | null;
}

/**
 * Pure SVG coordinate generator for the Netplay Debug packet arrival jitter chart.
 */
export function buildJitterSparklinePath(
  samples: readonly number[],
  width: number,
  height: number,
  maxScaleMs: number,
  paddingY = 6
): SparklineGeometry {
  if (samples.length === 0 || width <= 0 || height <= 0) {
    return { linePath: '', areaPath: '', lastPoint: null };
  }

  const safeScale = Math.max(10, maxScaleMs);
  const usableHeight = Math.max(1, height - paddingY * 2);
  const bottomY = height - paddingY;

  const toY = (val: number): number => {
    const clamped = Math.max(0, Math.min(safeScale, val));
    const ratio = clamped / safeScale;
    return Math.round((bottomY - ratio * usableHeight) * 10) / 10;
  };

  if (samples.length === 1) {
    const y = toY(samples[0]);
    const linePath = `M 0 ${y} L ${width} ${y}`;
    const areaPath = `${linePath} L ${width} ${bottomY} L 0 ${bottomY} Z`;
    return { linePath, areaPath, lastPoint: { x: width, y } };
  }

  const stepX = width / (samples.length - 1);
  const coords = samples.map((val, idx) => ({
    x: Math.round(idx * stepX * 10) / 10,
    y: toY(val),
  }));

  const linePath = coords
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`)
    .join(' ');
  const last = coords[coords.length - 1];
  const areaPath = `${linePath} L ${last.x} ${bottomY} L ${coords[0].x} ${bottomY} Z`;

  return {
    linePath,
    areaPath,
    lastPoint: last,
  };
}
