import type { StickControlMode } from './emulatorSettingsStore';

export type ControlClusterId = 'movement' | 'meta' | 'actions' | 'turbo';

export interface ClusterPosition {
  /** Horizontal anchor percentage (4..96) inside the playfield viewport */
  x: number;
  /** Vertical anchor percentage (12..94) inside the playfield viewport */
  y: number;
}

export interface GameLayoutProfile {
  romHash: string;
  romName: string;
  isCustomized: boolean;
  stickMode: StickControlMode;
  scale: number; // 0.75..1.4
  opacity: number; // 0.35..1.0
  zones: Record<ControlClusterId, ClusterPosition>;
  updatedAt: number;
}

export const DEFAULT_LAYOUT_ZONES: Record<ControlClusterId, ClusterPosition> = {
  movement: { x: 11, y: 66 },
  meta: { x: 11, y: 88 },
  actions: { x: 89, y: 74 },
  turbo: { x: 89, y: 49 },
};

export function clampClusterPosition(pos: ClusterPosition): ClusterPosition {
  return {
    x: Math.round(Math.max(6, Math.min(94, pos.x)) * 10) / 10,
    y: Math.round(Math.max(14, Math.min(92, pos.y)) * 10) / 10,
  };
}

export function createDefaultGameLayout(
  romHash: string,
  romName: string,
  stickMode: StickControlMode = 'dpad'
): GameLayoutProfile {
  return {
    romHash,
    romName,
    isCustomized: false,
    stickMode,
    scale: 1.0,
    opacity: 0.88,
    zones: {
      movement: { ...DEFAULT_LAYOUT_ZONES.movement },
      meta: { ...DEFAULT_LAYOUT_ZONES.meta },
      actions: { ...DEFAULT_LAYOUT_ZONES.actions },
      turbo: { ...DEFAULT_LAYOUT_ZONES.turbo },
    },
    updatedAt: Date.now(),
  };
}

export function sanitizeGameLayout(
  romHash: string,
  romName: string,
  raw: Partial<GameLayoutProfile> | null | undefined,
  fallbackStickMode: StickControlMode = 'dpad'
): GameLayoutProfile {
  const base = createDefaultGameLayout(romHash, romName, fallbackStickMode);
  if (!raw) return base;

  const zones: Record<ControlClusterId, ClusterPosition> = {
    movement: clampClusterPosition(raw.zones?.movement ?? base.zones.movement),
    meta: clampClusterPosition(raw.zones?.meta ?? base.zones.meta),
    actions: clampClusterPosition(raw.zones?.actions ?? base.zones.actions),
    turbo: clampClusterPosition(raw.zones?.turbo ?? base.zones.turbo),
  };

  return {
    romHash,
    romName: raw.romName || romName,
    isCustomized: Boolean(raw.isCustomized),
    stickMode:
      raw.stickMode === 'thumbstick' || raw.stickMode === 'dpad'
        ? raw.stickMode
        : base.stickMode,
    scale:
      typeof raw.scale === 'number' && Number.isFinite(raw.scale)
        ? Math.round(Math.max(0.75, Math.min(1.4, raw.scale)) * 100) / 100
        : base.scale,
    opacity:
      typeof raw.opacity === 'number' && Number.isFinite(raw.opacity)
        ? Math.round(Math.max(0.35, Math.min(1.0, raw.opacity)) * 100) / 100
        : base.opacity,
    zones,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  };
}

const LAYOUT_PREFIX = 'tgk_nes_game_layout_v1';

/**
 * Saves and restores custom button scale, opacity, stick type, and XY layout independently per .nes ROM hash.
 */
export class GameLayoutStore {
  private readonly memory = new Map<string, GameLayoutProfile>();

  private keyFor(romHash: string): string {
    return `${LAYOUT_PREFIX}:${romHash}`;
  }

  public getLayout(
    romHash: string,
    romName: string,
    fallbackStickMode: StickControlMode = 'dpad'
  ): GameLayoutProfile {
    const cached = this.memory.get(romHash);
    if (cached) {
      return sanitizeGameLayout(romHash, romName, cached, fallbackStickMode);
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(this.keyFor(romHash));
        if (raw) {
          const parsed = sanitizeGameLayout(
            romHash,
            romName,
            JSON.parse(raw),
            fallbackStickMode
          );
          this.memory.set(romHash, parsed);
          return parsed;
        }
      } catch {
        // Fallback to default
      }
    }

    return createDefaultGameLayout(romHash, romName, fallbackStickMode);
  }

  public saveLayout(profile: GameLayoutProfile): GameLayoutProfile {
    const sanitized = sanitizeGameLayout(profile.romHash, profile.romName, {
      ...profile,
      isCustomized: true,
      updatedAt: Date.now(),
    });
    this.memory.set(sanitized.romHash, sanitized);

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(
          this.keyFor(sanitized.romHash),
          JSON.stringify(sanitized)
        );
      } catch {
        // Memory cache remains valid
      }
    }
    return sanitized;
  }

  public resetLayout(
    romHash: string,
    romName: string,
    fallbackStickMode: StickControlMode = 'dpad'
  ): GameLayoutProfile {
    this.memory.delete(romHash);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(this.keyFor(romHash));
      } catch {
        // Ignore
      }
    }
    return createDefaultGameLayout(romHash, romName, fallbackStickMode);
  }
}
