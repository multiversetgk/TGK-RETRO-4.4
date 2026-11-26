import type {
  ScreenAspectRatio,
  ScreenOrientationMode,
} from './emulatorSettingsStore';

export type EffectiveOrientation = 'portrait' | 'landscape';

export interface VideoFrameRect {
  width: number;
  height: number;
  aspectRatio: ScreenAspectRatio;
  orientation: EffectiveOrientation;
}

/**
 * Resolves the effective layout orientation from the user's preference
 * ('auto' | 'portrait' | 'landscape') and the current stage viewport size.
 */
export function resolveEffectiveOrientation(
  preference: ScreenOrientationMode,
  viewportWidth: number,
  viewportHeight: number
): EffectiveOrientation {
  if (preference === 'portrait') return 'portrait';
  if (preference === 'landscape') return 'landscape';
  if (viewportWidth <= 0 || viewportHeight <= 0) return 'landscape';
  return viewportHeight > viewportWidth * 1.05 ? 'portrait' : 'landscape';
}

/**
 * Computes exact pixel dimensions for the NES game frame inside the available
 * stage area without ever clipping, overflowing, or distorting proportions.
 *
 * - '4:3'  (4:3 Original): Strict classic 4:3 CRT TV aspect ratio (1.333:1),
 *   centered inside the safe stage area.
 * - 'fit'  (Fit Screen): Maximizes visible screen area edge-to-edge using an
 *   immersive 16:10 (or container-clamped) aspect fit with zero cropping.
 * - 'full' (Full Stretch): Fills 100% of available stage width and height.
 */
export function computeVideoFrameRect(
  availableWidth: number,
  availableHeight: number,
  aspectRatio: ScreenAspectRatio,
  orientation: EffectiveOrientation
): VideoFrameRect {
  const safeW = Math.max(1, Math.floor(availableWidth));
  const safeH = Math.max(1, Math.floor(availableHeight));

  if (aspectRatio === 'full') {
    return {
      width: safeW,
      height: safeH,
      aspectRatio,
      orientation,
    };
  }

  // '4:3' keeps classic CRT proportions with subtle framed breathing room;
  // 'fit' maximizes edge-to-edge screen area cleanly without clipping or shrinking on portrait.
  const targetRatio =
    aspectRatio === 'fit' ? (orientation === 'portrait' ? 4 / 3 : 16 / 10) : 4 / 3;
  const paddingPx = aspectRatio === '4:3' ? (orientation === 'portrait' ? 10 : 14) : 0;
  const maxW = Math.max(1, safeW - paddingPx * 2);
  const maxH = Math.max(1, safeH - paddingPx * 2);

  let width = maxW;
  let height = Math.round(width / targetRatio);

  if (height > maxH) {
    height = maxH;
    width = Math.round(height * targetRatio);
  }

  // Guarantee strict containment (zero clipping / zero overflow)
  width = Math.max(1, Math.min(maxW, width));
  height = Math.max(1, Math.min(maxH, height));

  return {
    width,
    height,
    aspectRatio,
    orientation,
  };
}
