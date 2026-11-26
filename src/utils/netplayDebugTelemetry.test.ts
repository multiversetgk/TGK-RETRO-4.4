import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildJitterSparklinePath,
  DEBUG_JITTER_HISTORY_LIMIT,
  NetplayDebugTracker,
} from '../emulator/netplay/debugTelemetry';

test('NetplayDebugTracker measures local arrival jitter and packet loss from frame gaps and sync pulses', () => {
  const tracker = new NetplayDebugTracker();
  tracker.setTransportChannel('webrtc');

  // Record ping samples (40ms -> 52ms => 12ms delta)
  tracker.recordPingSample(40, 1000);
  tracker.recordPingSample(52, 3000);
  let snap = tracker.getSnapshot();
  assert.equal(snap.transportChannel, 'webrtc');
  assert.equal(snap.local.packetsReceived, 2);
  assert.equal(snap.local.packetsLost, 0);
  assert.ok(snap.local.packetJitterMs > 0);
  assert.equal(snap.local.jitterHistoryMs.length, 2);

  // Incoming sequential frame batches (frame 10 -> frame 11 in 25ms vs ~16.6ms expected => ~8.4ms jitter, 0 lost)
  tracker.recordIncomingFramePacket(10, 4000);
  tracker.recordIncomingFramePacket(11, 4025);
  snap = tracker.getSnapshot();
  assert.equal(snap.local.packetsLost, 0);
  assert.ok(snap.local.lastInterArrivalMs === 25);

  // Incoming frame batch jumps past redundancy window (11 -> 18, delta 7 > redundancy 4 => 3 packets lost)
  tracker.recordIncomingFramePacket(18, 4170, 4);
  snap = tracker.getSnapshot();
  assert.equal(snap.local.packetsLost, 3);
  assert.ok(snap.local.packetLossPercent > 0);

  // Missing sync pulse sequence ID (pulse 1 -> pulse 4 => 2 pulses lost)
  tracker.recordIncomingSyncPulse(1, 1000, 5000);
  tracker.recordIncomingSyncPulse(4, 1000, 8040);
  snap = tracker.getSnapshot();
  assert.equal(snap.local.packetsLost, 5);

  // Stall timeout recovery records additional lost packet
  tracker.recordStallTimeoutLoss(1, 8500);
  snap = tracker.getSnapshot();
  assert.equal(snap.local.packetsLost, 6);
});

test('NetplayDebugTracker tracks buffer depth, exports/ingests peer telemetry, caps history, and resets cleanly', () => {
  const hostTracker = new NetplayDebugTracker();
  const peerTracker = new NetplayDebugTracker();

  hostTracker.updateLocalBuffer(3, 2, 12, 1000);
  peerTracker.updateLocalBuffer(2, 1, 10, 1000);
  peerTracker.recordPingSample(30, 1000);
  peerTracker.recordPingSample(46, 2000);
  peerTracker.recordStallTimeoutLoss(2, 2500);

  // Peer exports summary -> Host ingests peer summary
  const peerSummary = peerTracker.exportSummaryForPeer(2);
  hostTracker.ingestPeerSummary(peerSummary, 2600);

  const snap = hostTracker.getSnapshot();
  assert.equal(snap.peerTelemetryLive, true);
  assert.equal(snap.local.bufferSizeFrames, 5);
  assert.equal(snap.local.inputDelayFrames, 3);
  assert.equal(snap.local.bufferedQueueFrames, 2);
  assert.equal(snap.local.bufferCapacityFrames, 12);

  assert.ok(snap.peer);
  assert.equal(snap.peer.bufferSizeFrames, 3);
  assert.equal(snap.peer.inputDelayFrames, 2);
  assert.equal(snap.peer.bufferedQueueFrames, 1);
  assert.equal(snap.peer.bufferCapacityFrames, 10);
  assert.equal(snap.peer.packetsLost, 2);
  assert.ok(snap.peer.packetJitterMs > 0);

  // Push >24 samples to verify rolling history cap
  for (let i = 0; i < 35; i++) {
    hostTracker.recordPingSample(20 + (i % 5) * 4, 3000 + i * 500);
    hostTracker.ingestPeerSummary({ ...peerSummary, packetJitterMs: 4 + (i % 6) }, 3000 + i * 500);
  }
  const capped = hostTracker.getSnapshot();
  assert.equal(capped.local.jitterHistoryMs.length, DEBUG_JITTER_HISTORY_LIMIT);
  assert.equal(capped.peer?.jitterHistoryMs.length, DEBUG_JITTER_HISTORY_LIMIT);

  // Reset counters clears loss & history while preserving current buffer sizing
  hostTracker.resetCounters();
  const afterReset = hostTracker.getSnapshot();
  assert.equal(afterReset.local.packetsLost, 0);
  assert.equal(afterReset.local.jitterHistoryMs.length, 0);
  assert.equal(afterReset.local.bufferSizeFrames, 5);
});

test('buildJitterSparklinePath generates valid SVG paths for empty, single, and multi-sample jitter series', () => {
  const empty = buildJitterSparklinePath([], 420, 76, 40);
  assert.equal(empty.linePath, '');
  assert.equal(empty.lastPoint, null);

  const single = buildJitterSparklinePath([10], 420, 76, 40);
  assert.ok(single.linePath.startsWith('M 0 '));
  assert.ok(single.linePath.includes('L 420 '));
  assert.ok(single.lastPoint);
  assert.equal(single.lastPoint.x, 420);

  const multi = buildJitterSparklinePath([0, 20, 40], 400, 80, 40, 10);
  assert.equal(multi.linePath, 'M 0 70 L 200 40 L 400 10');
  assert.ok(multi.areaPath.endsWith('L 0 70 Z'));
  assert.deepEqual(multi.lastPoint, { x: 400, y: 10 });
});
