import { AsyncFrameShareGate } from '../netplay/asyncOutbox';
import type { PlayerPort } from '../netplay/protocol';
import type { CrtDisplayMode, VideoFilterMode } from '../settings/emulatorSettingsStore';

/**
 * Low-resolution compressed opponent screen-share constants for Dual-Screen 1P VS Mode.
 * - 128x120 = exact 1/2 NES resolution (4x fewer pixels than 256x240)
 * - 12 FPS (84ms min interval) stays strictly within 10–15 FPS off the 60Hz emulation loop
 */
export const VS_SHARE_WIDTH = 128;
export const VS_SHARE_HEIGHT = 120;
export const VS_SHARE_TARGET_FPS = 12;
export const VS_SHARE_MIN_INTERVAL_MS = Math.round(1000 / VS_SHARE_TARGET_FPS); // ~83ms (~12 FPS)
export const VS_SHARE_QUALITY = 0.35;

export interface VsCorePlan {
  bootCore1: boolean;
  bootCore2: boolean;
  activeCoreCount: 1 | 2;
  localPort: PlayerPort;
  remotePort: PlayerPort | null;
}

/**
 * Guarantees that Online Dual-Screen VS Mode ALWAYS boots strictly ONE (1) local
 * FCEUmm core on the user's device, even while the room is still connecting or reconnecting.
 * The opponent viewport renders strictly from the incoming remote preview stream.
 */
export function resolveVsCorePlan(params: {
  isOnlineMode: boolean;
  localPort: PlayerPort;
}): VsCorePlan {
  if (params.isOnlineMode) {
    const localPort: PlayerPort = params.localPort === 2 ? 2 : 1;
    const remotePort: PlayerPort = localPort === 1 ? 2 : 1;
    return {
      bootCore1: localPort === 1,
      bootCore2: localPort === 2,
      activeCoreCount: 1,
      localPort,
      remotePort,
    };
  }

  // Offline 2-Player Local Couch VS requires 2 local cores (P1 + P2 on same device)
  return {
    bootCore1: true,
    bootCore2: true,
    activeCoreCount: 2,
    localPort: 1,
    remotePort: null,
  };
}

export interface VsShaderPolicy {
  bypassCrtShaders: boolean;
  crtOverlayEnabled: boolean;
  canvasFilterClass: 'nes-canvas-pixelated' | 'nes-canvas-smooth';
}

/**
 * Automatically bypasses heavy CRT/PVM scanline overlays, aperture grille, vignette shadows,
 * and full-screen CSS color filters during Dual-Screen VS Mode so local gameplay stays at 60 FPS.
 */
export function resolveVsShaderPolicy(
  videoFilter: VideoFilterMode,
  _crtMode: CrtDisplayMode
): VsShaderPolicy {
  return {
    bypassCrtShaders: true,
    crtOverlayEnabled: false,
    canvasFilterClass:
      videoFilter === 'smooth-linear' ? 'nes-canvas-smooth' : 'nes-canvas-pixelated',
  };
}

export function shouldCaptureRemoteFrame(params: {
  isOnlineMode: boolean;
  hasRemotePeer: boolean;
  isPaused: boolean;
  isFinished: boolean;
  nowMs: number;
  gate: AsyncFrameShareGate;
}): boolean {
  if (!params.isOnlineMode || !params.hasRemotePeer || params.isPaused || params.isFinished) {
    return false;
  }
  return params.gate.canStartCapture(params.nowMs);
}

let cachedPreferredMime: 'image/webp' | 'image/jpeg' | null = null;

function resolveCompressedMimeType(canvas: HTMLCanvasElement): 'image/webp' | 'image/jpeg' {
  if (cachedPreferredMime) return cachedPreferredMime;
  try {
    const probe = canvas.toDataURL('image/webp', 0.35);
    cachedPreferredMime = probe.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
  } catch {
    cachedPreferredMime = 'image/jpeg';
  }
  return cachedPreferredMime;
}

/**
 * Captures a tiny 128x120 compressed frame asynchronously without touching the 60 FPS
 * requestAnimationFrame loop. Resolves to a small base64 data URL (typically ~2–4 KB)
 * or null if cancelled/unavailable.
 */
export function captureCompressedVsFrame(
  sourceCanvas: HTMLCanvasElement,
  scratchCanvas: HTMLCanvasElement,
  scratchCtx: CanvasRenderingContext2D,
  isCancelled: () => boolean
): Promise<string | null> {
  return new Promise((resolve) => {
    if (isCancelled()) {
      resolve(null);
      return;
    }

    try {
      scratchCtx.imageSmoothingEnabled = false;
      scratchCtx.drawImage(sourceCanvas, 0, 0, VS_SHARE_WIDTH, VS_SHARE_HEIGHT);
      const mime = resolveCompressedMimeType(scratchCanvas);

      scratchCanvas.toBlob(
        (blob) => {
          if (isCancelled() || !blob) {
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () => {
            if (isCancelled()) {
              resolve(null);
              return;
            }
            resolve(typeof reader.result === 'string' ? reader.result : null);
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        },
        mime,
        VS_SHARE_QUALITY
      );
    } catch {
      resolve(null);
    }
  });
}

/**
 * Schedules a non-blocking low-priority capture callback off the 60 FPS emulation frame.
 */
export function scheduleIdleCaptureTask(task: () => void): () => void {
  const w = window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof w.requestIdleCallback === 'function') {
    const idleId = w.requestIdleCallback(task, { timeout: 40 });
    return () => {
      if (typeof w.cancelIdleCallback === 'function') {
        w.cancelIdleCallback(idleId);
      }
    };
  }
  const timerId = window.setTimeout(task, 0);
  return () => window.clearTimeout(timerId);
}
