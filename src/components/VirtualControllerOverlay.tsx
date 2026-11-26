import React from 'react';
import { Check, Move, RotateCcw, Sliders } from 'lucide-react';
import type { NesButtonName, PlayerPort } from '../emulator/netplay/protocol';
import type { TurboButtonName } from '../emulator/input/turboEngine';
import type { TurboRateHz } from '../emulator/settings/emulatorSettingsStore';
import {
  clampClusterPosition,
  type ControlClusterId,
  type GameLayoutProfile,
} from '../emulator/settings/gameLayoutStore';
import type { EffectiveOrientation } from '../emulator/settings/viewportLayout';

interface VirtualControllerOverlayProps {
  visible: boolean;
  isEditingLayout: boolean;
  orientation: EffectiveOrientation;
  activePort: PlayerPort;
  turboRateHz: TurboRateHz;
  layout: GameLayoutProfile;
  onButtonChange: (port: PlayerPort, button: NesButtonName, pressed: boolean) => void;
  onTurboChange: (port: PlayerPort, button: TurboButtonName, held: boolean) => void;
  onLayoutDraftChange: (next: GameLayoutProfile) => void;
  onSaveLayout: (profile: GameLayoutProfile) => void;
  onResetLayout: () => void;
  onExitEditLayout: () => void;
}

const DIRECTION_BUTTONS: NesButtonName[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

const LANDSCAPE_DEFAULT_ZONES: Record<ControlClusterId, { x: number; y: number }> = {
  movement: { x: 11, y: 66 },
  turbo: { x: 89, y: 42 },
  actions: { x: 89, y: 70 },
  meta: { x: 50, y: 92 },
};

const CLUSTER_SAFE_HALF: Record<ControlClusterId, { halfW: number; halfH: number }> = {
  movement: { halfW: 72, halfH: 72 },
  turbo: { halfW: 62, halfH: 36 },
  actions: { halfW: 76, halfH: 48 },
  meta: { halfW: 84, halfH: 26 },
};

export const VirtualControllerOverlay: React.FC<VirtualControllerOverlayProps> = ({
  visible,
  isEditingLayout,
  orientation,
  activePort,
  turboRateHz,
  layout,
  onButtonChange,
  onTurboChange,
  onLayoutDraftChange,
  onSaveLayout,
  onResetLayout,
  onExitEditLayout,
}) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const draggingClusterRef = React.useRef<ControlClusterId | null>(null);
  const stickBaseRef = React.useRef<HTMLDivElement | null>(null);
  const stickPointerIdRef = React.useRef<number | null>(null);
  const activeStickDirsRef = React.useRef<Record<'UP' | 'DOWN' | 'LEFT' | 'RIGHT', boolean>>({
    UP: false,
    DOWN: false,
    LEFT: false,
    RIGHT: false,
  });

  const [stickOffset, setStickOffset] = React.useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [pressedMap, setPressedMap] = React.useState<Record<string, boolean>>({});

  const releaseAllStickDirs = React.useCallback(() => {
    for (const dir of DIRECTION_BUTTONS) {
      const key = dir as 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
      if (activeStickDirsRef.current[key]) {
        activeStickDirsRef.current[key] = false;
        onButtonChange(activePort, key, false);
      }
    }
    setStickOffset({ x: 0, y: 0 });
  }, [activePort, onButtonChange]);

  React.useEffect(() => {
    if (!visible || isEditingLayout) {
      releaseAllStickDirs();
    }
  }, [visible, isEditingLayout, releaseAllStickDirs]);

  React.useEffect(() => {
    return () => {
      releaseAllStickDirs();
    };
  }, [releaseAllStickDirs]);

  React.useEffect(() => {
    if (!isEditingLayout) return;

    const handlePointerMove = (e: PointerEvent) => {
      const cluster = draggingClusterRef.current;
      const container = containerRef.current;
      if (!cluster || !container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const xPct = ((e.clientX - rect.left) / rect.width) * 100;
      const yPct = ((e.clientY - rect.top) / rect.height) * 100;
      const clamped = clampClusterPosition({ x: xPct, y: yPct });

      onLayoutDraftChange({
        ...layout,
        isCustomized: true,
        zones: {
          ...layout.zones,
          [cluster]: clamped,
        },
      });
    };

    const handlePointerUp = () => {
      draggingClusterRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isEditingLayout, layout, onLayoutDraftChange]);

  if (!visible && !isEditingLayout) return null;

  const updateStickFromPointer = (clientX: number, clientY: number) => {
    const base = stickBaseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxRadius = rect.width * 0.36;

    const dx = clientX - cx;
    const dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);

    const nx = dist > 0 ? Math.cos(angle) * clampedDist : 0;
    const ny = dist > 0 ? Math.sin(angle) * clampedDist : 0;
    setStickOffset({ x: nx, y: ny });

    const deadzone = maxRadius * 0.28;
    const nextDirs: Record<'UP' | 'DOWN' | 'LEFT' | 'RIGHT', boolean> = {
      LEFT: dx < -deadzone,
      RIGHT: dx > deadzone,
      UP: dy < -deadzone,
      DOWN: dy > deadzone,
    };

    for (const dir of ['UP', 'DOWN', 'LEFT', 'RIGHT'] as const) {
      if (activeStickDirsRef.current[dir] !== nextDirs[dir]) {
        activeStickDirsRef.current[dir] = nextDirs[dir];
        onButtonChange(activePort, dir, nextDirs[dir]);
      }
    }
  };

  const setKeyVisual = (key: string, down: boolean) => {
    setPressedMap((prev) => (prev[key] === down ? prev : { ...prev, [key]: down }));
  };

  const handlePadButton = (button: NesButtonName, pressed: boolean) => {
    if (isEditingLayout) return;
    setKeyVisual(button, pressed);
    onButtonChange(activePort, button, pressed);
  };

  const handleTurboButton = (button: TurboButtonName, held: boolean) => {
    if (isEditingLayout) return;
    setKeyVisual(`T_${button}`, held);
    onTurboChange(activePort, button, held);
  };

  const startDrag = (cluster: ControlClusterId) => (e: React.PointerEvent) => {
    if (!isEditingLayout) return;
    e.preventDefault();
    e.stopPropagation();
    draggingClusterRef.current = cluster;
  };

  const renderMovementControl = () =>
    layout.stickMode === 'thumbstick' ? (
      <div
        ref={stickBaseRef}
        role="application"
        aria-label="Virtual Thumbstick"
        data-testid="virtual-thumbstick"
        onPointerDown={(e) => {
          if (isEditingLayout) return;
          e.preventDefault();
          stickPointerIdRef.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          updateStickFromPointer(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (isEditingLayout || stickPointerIdRef.current !== e.pointerId) return;
          updateStickFromPointer(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (stickPointerIdRef.current === e.pointerId) {
            stickPointerIdRef.current = null;
            releaseAllStickDirs();
          }
        }}
        onPointerCancel={() => {
          stickPointerIdRef.current = null;
          releaseAllStickDirs();
        }}
        className="relative flex h-32 w-32 items-center justify-center rounded-full border-2 border-[#22D3EE]/40 bg-[#0D1322]/85 shadow-xl shadow-black/75 backdrop-blur-[2px]"
      >
        <div className="pointer-events-none absolute inset-2 rounded-full border border-white/8" />
        <span className="pointer-events-none absolute top-2 text-[9px] font-bold text-[#22D3EE]/45">
          ▲
        </span>
        <span className="pointer-events-none absolute bottom-2 text-[9px] font-bold text-[#22D3EE]/45">
          ▼
        </span>
        <span className="pointer-events-none absolute left-2 text-[9px] font-bold text-[#22D3EE]/45">
          ◀
        </span>
        <span className="pointer-events-none absolute right-2 text-[9px] font-bold text-[#22D3EE]/45">
          ▶
        </span>

        <div
          style={{
            transform: `translate3d(${stickOffset.x}px, ${stickOffset.y}px, 0)`,
          }}
          className="pointer-events-none flex h-14 w-14 items-center justify-center rounded-full border-2 border-[#22D3EE] bg-[#141E30] shadow-lg shadow-black/70 transition-transform duration-75"
        >
          <div className="h-7 w-7 rounded-full border border-white/15 bg-[#0B101C]" />
        </div>
      </div>
    ) : (
      <div
        data-testid="virtual-dpad"
        className="grid h-32 w-32 grid-cols-3 grid-rows-3 gap-0.5 rounded-2xl border border-[#22D3EE]/30 bg-[#0C111E]/85 p-1.5 shadow-xl shadow-black/75 backdrop-blur-[2px]"
      >
        <div />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Touch D-Pad Up"
          onPointerDown={(e) => {
            e.currentTarget.blur();
            handlePadButton('UP', true);
          }}
          onPointerUp={() => handlePadButton('UP', false)}
          onPointerLeave={() => handlePadButton('UP', false)}
          onPointerCancel={() => handlePadButton('UP', false)}
          className={`tactile-press flex items-center justify-center rounded-t-md border text-xs font-bold ${
            pressedMap.UP
              ? 'border-[#22D3EE] bg-[#22D3EE] text-[#070910]'
              : 'border-white/12 bg-[#161E31] text-[#CBD5E1]'
          }`}
        >
          ▲
        </button>
        <div />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Touch D-Pad Left"
          onPointerDown={(e) => {
            e.currentTarget.blur();
            handlePadButton('LEFT', true);
          }}
          onPointerUp={() => handlePadButton('LEFT', false)}
          onPointerLeave={() => handlePadButton('LEFT', false)}
          onPointerCancel={() => handlePadButton('LEFT', false)}
          className={`tactile-press flex items-center justify-center rounded-l-md border text-xs font-bold ${
            pressedMap.LEFT
              ? 'border-[#22D3EE] bg-[#22D3EE] text-[#070910]'
              : 'border-white/12 bg-[#161E31] text-[#CBD5E1]'
          }`}
        >
          ◀
        </button>
        <div className="flex items-center justify-center bg-[#121827]">
          <div className="h-3 w-3 rounded-full bg-[#090D16]" />
        </div>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Touch D-Pad Right"
          onPointerDown={(e) => {
            e.currentTarget.blur();
            handlePadButton('RIGHT', true);
          }}
          onPointerUp={() => handlePadButton('RIGHT', false)}
          onPointerLeave={() => handlePadButton('RIGHT', false)}
          onPointerCancel={() => handlePadButton('RIGHT', false)}
          className={`tactile-press flex items-center justify-center rounded-r-md border text-xs font-bold ${
            pressedMap.RIGHT
              ? 'border-[#22D3EE] bg-[#22D3EE] text-[#070910]'
              : 'border-white/12 bg-[#161E31] text-[#CBD5E1]'
          }`}
        >
          ▶
        </button>
        <div />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Touch D-Pad Down"
          onPointerDown={(e) => {
            e.currentTarget.blur();
            handlePadButton('DOWN', true);
          }}
          onPointerUp={() => handlePadButton('DOWN', false)}
          onPointerLeave={() => handlePadButton('DOWN', false)}
          onPointerCancel={() => handlePadButton('DOWN', false)}
          className={`tactile-press flex items-center justify-center rounded-b-md border text-xs font-bold ${
            pressedMap.DOWN
              ? 'border-[#22D3EE] bg-[#22D3EE] text-[#070910]'
              : 'border-white/12 bg-[#161E31] text-[#CBD5E1]'
          }`}
        >
          ▼
        </button>
        <div />
      </div>
    );

  const renderTurboCluster = () => (
    <div className="flex items-center gap-2.5 rounded-xl border border-[#F59E0B]/35 bg-[#15120B]/88 px-2.5 py-2 shadow-xl shadow-black/65 backdrop-blur-[2px]">
      <button
        type="button"
        tabIndex={-1}
        data-testid="turbo-b-button"
        aria-label={`Turbo B Rapid Fire (${turboRateHz}Hz)`}
        onPointerDown={(e) => {
          e.currentTarget.blur();
          handleTurboButton('B', true);
        }}
        onPointerUp={() => handleTurboButton('B', false)}
        onPointerLeave={() => handleTurboButton('B', false)}
        onPointerCancel={() => handleTurboButton('B', false)}
        className={`tactile-press flex h-11 w-11 flex-col items-center justify-center rounded-full border-2 font-display text-xs font-extrabold ${
          pressedMap.T_B
            ? 'border-[#FDE68A] bg-[#F59E0B] text-[#070910]'
            : 'border-[#F59E0B]/60 bg-[#231B0E] text-[#FCD34D]'
        }`}
      >
        <span>TB</span>
        <span className="font-mono-tabular text-[8px] font-medium opacity-80">
          {turboRateHz}Hz
        </span>
      </button>

      <button
        type="button"
        tabIndex={-1}
        data-testid="turbo-a-button"
        aria-label={`Turbo A Rapid Fire (${turboRateHz}Hz)`}
        onPointerDown={(e) => {
          e.currentTarget.blur();
          handleTurboButton('A', true);
        }}
        onPointerUp={() => handleTurboButton('A', false)}
        onPointerLeave={() => handleTurboButton('A', false)}
        onPointerCancel={() => handleTurboButton('A', false)}
        className={`tactile-press flex h-11 w-11 flex-col items-center justify-center rounded-full border-2 font-display text-xs font-extrabold ${
          pressedMap.T_A
            ? 'border-[#FDE68A] bg-[#F59E0B] text-[#070910]'
            : 'border-[#F59E0B]/60 bg-[#231B0E] text-[#FCD34D]'
        }`}
      >
        <span>TA</span>
        <span className="font-mono-tabular text-[8px] font-medium opacity-80">
          {turboRateHz}Hz
        </span>
      </button>
    </div>
  );

  const renderActionsCluster = () => (
    <div className="flex items-center gap-3 rounded-2xl border border-[#A78BFA]/30 bg-[#0C111E]/88 p-2.5 shadow-xl shadow-black/75 backdrop-blur-[2px]">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Touch Button B"
        onPointerDown={(e) => {
          e.currentTarget.blur();
          handlePadButton('B', true);
        }}
        onPointerUp={() => handlePadButton('B', false)}
        onPointerLeave={() => handlePadButton('B', false)}
        onPointerCancel={() => handlePadButton('B', false)}
        className={`tactile-press flex h-14 w-14 items-center justify-center rounded-full border-2 font-display text-base font-extrabold shadow-md shadow-black/60 ${
          pressedMap.B
            ? 'border-white bg-[#A78BFA] text-[#070910]'
            : 'border-[#A78BFA]/75 bg-[#261A4A] text-[#EDE9FE]'
        }`}
      >
        B
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Touch Button A"
        onPointerDown={(e) => {
          e.currentTarget.blur();
          handlePadButton('A', true);
        }}
        onPointerUp={() => handlePadButton('A', false)}
        onPointerLeave={() => handlePadButton('A', false)}
        onPointerCancel={() => handlePadButton('A', false)}
        className={`tactile-press -mt-3 flex h-14 w-14 items-center justify-center rounded-full border-2 font-display text-base font-extrabold shadow-md shadow-black/60 ${
          pressedMap.A
            ? 'border-white bg-[#22D3EE] text-[#070910]'
            : 'border-[#22D3EE]/80 bg-[#0F2C3B] text-[#CFFAFE]'
        }`}
      >
        A
      </button>
    </div>
  );

  const renderMetaCluster = () => (
    <div className="flex items-center gap-2.5 rounded-xl border border-white/12 bg-[#0C111E]/88 px-3 py-2 shadow-xl shadow-black/65 backdrop-blur-[2px]">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Touch SELECT"
        onPointerDown={(e) => {
          e.currentTarget.blur();
          handlePadButton('SELECT', true);
        }}
        onPointerUp={() => handlePadButton('SELECT', false)}
        onPointerLeave={() => handlePadButton('SELECT', false)}
        onPointerCancel={() => handlePadButton('SELECT', false)}
        className={`tactile-press h-8 min-w-[64px] rounded-md border px-3 font-mono-tabular text-[10px] font-semibold tracking-wider ${
          pressedMap.SELECT
            ? 'border-[#F59E0B] bg-[#F59E0B] text-[#070910]'
            : 'border-white/15 bg-[#161E31] text-[#CBD5E1]'
        }`}
      >
        SELECT
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Touch START"
        onPointerDown={(e) => {
          e.currentTarget.blur();
          handlePadButton('START', true);
        }}
        onPointerUp={() => handlePadButton('START', false)}
        onPointerLeave={() => handlePadButton('START', false)}
        onPointerCancel={() => handlePadButton('START', false)}
        className={`tactile-press h-8 min-w-[64px] rounded-md border px-3 font-mono-tabular text-[10px] font-semibold tracking-wider ${
          pressedMap.START
            ? 'border-[#F59E0B] bg-[#F59E0B] text-[#070910]'
            : 'border-white/15 bg-[#161E31] text-[#CBD5E1]'
        }`}
      >
        START
      </button>
    </div>
  );

  // PORTRAIT MODE: Dedicated non-overlapping lower controller deck below the game screen
  if (orientation === 'portrait' && !isEditingLayout) {
    const portraitScale = Math.min(1.05, Math.max(0.82, layout.scale));
    return (
      <div
        ref={containerRef}
        data-testid="virtual-controller-overlay"
        data-layout-orientation="portrait"
        className="flex h-full w-full flex-col justify-between border-t border-white/10 bg-[#080B14] px-4 py-4 select-none touch-none"
      >
        <div
          className="flex flex-1 items-center justify-between gap-3"
          style={{ opacity: Math.max(0.65, layout.opacity) }}
        >
          {/* Left: D-Pad / Thumbstick */}
          <div
            className="flex items-center justify-center"
            style={{ transform: `scale(${portraitScale})`, transformOrigin: 'left center' }}
          >
            {renderMovementControl()}
          </div>

          {/* Right: Stacked Turbo (TB/TA) above Action (B/A) with clean gap */}
          <div
            className="flex flex-col items-end justify-center gap-3"
            style={{ transform: `scale(${portraitScale})`, transformOrigin: 'right center' }}
          >
            {renderTurboCluster()}
            {renderActionsCluster()}
          </div>
        </div>

        {/* Bottom Center: SELECT & START */}
        <div
          className="flex shrink-0 items-center justify-center pt-2"
          style={{ opacity: Math.max(0.7, layout.opacity) }}
        >
          {renderMetaCluster()}
        </div>
      </div>
    );
  }

  // LANDSCAPE MODE (or Live Layout Editor): Semi-transparent touch controls anchored to left/right sides
  const clusterStyle = (cluster: ControlClusterId): React.CSSProperties => {
    const pos = layout.isCustomized ? layout.zones[cluster] : LANDSCAPE_DEFAULT_ZONES[cluster];
    const effectiveScale = layout.scale;
    const padX = Math.round(CLUSTER_SAFE_HALF[cluster].halfW * effectiveScale);
    const padY = Math.round(CLUSTER_SAFE_HALF[cluster].halfH * effectiveScale);
    const landscapeOpacity = isEditingLayout
      ? 0.98
      : Math.min(layout.opacity, 0.82);

    return {
      left: `clamp(${padX}px, ${pos.x}%, calc(100% - ${padX}px))`,
      top: `clamp(${padY}px, ${pos.y}%, calc(100% - ${padY}px))`,
      transform: `translate(-50%, -50%) scale(${effectiveScale})`,
      opacity: landscapeOpacity,
    };
  };

  const editRingClass = isEditingLayout
    ? 'cursor-grab active:cursor-grabbing rounded-xl border border-dashed border-[#22D3EE]/85 bg-[#0D1322]/90 p-2 shadow-lg shadow-black/65'
    : '';

  return (
    <div
      ref={containerRef}
      data-testid="virtual-controller-overlay"
      data-layout-orientation={orientation}
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden select-none"
    >
      {/* Live Per-Game Custom Layout Editor Toolbar */}
      {isEditingLayout && (
        <div
          role="region"
          aria-label="Custom Game Layout Editor"
          className="pointer-events-auto absolute top-3 left-1/2 z-30 flex w-[min(94%,740px)] -translate-x-1/2 flex-wrap items-center justify-between gap-2 rounded-xl border border-[#22D3EE]/50 bg-[#0D1322] px-4 py-2.5 shadow-2xl shadow-black/80"
        >
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-[#22D3EE]" aria-hidden="true" />
            <div className="text-xs font-semibold text-[#F8FAFC]">
              Layout Editor · <span className="text-[#22D3EE]">{layout.romName}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center rounded-md border border-white/10 bg-[#070910] p-0.5">
              <button
                type="button"
                onClick={() => onLayoutDraftChange({ ...layout, stickMode: 'dpad' })}
                className={`rounded px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  layout.stickMode === 'dpad'
                    ? 'bg-[#22D3EE] text-[#070910]'
                    : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                D-Pad
              </button>
              <button
                type="button"
                onClick={() => onLayoutDraftChange({ ...layout, stickMode: 'thumbstick' })}
                className={`rounded px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  layout.stickMode === 'thumbstick'
                    ? 'bg-[#22D3EE] text-[#070910]'
                    : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                Thumbstick
              </button>
            </div>

            <label className="flex items-center gap-1.5 text-[11px] text-[#CBD5E1]">
              <span>Size</span>
              <input
                type="range"
                min={0.75}
                max={1.4}
                step={0.05}
                value={layout.scale}
                aria-label="Button size scale"
                onChange={(e) =>
                  onLayoutDraftChange({ ...layout, scale: parseFloat(e.target.value) })
                }
                className="w-20 accent-[#22D3EE]"
              />
              <span className="font-mono-tabular w-9 text-right text-[#F8FAFC]">
                {Math.round(layout.scale * 100)}%
              </span>
            </label>

            <label className="flex items-center gap-1.5 text-[11px] text-[#CBD5E1]">
              <span>Opacity</span>
              <input
                type="range"
                min={0.35}
                max={1}
                step={0.05}
                value={layout.opacity}
                aria-label="Controller opacity"
                onChange={(e) =>
                  onLayoutDraftChange({ ...layout, opacity: parseFloat(e.target.value) })
                }
                className="w-16 accent-[#A78BFA]"
              />
            </label>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onResetLayout}
              className="tactile-press inline-flex h-8 items-center gap-1 rounded-md border border-white/15 bg-[#141A29] px-2.5 text-xs font-medium text-[#E2E8F0] hover:bg-[#1E273B]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reset</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onSaveLayout(layout);
                onExitEditLayout();
              }}
              className="tactile-press inline-flex h-8 items-center gap-1 rounded-md bg-[#22D3EE] px-3 text-xs font-extrabold text-[#070910] hover:bg-[#38BDF8]"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Save Layout</span>
            </button>
          </div>
        </div>
      )}

      {/* Cluster 1: Left Movement (D-Pad OR Thumbstick) */}
      <div
        onPointerDown={startDrag('movement')}
        style={clusterStyle('movement')}
        className={`pointer-events-auto absolute touch-none ${editRingClass}`}
      >
        {isEditingLayout && (
          <div className="mb-1 flex items-center justify-center gap-1 text-[10px] font-medium text-[#22D3EE]">
            <Move className="h-3 w-3" aria-hidden="true" />
            <span>Drag Move</span>
          </div>
        )}
        {renderMovementControl()}
      </div>

      {/* Cluster 2: SELECT / START */}
      <div
        onPointerDown={startDrag('meta')}
        style={clusterStyle('meta')}
        className={`pointer-events-auto absolute touch-none ${editRingClass}`}
      >
        {renderMetaCluster()}
      </div>

      {/* Cluster 3: Right Turbo (TB / TA) */}
      <div
        onPointerDown={startDrag('turbo')}
        style={clusterStyle('turbo')}
        className={`pointer-events-auto absolute touch-none ${editRingClass}`}
      >
        {renderTurboCluster()}
      </div>

      {/* Cluster 4: Right Action Buttons (B / A) */}
      <div
        onPointerDown={startDrag('actions')}
        style={clusterStyle('actions')}
        className={`pointer-events-auto absolute touch-none ${editRingClass}`}
      >
        {renderActionsCluster()}
      </div>
    </div>
  );
};
