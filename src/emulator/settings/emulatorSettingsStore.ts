import type { NesCoreId } from '../core/INesEmulatorCore';

export type VideoFilterMode =
  | 'pixel-crisp'
  | 'smooth-linear'
  | 'warm-phosphor'
  | 'mono-pocket';

export type CrtDisplayMode = 'off' | 'scanlines' | 'pvm-border';

export type AudioLatencyPreset = 24 | 48 | 96;

export type AudioFocusMode = 'standard' | 'game-focus' | 'voice-duck' | 'muted';

export type TurboRateHz = 5 | 10 | 15 | 20 | 30;

export type StickControlMode = 'dpad' | 'thumbstick';

export type ScreenAspectRatio = '4:3' | 'fit' | 'full';

export type ScreenOrientationMode = 'auto' | 'landscape' | 'portrait';

export interface EmulatorSettingsProfile {
  coreId: NesCoreId;
  videoFilter: VideoFilterMode;
  crtMode: CrtDisplayMode;
  aspectRatio: ScreenAspectRatio;
  orientation: ScreenOrientationMode;
  audioLatencyMs: AudioLatencyPreset;
  audioFocus: AudioFocusMode;
  masterVolume: number; // 0.0 to 1.0
  turboRateHz: TurboRateHz;
  showOnScreenPad: boolean;
  defaultStickMode: StickControlMode;
  autoSaveEnabled: boolean;
  fastForwardEnabled: boolean;
  rewindEnabled: boolean;
  cheatsEnabled: boolean;
}

export const TURBO_RATE_PRESETS: readonly TurboRateHz[] = [5, 10, 15, 20, 30] as const;

export const AUDIO_LATENCY_PRESETS: readonly { value: AudioLatencyPreset; label: string }[] = [
  { value: 24, label: 'Ultra Low (24ms)' },
  { value: 48, label: 'Balanced (48ms)' },
  { value: 96, label: 'Safe Buffer (96ms)' },
] as const;

export function createDefaultEmulatorSettings(
  coreId: NesCoreId = 'libretro-fceumm'
): EmulatorSettingsProfile {
  return {
    coreId,
    videoFilter: 'pixel-crisp',
    crtMode: 'scanlines',
    aspectRatio: '4:3',
    orientation: 'auto',
    audioLatencyMs: 48,
    audioFocus: 'game-focus',
    masterVolume: 0.8,
    turboRateHz: 15,
    showOnScreenPad: true,
    defaultStickMode: 'dpad',
    autoSaveEnabled: true,
    fastForwardEnabled: false,
    rewindEnabled: false,
    cheatsEnabled: false,
  };
}

export function clampEmulatorSettings(
  coreId: NesCoreId,
  partial: Partial<EmulatorSettingsProfile> | null | undefined
): EmulatorSettingsProfile {
  const base = createDefaultEmulatorSettings(coreId);
  if (!partial) return base;

  const validFilters: VideoFilterMode[] = [
    'pixel-crisp',
    'smooth-linear',
    'warm-phosphor',
    'mono-pocket',
  ];
  const validCrt: CrtDisplayMode[] = ['off', 'scanlines', 'pvm-border'];
  const validAspect: ScreenAspectRatio[] = ['4:3', 'fit', 'full'];
  const validOrientation: ScreenOrientationMode[] = ['auto', 'landscape', 'portrait'];
  const validLatency: AudioLatencyPreset[] = [24, 48, 96];
  const validFocus: AudioFocusMode[] = ['standard', 'game-focus', 'voice-duck', 'muted'];
  const validStick: StickControlMode[] = ['dpad', 'thumbstick'];

  const normalizedAspect: ScreenAspectRatio =
    (partial.aspectRatio as string) === 'pixel-perfect'
      ? 'fit'
      : validAspect.includes(partial.aspectRatio as ScreenAspectRatio)
        ? (partial.aspectRatio as ScreenAspectRatio)
        : base.aspectRatio;

  return {
    coreId,
    videoFilter: validFilters.includes(partial.videoFilter as VideoFilterMode)
      ? (partial.videoFilter as VideoFilterMode)
      : base.videoFilter,
    crtMode: validCrt.includes(partial.crtMode as CrtDisplayMode)
      ? (partial.crtMode as CrtDisplayMode)
      : base.crtMode,
    aspectRatio: normalizedAspect,
    orientation: validOrientation.includes(partial.orientation as ScreenOrientationMode)
      ? (partial.orientation as ScreenOrientationMode)
      : base.orientation,
    audioLatencyMs: validLatency.includes(partial.audioLatencyMs as AudioLatencyPreset)
      ? (partial.audioLatencyMs as AudioLatencyPreset)
      : base.audioLatencyMs,
    audioFocus: validFocus.includes(partial.audioFocus as AudioFocusMode)
      ? (partial.audioFocus as AudioFocusMode)
      : base.audioFocus,
    masterVolume:
      typeof partial.masterVolume === 'number' && Number.isFinite(partial.masterVolume)
        ? Math.max(0, Math.min(1, partial.masterVolume))
        : base.masterVolume,
    turboRateHz: TURBO_RATE_PRESETS.includes(partial.turboRateHz as TurboRateHz)
      ? (partial.turboRateHz as TurboRateHz)
      : base.turboRateHz,
    showOnScreenPad:
      typeof partial.showOnScreenPad === 'boolean'
        ? partial.showOnScreenPad
        : base.showOnScreenPad,
    defaultStickMode: validStick.includes(partial.defaultStickMode as StickControlMode)
      ? (partial.defaultStickMode as StickControlMode)
      : base.defaultStickMode,
    autoSaveEnabled:
      typeof partial.autoSaveEnabled === 'boolean'
        ? partial.autoSaveEnabled
        : base.autoSaveEnabled,
    fastForwardEnabled:
      typeof partial.fastForwardEnabled === 'boolean'
        ? partial.fastForwardEnabled
        : base.fastForwardEnabled,
    rewindEnabled:
      typeof partial.rewindEnabled === 'boolean'
        ? partial.rewindEnabled
        : base.rewindEnabled,
    cheatsEnabled:
      typeof partial.cheatsEnabled === 'boolean'
        ? partial.cheatsEnabled
        : base.cheatsEnabled,
  };
}

const STORAGE_PREFIX = 'tgk_nes_emu_settings_v1';

/**
 * Persists emulator configuration profile for FCEUmm (libretro-fceumm).
 */
export class EmulatorSettingsStore {
  private readonly memory = new Map<NesCoreId, EmulatorSettingsProfile>();

  private keyFor(coreId: NesCoreId): string {
    return `${STORAGE_PREFIX}:${coreId}`;
  }

  public getSettings(coreId: NesCoreId): EmulatorSettingsProfile {
    const cached = this.memory.get(coreId);
    if (cached) return { ...cached };

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(this.keyFor(coreId));
        if (raw) {
          const parsed = clampEmulatorSettings(coreId, JSON.parse(raw));
          this.memory.set(coreId, parsed);
          return { ...parsed };
        }
      } catch {
        // Fallback to defaults
      }
    }

    const defaults = createDefaultEmulatorSettings(coreId);
    this.memory.set(coreId, defaults);
    return { ...defaults };
  }

  public updateSettings(
    coreId: NesCoreId,
    patch: Partial<EmulatorSettingsProfile>
  ): EmulatorSettingsProfile {
    const current = this.getSettings(coreId);
    const next = clampEmulatorSettings(coreId, { ...current, ...patch, coreId });
    this.memory.set(coreId, next);

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(this.keyFor(coreId), JSON.stringify(next));
      } catch {
        // Keep in-memory copy
      }
    }

    return { ...next };
  }

  public resetSettings(coreId: NesCoreId): EmulatorSettingsProfile {
    const defaults = createDefaultEmulatorSettings(coreId);
    this.memory.set(coreId, defaults);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(this.keyFor(coreId));
      } catch {
        // Ignore
      }
    }
    return { ...defaults };
  }
}
