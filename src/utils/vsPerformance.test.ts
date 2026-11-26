import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AsyncFrameShareGate } from '../emulator/netplay/asyncOutbox';
import {
  VS_SHARE_HEIGHT,
  VS_SHARE_MIN_INTERVAL_MS,
  VS_SHARE_TARGET_FPS,
  VS_SHARE_WIDTH,
  resolveVsCorePlan,
  resolveVsShaderPolicy,
  shouldCaptureRemoteFrame,
} from '../emulator/race/remoteFrameCapture';
import {
  REMOTE_RENDER_MIN_INTERVAL_MS,
  REMOTE_RENDER_TARGET_FPS,
  REMOTE_UPSCALE_HEIGHT,
  REMOTE_UPSCALE_WIDTH,
  RemoteFrameRafThrottler,
  resolveEmulatorShaderBypass,
} from '../emulator/race/remoteRenderThrottler';
import { installWakeLockPolicyGuard } from '../emulator/core/wakeLockGuard';

describe('Dual-Screen VS Mode 60 FPS Performance Guarantees', () => {
  it('boots strictly 1 local FCEUmm core in Online VS Mode for both P1 and P2', () => {
    const p1Plan = resolveVsCorePlan({ isOnlineMode: true, localPort: 1 });
    assert.equal(p1Plan.activeCoreCount, 1);
    assert.equal(p1Plan.bootCore1, true);
    assert.equal(p1Plan.bootCore2, false);
    assert.equal(p1Plan.remotePort, 2);

    const p2Plan = resolveVsCorePlan({ isOnlineMode: true, localPort: 2 });
    assert.equal(p2Plan.activeCoreCount, 1);
    assert.equal(p2Plan.bootCore1, false);
    assert.equal(p2Plan.bootCore2, true);
    assert.equal(p2Plan.remotePort, 1);

    const localCouchPlan = resolveVsCorePlan({ isOnlineMode: false, localPort: 1 });
    assert.equal(localCouchPlan.activeCoreCount, 2);
    assert.equal(localCouchPlan.bootCore1, true);
    assert.equal(localCouchPlan.bootCore2, true);
  });

  it('automatically bypasses heavy CRT/PVM shaders and CSS filters in Dual-Screen VS Mode', () => {
    const warmPvm = resolveVsShaderPolicy('warm-phosphor', 'pvm-border');
    assert.equal(warmPvm.bypassCrtShaders, true);
    assert.equal(warmPvm.crtOverlayEnabled, false);
    assert.equal(warmPvm.canvasFilterClass, 'nes-canvas-pixelated');

    const monoScanlines = resolveVsShaderPolicy('mono-pocket', 'scanlines');
    assert.equal(monoScanlines.bypassCrtShaders, true);
    assert.equal(monoScanlines.crtOverlayEnabled, false);
    assert.equal(monoScanlines.canvasFilterClass, 'nes-canvas-pixelated');

    const smooth = resolveVsShaderPolicy('smooth-linear', 'pvm-border');
    assert.equal(smooth.crtOverlayEnabled, false);
    assert.equal(smooth.canvasFilterClass, 'nes-canvas-smooth');
  });

  it('throttles screen-share capture to 10-15 FPS at 128x120 and skips when solo or backpressured', () => {
    assert.equal(VS_SHARE_WIDTH, 128);
    assert.equal(VS_SHARE_HEIGHT, 120);
    assert.ok(
      VS_SHARE_TARGET_FPS >= 10 && VS_SHARE_TARGET_FPS <= 15,
      `target FPS ${VS_SHARE_TARGET_FPS} must be within 10-15 FPS`
    );

    const gate = new AsyncFrameShareGate(VS_SHARE_MIN_INTERVAL_MS);

    // Must not capture when waiting alone (no opponent joined yet)
    assert.equal(
      shouldCaptureRemoteFrame({
        isOnlineMode: true,
        hasRemotePeer: false,
        isPaused: false,
        isFinished: false,
        nowMs: 1000,
        gate,
      }),
      false
    );

    // Allows first capture once opponent is connected
    assert.equal(
      shouldCaptureRemoteFrame({
        isOnlineMode: true,
        hasRemotePeer: true,
        isPaused: false,
        isFinished: false,
        nowMs: 1000,
        gate,
      }),
      true
    );

    // Rejects overlapping capture while encoding is still in flight
    assert.equal(
      shouldCaptureRemoteFrame({
        isOnlineMode: true,
        hasRemotePeer: true,
        isPaused: false,
        isFinished: false,
        nowMs: 1200,
        gate,
      }),
      false
    );

    gate.markCaptureComplete();

    // Enforces 10-15 FPS throttle interval (rejects 40ms later, allows 90ms later)
    assert.equal(
      shouldCaptureRemoteFrame({
        isOnlineMode: true,
        hasRemotePeer: true,
        isPaused: false,
        isFinished: false,
        nowMs: 1040,
        gate,
      }),
      false
    );
    assert.equal(
      shouldCaptureRemoteFrame({
        isOnlineMode: true,
        hasRemotePeer: true,
        isPaused: false,
        isFinished: false,
        nowMs: 1090,
        gate,
      }),
      true
    );
  });

  it('throttles RemoteOpponentCanvas RAF rendering strictly to 15 FPS at 128x120 with latest-frame-wins coalescing', () => {
    assert.equal(REMOTE_RENDER_TARGET_FPS, 15);
    assert.equal(REMOTE_UPSCALE_WIDTH, 128);
    assert.equal(REMOTE_UPSCALE_HEIGHT, 120);
    assert.ok(Math.abs(REMOTE_RENDER_MIN_INTERVAL_MS - 1000 / 15) < 0.01);

    const throttler = new RemoteFrameRafThrottler<string>(15);
    const rendered: string[] = [];

    // Simulate 60Hz RAF loop with incoming remote frames every 16.6667ms over 1000ms (60 ticks)
    const rafStepMs = 1000 / 60;
    for (let i = 0; i < 60; i++) {
      const now = i * rafStepMs;
      throttler.enqueue(`frame-${i}`);
      const due = throttler.consumeIfDue(now);
      if (due !== null) {
        rendered.push(due);
      }
    }

    // 60 ticks at 60Hz throttled to 15 FPS must emit strictly 15 frames (every 4th 60Hz tick)
    assert.equal(rendered.length, 15);
    assert.equal(rendered[0], 'frame-0');
    assert.equal(rendered[1], 'frame-4');
    assert.equal(rendered[14], 'frame-56');

    const stats = throttler.getStats();
    assert.equal(stats.renderedFrames, 15);
    assert.equal(stats.droppedFrames, 44); // 60 enqueued - 15 rendered - 1 pending at tick 59 = 44 coalesced

    // Idle check: without new enqueue, consumeIfDue returns null even well past interval
    throttler.reset();
    assert.equal(throttler.hasPendingFrame(), false);
    assert.equal(throttler.consumeIfDue(5000), null);
  });

  it('dynamically bypasses CRT/PVM shaders to pixelated-fast pass during active online matches and restores offline', () => {
    // Active online match dynamically switches even smooth-linear + pvm-border to lightweight pixelated-fast pass
    const onlineSmoothPvm = resolveEmulatorShaderBypass({
      isOnlineMatchActive: true,
      bypassShaderOverhead: false,
      hasRemoteOpponentView: false,
      videoFilter: 'smooth-linear',
      crtMode: 'pvm-border',
    });
    assert.equal(onlineSmoothPvm.bypassActive, true);
    assert.equal(onlineSmoothPvm.renderPass, 'pixelated-fast');
    assert.equal(onlineSmoothPvm.crtOverlayEnabled, false);
    assert.equal(onlineSmoothPvm.pvmBezelEnabled, false);
    assert.equal(onlineSmoothPvm.canvasFilterClass, 'nes-canvas-pixelated');

    const bypassedViaRemote = resolveEmulatorShaderBypass({
      isOnlineMatchActive: false,
      bypassShaderOverhead: false,
      hasRemoteOpponentView: true,
      videoFilter: 'warm-phosphor',
      crtMode: 'pvm-border',
    });
    assert.equal(bypassedViaRemote.bypassActive, true);
    assert.equal(bypassedViaRemote.renderPass, 'pixelated-fast');
    assert.equal(bypassedViaRemote.crtOverlayEnabled, false);
    assert.equal(bypassedViaRemote.pvmBezelEnabled, false);
    assert.equal(bypassedViaRemote.canvasFilterClass, 'nes-canvas-pixelated');

    const bypassedExplicit = resolveEmulatorShaderBypass({
      isOnlineMatchActive: false,
      bypassShaderOverhead: true,
      hasRemoteOpponentView: false,
      videoFilter: 'mono-pocket',
      crtMode: 'scanlines',
    });
    assert.equal(bypassedExplicit.bypassActive, true);
    assert.equal(bypassedExplicit.renderPass, 'pixelated-fast');
    assert.equal(bypassedExplicit.crtOverlayEnabled, false);
    assert.equal(bypassedExplicit.canvasFilterClass, 'nes-canvas-pixelated');

    // Leaving online match dynamically restores user's standard CRT/filter settings
    const soloPvm = resolveEmulatorShaderBypass({
      isOnlineMatchActive: false,
      bypassShaderOverhead: false,
      hasRemoteOpponentView: false,
      videoFilter: 'warm-phosphor',
      crtMode: 'pvm-border',
    });
    assert.equal(soloPvm.bypassActive, false);
    assert.equal(soloPvm.renderPass, 'standard');
    assert.equal(soloPvm.crtOverlayEnabled, true);
    assert.equal(soloPvm.pvmBezelEnabled, true);
    assert.equal(soloPvm.canvasFilterClass, 'nes-canvas-pixelated nes-filter-warm-phosphor');
  });

  it('guards WakeLock permissions-policy NotAllowedError without blocking valid WakeLock requests', async () => {
    const blockedNav: {
      wakeLock: {
        request: (type?: 'screen') => Promise<import('../emulator/core/wakeLockGuard').WakeLockSentinelLike>;
      };
    } = {
      wakeLock: {
        request: () => {
          const err = new Error(
            "Failed to execute 'request' on 'WakeLock': Access to Screen Wake Lock features is disallowed by permissions policy"
          );
          err.name = 'NotAllowedError';
          return Promise.reject(err);
        },
      },
    };

    assert.equal(installWakeLockPolicyGuard(blockedNav), true);
    const fallbackSentinel = await blockedNav.wakeLock.request('screen');
    assert.equal(fallbackSentinel.type, 'screen');
    assert.equal(fallbackSentinel.released, true);
    await fallbackSentinel.release();

    const realSentinel = {
      released: false,
      type: 'screen' as const,
      onrelease: null,
      release: () => Promise.resolve(),
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    };
    const allowedNav: {
      wakeLock: {
        request: (type?: 'screen') => Promise<import('../emulator/core/wakeLockGuard').WakeLockSentinelLike>;
      };
    } = {
      wakeLock: {
        request: () => Promise.resolve(realSentinel),
      },
    };
    assert.equal(installWakeLockPolicyGuard(allowedNav), true);
    const acquired = await allowedNav.wakeLock.request('screen');
    assert.equal(acquired, realSentinel);
  });
});
