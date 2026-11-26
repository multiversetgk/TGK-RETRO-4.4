import type { CrtDisplayMode, VideoFilterMode } from '../settings/emulatorSettingsStore';

/**
 * Lightweight 15 FPS remote opponent rendering constants.
 * - Backing canvas resolution is 128x120 (exact 1/2 NES resolution = 1/4 pixel area),
 *   upscaled on the GPU compositor via `image-rendering: pixelated` with zero shader overhead.
 * - Throttled strictly to 15 FPS (~66.67ms) inside an independent requestAnimationFrame loop
 *   so the local primary FCEUmm core always remains locked at 60 FPS.
 */
export const REMOTE_RENDER_TARGET_FPS = 15;
export const REMOTE_RENDER_MIN_INTERVAL_MS = 1000 / REMOTE_RENDER_TARGET_FPS;
export const REMOTE_UPSCALE_WIDTH = 128;
export const REMOTE_UPSCALE_HEIGHT = 120;

export interface RemoteThrottlerStats {
  renderedFrames: number;
  droppedFrames: number;
  targetFps: number;
  minIntervalMs: number;
}

/**
 * Pure latest-frame-wins requestAnimationFrame throttler for remote opponent previews.
 * Coalesces incoming bursts so only the freshest frame is painted at <= targetFps (default 15 FPS).
 */
export class RemoteFrameRafThrottler<TFrame> {
  readonly targetFps: number;
  readonly minIntervalMs: number;

  private pendingFrame: TFrame | null = null;
  private dirty = false;
  private lastRenderMs: number | null = null;
  private renderedFrames = 0;
  private droppedFrames = 0;

  constructor(targetFps: number = REMOTE_RENDER_TARGET_FPS) {
    this.targetFps = Math.max(1, Math.min(30, targetFps));
    this.minIntervalMs = 1000 / this.targetFps;
  }

  enqueue(frame: TFrame): void {
    if (this.dirty) {
      this.droppedFrames += 1;
    }
    this.pendingFrame = frame;
    this.dirty = true;
  }

  hasPendingFrame(): boolean {
    return this.dirty && this.pendingFrame !== null;
  }

  shouldRender(nowMs: number): boolean {
    if (!this.dirty || this.pendingFrame === null) {
      return false;
    }
    if (this.lastRenderMs === null) {
      return true;
    }
    // 0.5ms epsilon absorbs minor vsync RAF timestamp jitter around 66.67ms (4 x 16.67ms)
    return nowMs - this.lastRenderMs >= this.minIntervalMs - 0.5;
  }

  consumeIfDue(nowMs: number): TFrame | null {
    if (!this.shouldRender(nowMs)) {
      return null;
    }
    const frame = this.pendingFrame;
    this.dirty = false;
    this.lastRenderMs = nowMs;
    this.renderedFrames += 1;
    return frame;
  }

  getStats(): RemoteThrottlerStats {
    return {
      renderedFrames: this.renderedFrames,
      droppedFrames: this.droppedFrames,
      targetFps: this.targetFps,
      minIntervalMs: this.minIntervalMs,
    };
  }

  reset(): void {
    this.pendingFrame = null;
    this.dirty = false;
    this.lastRenderMs = null;
    this.renderedFrames = 0;
    this.droppedFrames = 0;
  }
}

export type EmulatorRenderPass = 'pixelated-fast' | 'standard';

export interface EmulatorShaderState {
  bypassActive: boolean;
  renderPass: EmulatorRenderPass;
  crtOverlayEnabled: boolean;
  pvmBezelEnabled: boolean;
  canvasFilterClass: string;
}

/**
 * Dynamically resolves shader and CRT/PVM overlay state for EmulatorCanvas.
 * When an online match is active (or remote opponent rendering / explicit shader bypass is enabled),
 * dynamically bypasses all heavy CRT/PVM overlays, aperture grille, vignette shadows, PVM bezel
 * effects, and CSS color/bilinear filters, switching directly to the lightweight `nes-canvas-pixelated`
 * render pass so the local core sustains 60 FPS during high-speed netplay.
 * Automatically restores the user's chosen CRT/filter settings once the online match ends.
 */
export function resolveEmulatorShaderBypass(params: {
  isOnlineMatchActive?: boolean;
  bypassShaderOverhead: boolean;
  hasRemoteOpponentView: boolean;
  videoFilter: VideoFilterMode;
  crtMode: CrtDisplayMode;
}): EmulatorShaderState {
  const bypassActive = Boolean(
    params.isOnlineMatchActive || params.bypassShaderOverhead || params.hasRemoteOpponentView
  );

  if (bypassActive) {
    return {
      bypassActive: true,
      renderPass: 'pixelated-fast',
      crtOverlayEnabled: false,
      pvmBezelEnabled: false,
      canvasFilterClass: 'nes-canvas-pixelated',
    };
  }

  const canvasFilterClass =
    params.videoFilter === 'smooth-linear'
      ? 'nes-canvas-smooth'
      : params.videoFilter === 'warm-phosphor'
        ? 'nes-canvas-pixelated nes-filter-warm-phosphor'
        : params.videoFilter === 'mono-pocket'
          ? 'nes-canvas-pixelated nes-filter-mono-pocket'
          : 'nes-canvas-pixelated';

  return {
    bypassActive: false,
    renderPass: 'standard',
    crtOverlayEnabled: params.crtMode === 'scanlines' || params.crtMode === 'pvm-border',
    pvmBezelEnabled: params.crtMode === 'pvm-border',
    canvasFilterClass,
  };
}
