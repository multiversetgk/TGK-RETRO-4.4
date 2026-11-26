import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveEffectiveOrientation,
  computeVideoFrameRect,
} from '../emulator/settings/viewportLayout';
import {
  AsyncNetplayOutbox,
  AsyncFrameShareGate,
} from '../emulator/netplay/asyncOutbox';

describe('resolveEffectiveOrientation', () => {
  it('resolves auto orientation cleanly from viewport dimensions', () => {
    assert.equal(resolveEffectiveOrientation('auto', 390, 844), 'portrait');
    assert.equal(resolveEffectiveOrientation('auto', 844, 390), 'landscape');
    assert.equal(resolveEffectiveOrientation('auto', 1440, 900), 'landscape');
  });

  it('honors explicit portrait and landscape user overrides', () => {
    assert.equal(resolveEffectiveOrientation('portrait', 1440, 900), 'portrait');
    assert.equal(resolveEffectiveOrientation('landscape', 390, 844), 'landscape');
  });
});

describe('computeVideoFrameRect', () => {
  const viewports: Array<{
    name: string;
    w: number;
    h: number;
    orientation: 'portrait' | 'landscape';
  }> = [
    { name: 'Portrait Mobile', w: 390, h: 400, orientation: 'portrait' },
    { name: 'Landscape Mobile', w: 844, h: 340, orientation: 'landscape' },
    { name: 'Desktop Stage', w: 1440, h: 840, orientation: 'landscape' },
  ];

  for (const vp of viewports) {
    it(`keeps 4:3, fit, and full strictly contained with zero clipping on ${vp.name}`, () => {
      const r43 = computeVideoFrameRect(vp.w, vp.h, '4:3', vp.orientation);
      const rFit = computeVideoFrameRect(vp.w, vp.h, 'fit', vp.orientation);
      const rFull = computeVideoFrameRect(vp.w, vp.h, 'full', vp.orientation);

      for (const rect of [r43, rFit, rFull]) {
        assert.ok(rect.width > 0 && rect.width <= vp.w, `width ${rect.width} must fit within ${vp.w}`);
        assert.ok(rect.height > 0 && rect.height <= vp.h, `height ${rect.height} must fit within ${vp.h}`);
      }

      // 4:3 maintains classic 1.333 ratio within rounding tolerance
      const ratio43 = r43.width / r43.height;
      assert.ok(Math.abs(ratio43 - 4 / 3) < 0.03, `expected ~1.333 ratio, got ${ratio43}`);

      // Full Stretch fills 100% of available stage area
      assert.equal(rFull.width, vp.w);
      assert.equal(rFull.height, vp.h);

      // Fit Screen uses strictly larger area than 4:3 Original
      assert.ok(
        rFit.width * rFit.height > r43.width * r43.height,
        `expected Fit Screen area (${rFit.width}x${rFit.height}) > 4:3 (${r43.width}x${r43.height})`
      );
    });
  }
});

describe('AsyncNetplayOutbox', () => {
  it('coalesces multiple synchronous catch-up packets into one async microtask flush', async () => {
    const outbox = new AsyncNetplayOutbox();
    const sentInputs: number[] = [];
    const sentChecksums: number[] = [];
    const sentPulses: number[] = [];

    const handlers = {
      sendFrameInputs: (batch: { latestFrame: number }) => {
        sentInputs.push(batch.latestFrame);
      },
      sendChecksum: (checksum: { frame: number }) => {
        sentChecksums.push(checksum.frame);
      },
      sendSyncPulse: (pulse: { frame: number }) => {
        sentPulses.push(pulse.frame);
      },
    };

    outbox.enqueueInput(
      { port: 1, latestFrame: 10, ackFrame: 9, inputs: [{ frame: 10, mask: 1 }] },
      handlers
    );
    outbox.enqueueInput(
      { port: 1, latestFrame: 11, ackFrame: 9, inputs: [{ frame: 11, mask: 2 }] },
      handlers
    );
    outbox.enqueueInput(
      { port: 1, latestFrame: 12, ackFrame: 9, inputs: [{ frame: 12, mask: 3 }] },
      handlers
    );
    outbox.enqueueChecksum({ frame: 12, checksum: 'abc' }, handlers);
    outbox.enqueueSyncPulse({ pulseId: 1, port: 1, frame: 12, sentAtMs: 1234 }, handlers);

    // Must not have executed synchronously inside the emulation tick
    assert.equal(sentInputs.length, 0);
    assert.equal(sentChecksums.length, 0);
    assert.equal(sentPulses.length, 0);

    await Promise.resolve();

    // Only the newest coalesced packet of each kind is transmitted asynchronously
    assert.deepEqual(sentInputs, [12]);
    assert.deepEqual(sentChecksums, [12]);
    assert.deepEqual(sentPulses, [12]);
    assert.equal(outbox.getFlushedPacketCount(), 3);
  });
});

describe('AsyncFrameShareGate', () => {
  it('drops overlapping capture requests under backpressure without stalling local loop', () => {
    const gate = new AsyncFrameShareGate(150);

    assert.equal(gate.canStartCapture(1000), true);
    // While encoding/uploading is still inFlight, further ticks drop immediately
    assert.equal(gate.canStartCapture(1200), false);
    assert.equal(gate.canStartCapture(1400), false);
    assert.equal(gate.getStats().droppedDueToBackpressure, 2);

    gate.markCaptureComplete();
    // Respects minimum interval since last start
    assert.equal(gate.canStartCapture(1050), false);
    assert.equal(gate.canStartCapture(1200), true);
    gate.markCaptureComplete();
    assert.equal(gate.getStats().completedFrames, 2);
  });
});
