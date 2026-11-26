import type { NesButtonName, PlayerPort } from '../netplay/protocol';
import {
  cloneBindings,
  DEFAULT_CONTROLLER_BINDINGS,
  NES_BUTTON_ORDER,
  resolveKeyboardBinding,
  sampleStandardGamepad,
  type ControllerBindings,
} from './controllerMappings';

export type InputEventCallback = (
  port: PlayerPort,
  button: NesButtonName,
  pressed: boolean,
  source: 'keyboard' | 'gamepad' | 'virtual'
) => void;

export type TurboInputCallback = (
  port: PlayerPort,
  button: 'A' | 'B',
  held: boolean
) => void;

export interface ConnectedGamepadInfo {
  index: number;
  id: string;
  assignedPort: PlayerPort;
}

/**
 * Handles independent Port 1 & Port 2 inputs across Keyboard + Web Gamepad API
 * (including physical gamepad Turbo A/B) with strict focus-loss release hygiene.
 */
export class InputManager {
  private bindings: ControllerBindings = cloneBindings(DEFAULT_CONTROLLER_BINDINGS);
  private enabled = false;
  private localPorts: PlayerPort[] = [1, 2];
  private onInput: InputEventCallback;
  private onGamepadListChange?: (pads: ConnectedGamepadInfo[]) => void;
  private onTurboInput?: TurboInputCallback;

  private readonly keyboardHeld: Record<PlayerPort, Record<NesButtonName, boolean>> = {
    1: this.emptyPortState(),
    2: this.emptyPortState(),
  };

  private readonly gamepadHeld: Record<PlayerPort, Record<NesButtonName, boolean>> = {
    1: this.emptyPortState(),
    2: this.emptyPortState(),
  };

  private readonly gamepadTurboHeld: Record<PlayerPort, Record<'A' | 'B', boolean>> = {
    1: { A: false, B: false },
    2: { A: false, B: false },
  };

  private readonly combinedState: Record<PlayerPort, Record<NesButtonName, boolean>> = {
    1: this.emptyPortState(),
    2: this.emptyPortState(),
  };

  private attached = false;

  constructor(
    onInput: InputEventCallback,
    onGamepadListChange?: (pads: ConnectedGamepadInfo[]) => void,
    onTurboInput?: TurboInputCallback
  ) {
    this.onInput = onInput;
    this.onGamepadListChange = onGamepadListChange;
    this.onTurboInput = onTurboInput;
  }

  private emptyPortState(): Record<NesButtonName, boolean> {
    return {
      A: false,
      B: false,
      SELECT: false,
      START: false,
      UP: false,
      DOWN: false,
      LEFT: false,
      RIGHT: false,
    };
  }

  public attach(): void {
    if (this.attached || typeof window === 'undefined') return;
    this.attached = true;
    window.addEventListener('keydown', this.handleKeyDown, { passive: false });
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('gamepadconnected', this.handleGamepadChange);
    window.addEventListener('gamepaddisconnected', this.handleGamepadChange);
    this.notifyGamepads();
  }

  public detach(): void {
    if (!this.attached || typeof window === 'undefined') return;
    this.attached = false;
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('gamepadconnected', this.handleGamepadChange);
    window.removeEventListener('gamepaddisconnected', this.handleGamepadChange);
    this.releaseAll();
  }

  public setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.releaseAll();
    }
  }

  /**
   * In Local 2P mode, both ports [1, 2] are driven locally.
   * In Online 2P Netplay, only the assigned port ([1] or [2]) is driven locally,
   * while the remote peer drives the opposite port over WebSocket.
   */
  public setLocalPorts(ports: PlayerPort[]): void {
    this.releaseAll();
    this.localPorts = [...ports];
  }

  public setBindings(next: ControllerBindings): void {
    this.releaseAll();
    this.bindings = cloneBindings(next);
  }

  public getBindings(): ControllerBindings {
    return cloneBindings(this.bindings);
  }

  public getCombinedSnapshot(): Record<PlayerPort, Record<NesButtonName, boolean>> {
    return {
      1: { ...this.combinedState[1] },
      2: { ...this.combinedState[2] },
    };
  }

  public pollGamepads(): void {
    if (!this.enabled || typeof navigator === 'undefined' || !navigator.getGamepads) {
      return;
    }
    const rawPads = navigator.getGamepads();
    const activePads: Gamepad[] = [];
    for (const pad of rawPads) {
      if (pad && pad.connected) {
        activePads.push(pad);
      }
    }

    // Pad 0 -> Port 1 (or single assigned online port), Pad 1 -> Port 2
    const padAssignments: { pad: Gamepad; port: PlayerPort }[] = [];
    if (this.localPorts.length === 1) {
      if (activePads[0]) {
        padAssignments.push({ pad: activePads[0], port: this.localPorts[0] });
      }
    } else {
      if (activePads[0]) padAssignments.push({ pad: activePads[0], port: 1 });
      if (activePads[1]) padAssignments.push({ pad: activePads[1], port: 2 });
    }

    const handledPorts = new Set<PlayerPort>();
    for (const { pad, port } of padAssignments) {
      handledPorts.add(port);
      const sampled = sampleStandardGamepad(pad);
      for (const button of NES_BUTTON_ORDER) {
        if (this.gamepadHeld[port][button] !== sampled[button]) {
          this.gamepadHeld[port][button] = sampled[button];
          this.reconcileButton(port, button, 'gamepad');
        }
      }
      if (this.gamepadTurboHeld[port].A !== sampled.TURBO_A) {
        this.gamepadTurboHeld[port].A = sampled.TURBO_A;
        this.onTurboInput?.(port, 'A', sampled.TURBO_A);
      }
      if (this.gamepadTurboHeld[port].B !== sampled.TURBO_B) {
        this.gamepadTurboHeld[port].B = sampled.TURBO_B;
        this.onTurboInput?.(port, 'B', sampled.TURBO_B);
      }
    }

    for (const port of [1, 2] as PlayerPort[]) {
      if (!handledPorts.has(port)) {
        for (const button of NES_BUTTON_ORDER) {
          if (this.gamepadHeld[port][button]) {
            this.gamepadHeld[port][button] = false;
            this.reconcileButton(port, button, 'gamepad');
          }
        }
        for (const tb of ['A', 'B'] as const) {
          if (this.gamepadTurboHeld[port][tb]) {
            this.gamepadTurboHeld[port][tb] = false;
            this.onTurboInput?.(port, tb, false);
          }
        }
      }
    }
  }

  public releaseAll(): void {
    for (const port of [1, 2] as PlayerPort[]) {
      for (const button of NES_BUTTON_ORDER) {
        this.keyboardHeld[port][button] = false;
        this.gamepadHeld[port][button] = false;
        if (this.combinedState[port][button]) {
          this.combinedState[port][button] = false;
          this.onInput(port, button, false, 'keyboard');
        }
      }
      for (const tb of ['A', 'B'] as const) {
        if (this.gamepadTurboHeld[port][tb]) {
          this.gamepadTurboHeld[port][tb] = false;
          this.onTurboInput?.(port, tb, false);
        }
      }
    }
  }

  public getConnectedGamepads(): ConnectedGamepadInfo[] {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
    const pads = Array.from(navigator.getGamepads()).filter(
      (p): p is Gamepad => Boolean(p && p.connected)
    );
    return pads.slice(0, 2).map((pad, idx) => ({
      index: pad.index,
      id: pad.id,
      assignedPort:
        this.localPorts.length === 1 ? this.localPorts[0] : ((idx + 1) as PlayerPort),
    }));
  }

  private reconcileButton(
    port: PlayerPort,
    button: NesButtonName,
    source: 'keyboard' | 'gamepad'
  ): void {
    const nextPressed = this.keyboardHeld[port][button] || this.gamepadHeld[port][button];
    if (this.combinedState[port][button] !== nextPressed) {
      this.combinedState[port][button] = nextPressed;
      this.onInput(port, button, nextPressed, source);
    }
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (!this.enabled || this.isTypingTarget(e.target)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    // In Online mode with single assigned port, allow Player 1 keys (WASD) to drive that assigned port too!
    let match = resolveKeyboardBinding(e.code, this.bindings, this.localPorts);
    if (!match && this.localPorts.length === 1 && this.localPorts[0] === 2) {
      const p1Fallback = resolveKeyboardBinding(e.code, this.bindings, [1]);
      if (p1Fallback) {
        match = { port: 2, button: p1Fallback.button };
      }
    }
    if (!match) return;

    e.preventDefault();
    if (e.repeat) return;
    this.keyboardHeld[match.port][match.button] = true;
    this.reconcileButton(match.port, match.button, 'keyboard');
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    let match = resolveKeyboardBinding(e.code, this.bindings, this.localPorts);
    if (!match && this.localPorts.length === 1 && this.localPorts[0] === 2) {
      const p1Fallback = resolveKeyboardBinding(e.code, this.bindings, [1]);
      if (p1Fallback) {
        match = { port: 2, button: p1Fallback.button };
      }
    }
    if (!match) return;

    if (this.keyboardHeld[match.port][match.button]) {
      this.keyboardHeld[match.port][match.button] = false;
      this.reconcileButton(match.port, match.button, 'keyboard');
    }
  };

  private handleWindowBlur = (): void => {
    this.releaseAll();
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.releaseAll();
    }
  };

  private handleGamepadChange = (): void => {
    this.notifyGamepads();
  };

  private notifyGamepads(): void {
    if (this.onGamepadListChange) {
      this.onGamepadListChange(this.getConnectedGamepads());
    }
  }
}
