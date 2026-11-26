import type { NesButtonName, PlayerPort } from '../netplay/protocol';
import type { RomMetadata } from './inesParser';

export const NES_WIDTH = 256;
export const NES_HEIGHT = 240;
export const NES_TARGET_FPS = 60.0988;

export const BUTTON_BIT_MAP: Record<NesButtonName, number> = {
  A: 0x80,
  B: 0x40,
  SELECT: 0x20,
  START: 0x10,
  UP: 0x08,
  DOWN: 0x04,
  LEFT: 0x02,
  RIGHT: 0x01,
};

export type NesCoreId = 'libretro-fceumm';

export interface SaveStatePayload {
  version: number;
  coreId: NesCoreId;
  romName: string;
  romHash: string;
  frameCount: number;
  savedAt: number;
  stateJson: string;
}

export type FrameListener = (rgbaFrame: Uint32Array, frameCount: number) => void;
export type AudioSampleListener = (left: number, right: number) => void;

/**
 * Clean hardware-agnostic NES Emulator Core interface backed by
 * libretro/libretro-fceumm (WASM on Web, C++ JNI on Android) so UI,
 * InputManager, and NetplayClient remain completely decoupled from the core.
 */
export interface INesEmulatorCore {
  readonly coreId: NesCoreId;
  readonly coreLabel: string;
  readonly coreVersion?: string;
  readonly repoUrl: string;
  readonly width: number;
  readonly height: number;
  /** True when the core renders directly to an attached HTMLCanvasElement (e.g. libretro WASM). */
  readonly rendersOwnCanvas: boolean;

  attachCanvas?(canvas: HTMLCanvasElement | null): void;
  loadRom(romBytes: Uint8Array, name?: string): Promise<RomMetadata> | RomMetadata;
  start(): void;
  pause(): void;
  resume(): void;
  reset(): void;
  stepFrame(): void;
  /**
   * Deterministic single-frame step with explicit 8-bit NES joypad bitmasks for Port 1 & Port 2.
   * When [silent] is true (during rollback re-simulation), suppresses audio & frame callbacks.
   */
  stepFrameWithMasks?(p1Mask: number, p2Mask: number, silent?: boolean): void;
  setPortBitmask?(port: PlayerPort, mask: number): void;
  getPortBitmask?(port: PlayerPort): number;
  computeStateChecksum?(): string;
  setMuted?(muted: boolean): void;

  isRunning(): boolean;
  isPaused(): boolean;
  hasRomLoaded(): boolean;
  getFrameCount(): number;
  getRomMetadata(): RomMetadata | null;
  getRomBytes(): Uint8Array | null;

  setButton(port: PlayerPort, button: NesButtonName, pressed: boolean): void;
  releaseAllButtons(port?: PlayerPort): void;

  /** Optional NES 2KB internal RAM reader ($0000-$07FF) for live VS Race Judge telemetry. */
  readRamByte?(address: number): number;
  readRamSlice?(startAddress: number, length: number): Uint8Array | null;

  saveState(): Promise<SaveStatePayload> | SaveStatePayload;
  loadState(state: SaveStatePayload): Promise<void> | void;

  onFrame(listener: FrameListener): () => void;
  onAudioSample(listener: AudioSampleListener): () => void;
  dispose(): void;
}
