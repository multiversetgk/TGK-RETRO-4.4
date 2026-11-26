import {
  BUTTON_BIT_MAP,
  NES_HEIGHT,
  NES_WIDTH,
  type AudioSampleListener,
  type FrameListener,
  type INesEmulatorCore,
  type SaveStatePayload,
} from '../emulator/core/INesEmulatorCore';
import { parseInesHeader, type RomMetadata } from '../emulator/core/inesParser';
import type { NesButtonName, PlayerPort } from '../emulator/netplay/protocol';

/**
 * Generates a valid 24,592-byte NROM-128 iNES (.nes) buffer for unit tests
 * (16-byte iNES header + 16 KB PRG-ROM + 8 KB CHR-ROM).
 */
export function createTestInesRom(seed = 1): Uint8Array {
  const bytes = new Uint8Array(16 + 16384 + 8192);
  // iNES magic: "NES\x1A"
  bytes[0] = 0x4e;
  bytes[1] = 0x45;
  bytes[2] = 0x53;
  bytes[3] = 0x1a;
  bytes[4] = 1; // 1 x 16 KB PRG-ROM
  bytes[5] = 1; // 1 x 8 KB CHR-ROM
  bytes[6] = 0x01; // Mapper 0 (NROM), vertical mirroring
  bytes[7] = 0x00;

  let state = (seed * 2654435761) >>> 0;
  for (let i = 16; i < bytes.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    bytes[i] = (state >>> 24) & 0xff;
  }
  return bytes;
}

/**
 * Pure-TypeScript deterministic INesEmulatorCore test double for Node.js unit
 * tests (since libretro-fceumm WASM requires a browser WebGL/AudioWorklet DOM).
 * Implements deterministic stepping, 2 KB NES RAM, Port 1 & Port 2 masks,
 * save/load state serialization, and FNV-1a hex state checksums.
 */
export class DeterministicMockNesCore implements INesEmulatorCore {
  readonly coreId = 'libretro-fceumm' as const;
  readonly coreLabel = 'FCEUmm (libretro-fceumm)';
  readonly coreVersion = 'libretro-fceumm-wasm-2.0';
  readonly repoUrl = 'https://github.com/libretro/libretro-fceumm';
  readonly width = NES_WIDTH;
  readonly height = NES_HEIGHT;
  readonly rendersOwnCanvas = false;

  private romMeta: RomMetadata | null = null;
  private romBytes: Uint8Array | null = null;
  private ram = new Uint8Array(2048);
  private frameCount = 0;
  private running = false;
  private paused = false;
  private port1Mask = 0;
  private port2Mask = 0;
  private accHash = 0x811c9dc5;
  private frameCallbacks = new Set<FrameListener>();

  loadRom(romBytes: Uint8Array, fileName = 'Cartridge.nes'): RomMetadata {
    const meta = parseInesHeader(romBytes, fileName);
    this.romBytes = new Uint8Array(romBytes);
    this.romMeta = meta;
    this.resetInternal();
    this.running = true;
    this.paused = false;
    return meta;
  }

  private resetInternal(): void {
    this.ram.fill(0);
    this.frameCount = 0;
    this.port1Mask = 0;
    this.port2Mask = 0;
    this.accHash = 0x811c9dc5;
    if (this.romBytes) {
      for (let i = 0; i < Math.min(256, this.romBytes.length); i++) {
        this.accHash ^= this.romBytes[i];
        this.accHash = Math.imul(this.accHash, 0x01000193) >>> 0;
      }
      this.ram[0x075a] = 2; // Initial 3 lives (raw=2) for SMB1-style telemetry checks
    }
  }

  hasRomLoaded(): boolean {
    return this.romMeta !== null;
  }

  getRomMetadata(): RomMetadata | null {
    return this.romMeta;
  }

  getRomBytes(): Uint8Array | null {
    return this.romBytes ? new Uint8Array(this.romBytes) : null;
  }

  start(): void {
    if (!this.romMeta) return;
    this.running = true;
    this.paused = false;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    if (!this.romMeta) return;
    this.paused = false;
    this.running = true;
  }

  reset(): void {
    if (!this.romMeta) return;
    this.resetInternal();
    this.running = true;
    this.paused = false;
  }

  isRunning(): boolean {
    return this.running && !this.paused;
  }

  isPaused(): boolean {
    return this.paused;
  }

  stepFrame(): void {
    if (!this.romMeta || !this.running || this.paused) return;
    this.advanceDeterministic(this.port1Mask, this.port2Mask, false);
  }

  stepFrameWithMasks(port1Mask: number, port2Mask: number, silent = false): void {
    if (!this.romMeta) return;
    this.port1Mask = port1Mask & 0xff;
    this.port2Mask = port2Mask & 0xff;
    this.advanceDeterministic(this.port1Mask, this.port2Mask, silent);
  }

  private advanceDeterministic(p1: number, p2: number, silent: boolean): void {
    this.frameCount += 1;
    this.accHash ^= (this.frameCount & 0xff) ^ ((p1 << 1) & 0xff) ^ ((p2 << 3) & 0xff);
    this.accHash = Math.imul(this.accHash, 0x01000193) >>> 0;

    this.ram[0x0010] = p1;
    this.ram[0x0011] = p2;
    this.ram[0x0012] = this.frameCount & 0xff;
    this.ram[0x0013] = (this.accHash >>> 0) & 0xff;
    if ((p1 & BUTTON_BIT_MAP.RIGHT) !== 0) {
      this.ram[0x075e] = (this.ram[0x075e] + 1) & 0xff;
      this.ram[0x07e0] = Math.min(9, this.ram[0x07e0] + 1);
    }

    if (!silent && this.frameCallbacks.size > 0) {
      const frame = new Uint32Array(NES_WIDTH * NES_HEIGHT);
      const fill = (0xff000000 | (this.accHash & 0x00ffffff)) >>> 0;
      frame.fill(fill);
      for (const cb of this.frameCallbacks) {
        cb(frame, this.frameCount);
      }
    }
  }

  getFrameCount(): number {
    return this.frameCount;
  }

  setButton(port: PlayerPort, button: NesButtonName, pressed: boolean): void {
    const bit = BUTTON_BIT_MAP[button];
    if (port === 1) {
      this.port1Mask = pressed ? this.port1Mask | bit : this.port1Mask & ~bit;
    } else {
      this.port2Mask = pressed ? this.port2Mask | bit : this.port2Mask & ~bit;
    }
  }

  setPortBitmask(port: PlayerPort, mask: number): void {
    if (port === 1) {
      this.port1Mask = mask & 0xff;
    } else {
      this.port2Mask = mask & 0xff;
    }
  }

  getPortBitmask(port: PlayerPort): number {
    return port === 1 ? this.port1Mask : this.port2Mask;
  }

  releaseAllButtons(port?: PlayerPort): void {
    if (!port || port === 1) this.port1Mask = 0;
    if (!port || port === 2) this.port2Mask = 0;
  }

  saveState(): SaveStatePayload {
    if (!this.romMeta) {
      throw new Error('Cannot save state before loading a ROM.');
    }
    return {
      version: 1,
      coreId: this.coreId,
      romName: this.romMeta.name,
      romHash: this.romMeta.hash,
      frameCount: this.frameCount,
      savedAt: Date.now(),
      stateJson: JSON.stringify({
        frameCount: this.frameCount,
        port1Mask: this.port1Mask,
        port2Mask: this.port2Mask,
        accHash: this.accHash,
        ram: Array.from(this.ram),
      }),
    };
  }

  loadState(payload: SaveStatePayload): void {
    if (!this.romMeta) {
      throw new Error('Cannot load state before loading a ROM.');
    }
    const parsed = JSON.parse(payload.stateJson) as {
      frameCount: number;
      port1Mask: number;
      port2Mask: number;
      accHash: number;
      ram: number[];
    };
    this.frameCount = parsed.frameCount;
    this.port1Mask = parsed.port1Mask;
    this.port2Mask = parsed.port2Mask;
    this.accHash = parsed.accHash >>> 0;
    this.ram = Uint8Array.from(parsed.ram);
  }

  computeStateChecksum(): string {
    let hash = 0x811c9dc5;
    hash ^= this.frameCount;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= this.accHash;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    for (let i = 0; i < this.ram.length; i++) {
      hash ^= this.ram[i];
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  readRamByte(address: number): number {
    return this.ram[address & 0x07ff] ?? 0;
  }

  readRamSlice(startAddress: number, length: number): Uint8Array {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      out[i] = this.ram[(startAddress + i) & 0x07ff] ?? 0;
    }
    return out;
  }

  onFrame(listener: FrameListener): () => void {
    this.frameCallbacks.add(listener);
    return () => this.frameCallbacks.delete(listener);
  }

  onAudioSample(_listener: AudioSampleListener): () => void {
    return () => {};
  }

  dispose(): void {
    this.running = false;
    this.paused = false;
    this.frameCallbacks.clear();
  }
}
