import React from 'react';
import { FolderOpen, RotateCcw } from 'lucide-react';
import {
  NES_HEIGHT,
  NES_WIDTH,
  type INesEmulatorCore,
} from '../emulator/core/INesEmulatorCore';
import type {
  CrtDisplayMode,
  ScreenAspectRatio,
  VideoFilterMode,
} from '../emulator/settings/emulatorSettingsStore';
import {
  REMOTE_RENDER_TARGET_FPS,
  REMOTE_UPSCALE_HEIGHT,
  REMOTE_UPSCALE_WIDTH,
  RemoteFrameRafThrottler,
  resolveEmulatorShaderBypass,
} from '../emulator/race/remoteRenderThrottler';
import {
  computeVideoFrameRect,
  type EffectiveOrientation,
} from '../emulator/settings/viewportLayout';

export interface RemoteOpponentViewConfig {
  active: boolean;
  previewDataUrl: string | null;
  label?: string;
  emptyMessage?: string;
  targetFps?: number;
}

interface LocalCoreCanvasProps {
  core: INesEmulatorCore;
  canvasFilterClass: string;
  pixelatedFastPass: boolean;
  onCanvasReady: (core: INesEmulatorCore, canvas: HTMLCanvasElement) => void;
}

/**
 * Isolated 60 FPS primary emulation surface.
 * Strictly decoupled from remote opponent state so incoming remote frames NEVER trigger
 * React re-renders or interfere with the local FCEUmm core render loop.
 */
const LocalCoreCanvas: React.FC<LocalCoreCanvasProps> = React.memo(
  ({ core, canvasFilterClass, pixelatedFastPass, onCanvasReady }) => {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const pixelatedFastPassRef = React.useRef(pixelatedFastPass);
    pixelatedFastPassRef.current = pixelatedFastPass;

    React.useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (core.rendersOwnCanvas) {
        core.attachCanvas?.(canvas);
        onCanvasReady(core, canvas);
        return () => {
          core.attachCanvas?.(null);
        };
      }

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) return;
      ctx.imageSmoothingEnabled = !pixelatedFastPassRef.current;

      const imageData = ctx.createImageData(NES_WIDTH, NES_HEIGHT);
      const dst32 = new Uint32Array(imageData.data.buffer);

      dst32.fill(0xff100c09);
      ctx.putImageData(imageData, 0, 0);

      const unsubscribe = core.onFrame((rgbaFrame) => {
        if (pixelatedFastPassRef.current && ctx.imageSmoothingEnabled) {
          ctx.imageSmoothingEnabled = false;
        }
        dst32.set(rgbaFrame);
        ctx.putImageData(imageData, 0, 0);
      });

      onCanvasReady(core, canvas);

      return () => {
        unsubscribe();
      };
    }, [core, onCanvasReady]);

    return (
      <canvas
        key={core.coreId}
        ref={canvasRef}
        width={NES_WIDTH}
        height={NES_HEIGHT}
        data-testid="nes-canvas"
        data-core={core.coreId}
        data-core-canvas="true"
        data-render-pass={pixelatedFastPass ? 'pixelated-fast' : 'standard'}
        className={`${canvasFilterClass} block h-full w-full`}
      />
    );
  }
);

LocalCoreCanvas.displayName = 'LocalCoreCanvas';

export interface RemoteOpponentCanvasProps {
  previewDataUrl: string | null;
  alt?: string;
  emptyMessage?: string;
  targetFps?: number;
  testId?: string;
}

/**
 * Independent remote opponent viewport renderer.
 * - Strictly separated from the local 60 FPS emulation loop.
 * - Uses a lightweight on-demand requestAnimationFrame throttler locked to 15 FPS (~66.7ms).
 * - Paints into a low-resolution 128x120 backing canvas upscaled on the GPU compositor via
 *   `image-rendering: pixelated` with zero CRT/CSS shader overhead.
 */
export const RemoteOpponentCanvas: React.FC<RemoteOpponentCanvasProps> = React.memo(
  ({
    previewDataUrl,
    alt = 'Remote opponent live screen',
    emptyMessage = 'Waiting for opponent screen preview...',
    targetFps = REMOTE_RENDER_TARGET_FPS,
    testId = 'remote-opponent-canvas',
  }) => {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const throttlerRef = React.useRef<RemoteFrameRafThrottler<string>>(
      new RemoteFrameRafThrottler<string>(targetFps)
    );
    const rafIdRef = React.useRef<number | null>(null);
    const decodeSeqRef = React.useRef(0);
    const mountedRef = React.useRef(true);
    const [hasPaintedFrame, setHasPaintedFrame] = React.useState(false);

    React.useEffect(() => {
      throttlerRef.current = new RemoteFrameRafThrottler<string>(targetFps);
    }, [targetFps]);

    React.useEffect(() => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
        decodeSeqRef.current += 1;
        if (rafIdRef.current !== null) {
          window.cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        throttlerRef.current.reset();
      };
    }, []);

    React.useEffect(() => {
      if (!previewDataUrl) {
        decodeSeqRef.current += 1;
        if (rafIdRef.current !== null) {
          window.cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        throttlerRef.current.reset();
        setHasPaintedFrame(false);
        return;
      }

      const throttler = throttlerRef.current;
      throttler.enqueue(previewDataUrl);

      const paintFrame = (frameUrl: string) => {
        const seq = ++decodeSeqRef.current;
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          if (!mountedRef.current || seq !== decodeSeqRef.current) return;
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext('2d', { alpha: false });
          if (!ctx) return;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0, REMOTE_UPSCALE_WIDTH, REMOTE_UPSCALE_HEIGHT);
          setHasPaintedFrame((prev) => (prev ? prev : true));
        };
        img.src = frameUrl;
      };

      const stepRaf = (now: number) => {
        rafIdRef.current = null;
        if (!mountedRef.current) return;

        const dueFrame = throttler.consumeIfDue(now);
        if (dueFrame !== null) {
          paintFrame(dueFrame);
        }

        // Only keep the lightweight RAF loop alive while a newer throttled frame is still queued
        if (throttler.hasPendingFrame()) {
          rafIdRef.current = window.requestAnimationFrame(stepRaf);
        }
      };

      if (rafIdRef.current === null) {
        rafIdRef.current = window.requestAnimationFrame(stepRaf);
      }
    }, [previewDataUrl]);

    return (
      <div
        data-testid={`${testId}-container`}
        data-remote-fps={targetFps}
        data-remote-resolution={`${REMOTE_UPSCALE_WIDTH}x${REMOTE_UPSCALE_HEIGHT}`}
        className="relative h-full w-full overflow-hidden bg-[#080B14]"
      >
        <canvas
          ref={canvasRef}
          width={REMOTE_UPSCALE_WIDTH}
          height={REMOTE_UPSCALE_HEIGHT}
          aria-label={alt}
          data-testid={testId}
          data-remote-canvas="true"
          data-remote-fps={targetFps}
          className={`nes-canvas-pixelated h-full w-full object-contain ${
            hasPaintedFrame ? 'block' : 'hidden'
          }`}
        />
        {!hasPaintedFrame && (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[#080B14] px-4 text-center">
            <span className="font-display text-xs font-bold text-[#94A3B8]">
              {emptyMessage}
            </span>
          </div>
        )}
      </div>
    );
  }
);

RemoteOpponentCanvas.displayName = 'RemoteOpponentCanvas';

interface EmulatorCanvasProps {
  core: INesEmulatorCore;
  hasRomLoaded: boolean;
  videoFilter: VideoFilterMode;
  crtMode: CrtDisplayMode;
  aspectRatio: ScreenAspectRatio;
  orientation: EffectiveOrientation;
  isLoadingCore: boolean;
  coreError: string | null;
  isOnlineMatchActive?: boolean;
  bypassShaderOverhead?: boolean;
  remoteOpponentView?: RemoteOpponentViewConfig | null;
  onCanvasReady: (core: INesEmulatorCore, canvas: HTMLCanvasElement) => void;
  onRequestLoadRomFile: () => void;
  onRetryCore: () => void;
  onDropRomFile: (file: File) => void;
}

export const EmulatorCanvas: React.FC<EmulatorCanvasProps> = React.memo(
  ({
    core,
    hasRomLoaded,
    videoFilter,
    crtMode,
    aspectRatio,
    orientation,
    isLoadingCore,
    coreError,
    isOnlineMatchActive = false,
    bypassShaderOverhead = false,
    remoteOpponentView = null,
    onCanvasReady,
    onRequestLoadRomFile,
    onRetryCore,
    onDropRomFile,
  }) => {
    const stageRef = React.useRef<HTMLDivElement | null>(null);
    const [isDragging, setIsDragging] = React.useState(false);
    const [stageSize, setStageSize] = React.useState<{ width: number; height: number }>({
      width: 0,
      height: 0,
    });

    React.useEffect(() => {
      const stage = stageRef.current;
      if (!stage) return;

      const measure = () => {
        const rect = stage.getBoundingClientRect();
        setStageSize((prev) => {
          const w = Math.floor(rect.width);
          const h = Math.floor(rect.height);
          if (prev.width === w && prev.height === h) return prev;
          return { width: w, height: h };
        });
      };

      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(stage);
      return () => ro.disconnect();
    }, []);

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isDragging) setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) {
        onDropRomFile(file);
      }
    };

    const hasRemoteOpponentView = Boolean(remoteOpponentView?.active);
    const shaderState = React.useMemo(
      () =>
        resolveEmulatorShaderBypass({
          isOnlineMatchActive,
          bypassShaderOverhead,
          hasRemoteOpponentView,
          videoFilter,
          crtMode,
        }),
      [isOnlineMatchActive, bypassShaderOverhead, hasRemoteOpponentView, videoFilter, crtMode]
    );
    const isPixelatedFastPass = shaderState.renderPass === 'pixelated-fast';

    const frameShellClass =
      aspectRatio === 'full'
        ? 'border border-white/10 bg-[#05070C]'
        : isPixelatedFastPass
          ? 'rounded-lg border border-white/10 bg-[#080A10] p-0.5'
          : crtMode === 'pvm-border'
            ? 'rounded-xl border-2 border-[#22D3EE]/35 bg-[#0D1220] p-2 shadow-[0_18px_50px_rgba(0,0,0,0.85)] sm:p-3'
            : crtMode === 'scanlines'
              ? 'rounded-lg border border-white/12 bg-[#090C14] p-1 shadow-xl shadow-black/80'
              : 'rounded-lg border border-white/10 bg-[#080A10] p-0.5 shadow-lg shadow-black/65';

    const frameRect = React.useMemo(() => {
      if (stageSize.width <= 0 || stageSize.height <= 0) {
        return null;
      }
      return computeVideoFrameRect(stageSize.width, stageSize.height, aspectRatio, orientation);
    }, [stageSize.width, stageSize.height, aspectRatio, orientation]);

    const containerStyle: React.CSSProperties = frameRect
      ? {
          width: `${frameRect.width}px`,
          height: `${frameRect.height}px`,
        }
      : aspectRatio === 'full'
        ? { width: '100%', height: '100%' }
        : aspectRatio === 'fit'
          ? { aspectRatio: '16 / 10', maxWidth: '100%', maxHeight: '100%', height: '100%' }
          : { aspectRatio: '4 / 3', maxWidth: '100%', maxHeight: '100%', height: '100%' };

    return (
      <div
        ref={stageRef}
        data-testid="emulator-stage-container"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex h-full w-full items-center justify-center overflow-hidden ${
          aspectRatio === 'full' ? 'p-0' : orientation === 'portrait' ? 'px-2 py-1.5' : 'px-3 py-2'
        }`}
      >
        {/* Precisely Sized Local 60 FPS NES Display Frame (Zero Clipping / Zero Distortion) */}
        <div
          data-testid="nes-video-frame"
          data-crt-mode={shaderState.bypassActive ? 'off' : crtMode}
          data-video-filter={isPixelatedFastPass ? 'crisp-pixel' : videoFilter}
          data-aspect-ratio={aspectRatio}
          data-orientation={orientation}
          data-shader-bypassed={shaderState.bypassActive ? 'true' : 'false'}
          data-render-pass={shaderState.renderPass}
          data-online-match={isOnlineMatchActive ? 'true' : 'false'}
          className={`relative flex max-h-full max-w-full shrink-0 items-center justify-center ${
            isPixelatedFastPass ? '' : 'transition-[border-color] duration-150'
          } ${frameShellClass} ${isDragging ? 'border-[#22D3EE]' : ''}`}
          style={containerStyle}
        >
          {shaderState.pvmBezelEnabled && aspectRatio !== 'full' && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute right-4 bottom-0.5 left-4 flex items-center justify-between text-[9px] font-semibold tracking-widest text-[#22D3EE]/45"
            >
              <span className="font-display">TGK RETRO 4.4</span>
              <span className="font-mono-tabular">NES · 60Hz</span>
            </div>
          )}

          <div
            className={`relative h-full w-full overflow-hidden bg-black ${
              aspectRatio === 'full' ? '' : 'rounded-md'
            }`}
          >
            <LocalCoreCanvas
              core={core}
              canvasFilterClass={shaderState.canvasFilterClass}
              pixelatedFastPass={isPixelatedFastPass}
              onCanvasReady={onCanvasReady}
            />

            {shaderState.crtOverlayEnabled && crtMode === 'scanlines' && (
              <div
                aria-hidden="true"
                className="crt-scanlines crt-vignette pointer-events-none absolute inset-0"
              />
            )}
            {shaderState.crtOverlayEnabled && crtMode === 'pvm-border' && (
              <div
                aria-hidden="true"
                className="crt-aperture-grille crt-vignette pointer-events-none absolute inset-0"
              />
            )}

            {isLoadingCore && (
              <div
                role="status"
                aria-live="polite"
                className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-[#070910]/94 px-6 text-center"
              >
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#22D3EE] border-t-transparent" />
                <div className="font-display text-sm font-bold text-[#F8FAFC]">
                  Starting Game...
                </div>
                <div className="text-xs text-[#94A3B8]">
                  Preparing FCEUmm NES console
                </div>
              </div>
            )}

            {!isLoadingCore && !coreError && !hasRomLoaded && (
              <div
                data-testid="canvas-empty-rom-prompt"
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#080B14]/95 px-6 text-center"
              >
                <div className="font-display text-lg font-extrabold text-[#F8FAFC]">
                  Ready to Play
                </div>
                <p className="max-w-xs text-xs leading-relaxed text-[#94A3B8]">
                  Choose any .nes game file from your device or drop it right here to start playing.
                </p>
                <button
                  type="button"
                  onClick={onRequestLoadRomFile}
                  className="tactile-press mt-1 inline-flex h-10 items-center gap-2 rounded-lg bg-[#22D3EE] px-5 font-display text-xs font-extrabold text-[#070910] hover:bg-[#38BDF8]"
                >
                  <FolderOpen className="h-4 w-4" aria-hidden="true" />
                  <span>Choose .nes Game</span>
                </button>
              </div>
            )}

            {!isLoadingCore && coreError && (
              <div
                role="alert"
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#080B14]/95 px-6 text-center"
              >
                <div className="font-display text-sm font-bold text-[#FCA5A5]">
                  Could Not Start This Game
                </div>
                <p className="max-w-sm text-xs leading-relaxed text-[#CBD5E1]">
                  {coreError}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={onRetryCore}
                    className="tactile-press inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#22D3EE] px-4 font-display text-xs font-bold text-[#070910] hover:bg-[#38BDF8]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Retry</span>
                  </button>
                  <button
                    type="button"
                    onClick={onRequestLoadRomFile}
                    className="tactile-press inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-[#141A29] px-3.5 text-xs font-semibold text-[#F8FAFC] hover:border-white/30"
                  >
                    <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Pick Another Game</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {isDragging && (
            <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-md bg-[#070910]/90">
              <span className="font-display text-base font-bold text-[#22D3EE]">
                Drop .nes Game to Play
              </span>
            </div>
          )}
        </div>

        {/* Strictly Decoupled 15 FPS Remote Opponent Companion Preview (Zero Impact on Local 60 FPS Core) */}
        {hasRemoteOpponentView && remoteOpponentView && (
          <div
            data-testid="emulator-remote-opponent-view"
            className="pointer-events-none absolute right-3 bottom-3 z-20 w-36 overflow-hidden rounded-lg border border-[#F59E0B]/45 bg-[#080B14] shadow-xl sm:w-44"
            style={{ aspectRatio: '4 / 3' }}
          >
            {remoteOpponentView.label && (
              <div className="absolute top-1 left-1.5 z-10 rounded bg-black/75 px-1.5 py-0.5 font-display text-[9px] font-bold tracking-wide text-[#FCD34D]">
                {remoteOpponentView.label}
              </div>
            )}
            <RemoteOpponentCanvas
              previewDataUrl={remoteOpponentView.previewDataUrl}
              alt={remoteOpponentView.label ?? 'Remote opponent live screen'}
              emptyMessage={remoteOpponentView.emptyMessage ?? 'Waiting for opponent...'}
              targetFps={remoteOpponentView.targetFps ?? REMOTE_RENDER_TARGET_FPS}
              testId="emulator-remote-canvas"
            />
          </div>
        )}
      </div>
    );
  }
);

EmulatorCanvas.displayName = 'EmulatorCanvas';
