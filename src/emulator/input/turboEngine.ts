import type { PlayerPort } from '../netplay/protocol';
import type { TurboRateHz } from '../settings/emulatorSettingsStore';

export type TurboButtonName = 'A' | 'B';

export interface TurboEdgeEvent {
  port: PlayerPort;
  button: TurboButtonName;
  pressed: boolean;
}

/**
 * Deterministic frame-accurate rapid-fire oscillator for Turbo A & Turbo B on Port 1 & Port 2.
 * At 60 FPS:
 * - 30 Hz => 1 frame ON, 1 frame OFF
 * - 20 Hz => 2 frames ON, 1 frame OFF (~20 pulses/sec)
 * - 15 Hz => 2 frames ON, 2 frames OFF
 * - 10 Hz => 3 frames ON, 3 frames OFF
 * -  5 Hz => 6 frames ON, 6 frames OFF
 */
export class TurboEngine {
  private rateHz: TurboRateHz = 15;
  private frameCounter = 0;

  private readonly turboHeld: Record<PlayerPort, Record<TurboButtonName, boolean>> = {
    1: { A: false, B: false },
    2: { A: false, B: false },
  };

  private readonly lastEmitted: Record<PlayerPort, Record<TurboButtonName, boolean>> = {
    1: { A: false, B: false },
    2: { A: false, B: false },
  };

  public setRateHz(hz: TurboRateHz): void {
    this.rateHz = hz;
  }

  public getRateHz(): TurboRateHz {
    return this.rateHz;
  }

  public getHalfPeriodFrames(): number {
    return Math.max(1, Math.round(60 / (this.rateHz * 2)));
  }

  public isTurboHeld(port: PlayerPort, button: TurboButtonName): boolean {
    return this.turboHeld[port][button];
  }

  /**
   * Press or release a dedicated Turbo A/B trigger.
   * Returns immediate edge transitions so pressing starts firing on frame 0 and releasing never leaves a stuck button.
   */
  public setTurboHeld(
    port: PlayerPort,
    button: TurboButtonName,
    held: boolean
  ): TurboEdgeEvent[] {
    if (this.turboHeld[port][button] === held) return [];
    this.turboHeld[port][button] = held;

    if (held) {
      // Immediate first fire pulse on press for snappy tactile response
      if (!this.lastEmitted[port][button]) {
        this.lastEmitted[port][button] = true;
        return [{ port, button, pressed: true }];
      }
      return [];
    }

    if (this.lastEmitted[port][button]) {
      this.lastEmitted[port][button] = false;
      return [{ port, button, pressed: false }];
    }
    return [];
  }

  /**
   * Call once per emulated NES frame (60Hz). Emits only changed button edges.
   */
  public tickFrame(): TurboEdgeEvent[] {
    this.frameCounter += 1;
    const halfPeriod = this.getHalfPeriodFrames();
    const highPhase = Math.floor(this.frameCounter / halfPeriod) % 2 === 0;
    const events: TurboEdgeEvent[] = [];

    for (const port of [1, 2] as PlayerPort[]) {
      for (const button of ['A', 'B'] as TurboButtonName[]) {
        if (!this.turboHeld[port][button]) continue;
        if (this.lastEmitted[port][button] !== highPhase) {
          this.lastEmitted[port][button] = highPhase;
          events.push({ port, button, pressed: highPhase });
        }
      }
    }

    return events;
  }

  public releaseAll(): TurboEdgeEvent[] {
    const events: TurboEdgeEvent[] = [];
    for (const port of [1, 2] as PlayerPort[]) {
      for (const button of ['A', 'B'] as TurboButtonName[]) {
        this.turboHeld[port][button] = false;
        if (this.lastEmitted[port][button]) {
          this.lastEmitted[port][button] = false;
          events.push({ port, button, pressed: false });
        }
      }
    }
    return events;
  }
}
