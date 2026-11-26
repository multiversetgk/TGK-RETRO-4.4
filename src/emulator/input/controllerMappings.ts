import type { NesButtonName, PlayerPort } from '../netplay/protocol';

export type PortKeyMap = Record<NesButtonName, string>;

export interface ControllerBindings {
  1: PortKeyMap;
  2: PortKeyMap;
}

export const NES_BUTTON_ORDER: NesButtonName[] = [
  'UP',
  'DOWN',
  'LEFT',
  'RIGHT',
  'B',
  'A',
  'SELECT',
  'START',
];

export const DEFAULT_CONTROLLER_BINDINGS: ControllerBindings = {
  1: {
    UP: 'KeyW',
    DOWN: 'KeyS',
    LEFT: 'KeyA',
    RIGHT: 'KeyD',
    B: 'KeyF',
    A: 'KeyG',
    SELECT: 'KeyR',
    START: 'KeyT',
  },
  2: {
    UP: 'ArrowUp',
    DOWN: 'ArrowDown',
    LEFT: 'ArrowLeft',
    RIGHT: 'ArrowRight',
    B: 'KeyK',
    A: 'KeyL',
    SELECT: 'KeyO',
    START: 'KeyP',
  },
};

export function formatKeyCodeLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'ArrowUp') return 'Up';
  if (code === 'ArrowDown') return 'Down';
  if (code === 'ArrowLeft') return 'Left';
  if (code === 'ArrowRight') return 'Right';
  if (code === 'Space') return 'Space';
  if (code === 'Enter') return 'Enter';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  return code;
}

export function cloneBindings(bindings: ControllerBindings): ControllerBindings {
  return {
    1: { ...bindings[1] },
    2: { ...bindings[2] },
  };
}

export function resolveKeyboardBinding(
  code: string,
  bindings: ControllerBindings,
  allowedPorts: PlayerPort[] = [1, 2]
): { port: PlayerPort; button: NesButtonName } | null {
  for (const port of allowedPorts) {
    const map = bindings[port];
    for (const button of NES_BUTTON_ORDER) {
      if (map[button] === code) {
        return { port, button };
      }
    }
  }
  return null;
}

export interface GamepadButtonSnapshot {
  A: boolean;
  B: boolean;
  SELECT: boolean;
  START: boolean;
  UP: boolean;
  DOWN: boolean;
  LEFT: boolean;
  RIGHT: boolean;
  TURBO_A: boolean;
  TURBO_B: boolean;
}

const AXIS_DEADZONE = 0.42;

/**
 * Maps a standard W3C Gamepad API object into NES 8-button + Turbo A/B state.
 * Standard mapping: 0=A, 1=B, 2/4(X/LB)=Turbo B, 3/5(Y/RB)=Turbo A, 8=Select, 9=Start, 12-15=D-pad.
 */
export function sampleStandardGamepad(pad: Gamepad): GamepadButtonSnapshot {
  const pressed = (idx: number): boolean => Boolean(pad.buttons[idx]?.pressed);
  const axisX = pad.axes[0] ?? 0;
  const axisY = pad.axes[1] ?? 0;

  return {
    A: pressed(0),
    B: pressed(1),
    SELECT: pressed(8),
    START: pressed(9),
    UP: pressed(12) || axisY < -AXIS_DEADZONE,
    DOWN: pressed(13) || axisY > AXIS_DEADZONE,
    LEFT: pressed(14) || axisX < -AXIS_DEADZONE,
    RIGHT: pressed(15) || axisX > AXIS_DEADZONE,
    TURBO_B: pressed(2) || pressed(4),
    TURBO_A: pressed(3) || pressed(5),
  };
}
