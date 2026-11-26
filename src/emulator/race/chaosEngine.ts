export type ChaosTwistType = 'screen-swap' | 'audio-flip' | 'turbo-pulse';

export interface ActiveChaosTwist {
  id: string;
  type: ChaosTwistType;
  label: string;
  description: string;
  startedAtMs: number;
  endsAtMs: number;
}

export interface ChaosEngineSnapshot {
  enabled: boolean;
  activeTwist: ActiveChaosTwist | null;
  secondsUntilNextTwist: number;
  secondsRemaining: number;
}

const TWIST_CATALOG: { type: ChaosTwistType; label: string; description: string }[] = [
  {
    type: 'screen-swap',
    label: 'SCREEN SWAP!',
    description: 'Top & Bottom screens swapped for 10s — keep your eyes locked!',
  },
  {
    type: 'audio-flip',
    label: 'AUDIO FLIP!',
    description: 'Audio focus flipped to your rival for 10s!',
  },
  {
    type: 'turbo-pulse',
    label: 'TURBO PULSE!',
    description: 'Hyper rapid-fire pulse active on both decks for 10s!',
  },
];

export const CHAOS_MIN_INTERVAL_MS = 30_000;
export const CHAOS_MAX_INTERVAL_MS = 45_000;
export const CHAOS_DURATION_MS = 10_000;

/**
 * Pure, testable Mystery / Chaos Modifier engine for Friends Dual-Screen VS Races.
 * Triggers a random fun twist every 30-45 seconds (Screen Swap, Audio Flip, or Turbo Pulse).
 */
export class ChaosModifierEngine {
  private enabled = false;
  private activeTwist: ActiveChaosTwist | null = null;
  private nextTriggerAtMs = 0;
  private lastTwistType: ChaosTwistType | null = null;
  private readonly rng: () => number;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  public configure(enabled: boolean, nowMs: number): void {
    this.enabled = enabled;
    if (!enabled) {
      this.activeTwist = null;
      this.nextTriggerAtMs = 0;
      return;
    }
    this.scheduleNext(nowMs);
  }

  public reset(nowMs: number): void {
    this.activeTwist = null;
    if (this.enabled) {
      this.scheduleNext(nowMs);
    } else {
      this.nextTriggerAtMs = 0;
    }
  }

  private scheduleNext(nowMs: number): void {
    const span = CHAOS_MAX_INTERVAL_MS - CHAOS_MIN_INTERVAL_MS;
    const delay = CHAOS_MIN_INTERVAL_MS + Math.floor(this.rng() * (span + 1));
    this.nextTriggerAtMs = nowMs + delay;
  }

  /**
   * Applies an externally synchronized Chaos twist (e.g., from Host over Netplay).
   */
  public applyRemoteTwist(twist: ActiveChaosTwist | null, nowMs: number): void {
    this.activeTwist = twist;
    if (twist) {
      this.lastTwistType = twist.type;
      this.nextTriggerAtMs = twist.endsAtMs + CHAOS_MIN_INTERVAL_MS;
    } else if (this.enabled) {
      this.scheduleNext(nowMs);
    }
  }

  /**
   * Triggers a twist immediately (useful for testing or manual "Trigger Chaos Now" fun button).
   */
  public triggerNow(nowMs: number, forcedType?: ChaosTwistType): ActiveChaosTwist {
    const candidates = forcedType
      ? TWIST_CATALOG.filter((t) => t.type === forcedType)
      : TWIST_CATALOG.filter((t) => t.type !== this.lastTwistType);
    const pool = candidates.length > 0 ? candidates : TWIST_CATALOG;
    const chosen = pool[Math.floor(this.rng() * pool.length)] ?? TWIST_CATALOG[0];

    this.lastTwistType = chosen.type;
    const twist: ActiveChaosTwist = {
      id: `chaos_${nowMs}_${chosen.type}`,
      type: chosen.type,
      label: chosen.label,
      description: chosen.description,
      startedAtMs: nowMs,
      endsAtMs: nowMs + CHAOS_DURATION_MS,
    };
    this.activeTwist = twist;
    this.scheduleNext(twist.endsAtMs);
    return twist;
  }

  /**
   * Advances Chaos state. Returns a newly triggered twist if one fired on this tick.
   */
  public tick(nowMs: number, allowAutoTrigger = true): {
    snapshot: ChaosEngineSnapshot;
    newlyTriggered: ActiveChaosTwist | null;
  } {
    let newlyTriggered: ActiveChaosTwist | null = null;

    if (this.activeTwist && nowMs >= this.activeTwist.endsAtMs) {
      this.activeTwist = null;
      if (this.enabled && this.nextTriggerAtMs <= nowMs) {
        this.scheduleNext(nowMs);
      }
    }

    if (
      this.enabled &&
      allowAutoTrigger &&
      !this.activeTwist &&
      this.nextTriggerAtMs > 0 &&
      nowMs >= this.nextTriggerAtMs
    ) {
      newlyTriggered = this.triggerNow(nowMs);
    }

    const secondsRemaining = this.activeTwist
      ? Math.max(0, Math.ceil((this.activeTwist.endsAtMs - nowMs) / 1000))
      : 0;
    const secondsUntilNextTwist =
      this.enabled && !this.activeTwist && this.nextTriggerAtMs > nowMs
        ? Math.max(0, Math.ceil((this.nextTriggerAtMs - nowMs) / 1000))
        : 0;

    return {
      snapshot: {
        enabled: this.enabled,
        activeTwist: this.activeTwist,
        secondsUntilNextTwist,
        secondsRemaining,
      },
      newlyTriggered,
    };
  }

  public getSnapshot(nowMs: number): ChaosEngineSnapshot {
    return this.tick(nowMs, false).snapshot;
  }
}
