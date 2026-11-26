import { Nostalgist } from 'nostalgist';
import type { NesButtonName, PlayerPort } from '../netplay/protocol';
import {
  NES_HEIGHT,
  NES_WIDTH,
  type AudioSampleListener,
  type FrameListener,
  type INesEmulatorCore,
  type SaveStatePayload,
} from './INesEmulatorCore';
import {
  base64ToUint8Array,
  computeStringHash32,
  parseInesHeader,
  uint8ArrayToBase64,
  type RomMetadata,
} from './inesParser';
import { installWakeLockPolicyGuard } from './wakeLockGuard';

const RETROARCH_BUTTON_MAP: Record<NesButtonName, string> = {
  A: 'a',
  B: 'b',
  SELECT: 'select',
  START: 'start',
  UP: 'up',
  DOWN: 'down',
  LEFT: 'left',
  RIGHT: 'right',
};

const ALL_BUTTONS: NesButtonName[] = [
  'A',
  'B',
  'SELECT',
  'START',
  'UP',
  'DOWN',
  'LEFT',
  'RIGHT',
];

const BUTTON_BIT_MAP: Record<NesButtonName, number> = {
  A: 0x80,
  B: 0x40,
  SELECT: 0x20,
  START: 0x10,
  UP: 0x08,
  DOWN: 0x04,
  LEFT: 0x02,
  RIGHT: 0x01,
};

async function hasSelfHostedFceummCore(): Promise<boolean> {
  const selfHostedEnabled =
    typeof import.meta !== 'undefined' &&
    Boolean((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SELF_HOSTED_FCEUMM === 'true');
  if (!selfHostedEnabled) return false;
  if (typeof window === 'undefined' || typeof fetch !== 'function') return false;
  try {
    const [wasmRes, jsRes] = await Promise.all([
      fetch('/cores/fceumm_libretro.wasm', { method: 'HEAD' }),
      fetch('/cores/fceumm_libretro.js', { method: 'HEAD' }),
    ]);
    if (!wasmRes.ok || !jsRes.ok) return false;
    const wasmType = (wasmRes.headers.get('content-type') || '').toLowerCase();
    const jsType = (jsRes.headers.get('content-type') || '').toLowerCase();
    if (wasmType.includes('text/html') || jsType.includes('text/html')) {
      return false;
    }
    return wasmType.includes('wasm') || wasmType.includes('octet-stream');
  } catch {
    return false;
  }
}

/**
 * Adapter integrating the official open-source Libretro FCEUmm NES core
 * (https://github.com/libretro/libretro-fceumm) via WebAssembly (Nostalgist/RetroArch)
 * directly on a native HTML5 <canvas> with zero WebView/iframe.
 */
export class LibretroFceummAdapter implements INesEmulatorCore {
  public readonly coreId = 'libretro-fceumm' as const;
  public readonly coreLabel = 'FCEUmm WASM (libretro-fceumm)';
  public readonly coreVersion = 'libretro-fceumm-wasm-2.0';
  public readonly repoUrl = 'https://github.com/libretro/libretro-fceumm';
  public readonly width = NES_WIDTH;
  public readonly height = NES_HEIGHT;
  public readonly rendersOwnCanvas = true;

  private canvas: HTMLCanvasElement | null = null;
  private instance: Nostalgist | null = null;
  private romMetadata: RomMetadata | null = null;
  private romBytes: Uint8Array | null = null;

  private running = false;
  private paused = false;
  private muted = false;
  private frameCount = 0;

  private readonly buttonStates: Record<PlayerPort, Record<NesButtonName, boolean>> = {
    1: {
      A: false,
      B: false,
      SELECT: false,
      START: false,
      UP: false,
      DOWN: false,
      LEFT: false,
      RIGHT: false,
    },
    2: {
      A: false,
      B: false,
      SELECT: false,
      START: false,
      UP: false,
      DOWN: false,
      LEFT: false,
      RIGHT: false,
    },
  };

  public attachCanvas(canvas: HTMLCanvasElement | null): void {
    this.canvas = canvas;
  }

  public async loadRom(romBytes: Uint8Array, name = 'Cartridge.nes'): Promise<RomMetadata> {
    const metadata = parseInesHeader(romBytes, name);

    if (!this.canvas) {
      throw new Error(
        'FCEUmm WASM canvas is not mounted yet. Switch to playing view and retry.'
      );
    }

    this.exitCurrentInstance();
    this.releaseAllButtons();

    const safeFileName = name.toLowerCase().endsWith('.nes') ? name : `${name}.nes`;
    const copy = new Uint8Array(romBytes);
    const useLocalCore = await hasSelfHostedFceummCore();

    const coreOption = useLocalCore
      ? {
          name: 'fceumm',
          js: '/cores/fceumm_libretro.js',
          wasm: '/cores/fceumm_libretro.wasm',
        }
      : 'fceumm';

    // Prevent Emscripten PlatformEmscriptenDoSetWakeLock NotAllowedError inside restricted iframes
    installWakeLockPolicyGuard();

    const nostalgist = await Nostalgist.launch({
      core: coreOption,
      element: this.canvas,
      rom: {
        fileName: safeFileName,
        fileContent: new Blob([copy], { type: 'application/octet-stream' }),
      },
      size: 'auto',
      style: {
        width: '100%',
        height: '100%',
        display: 'block',
      },
      respondToGlobalEvents: false,
      cache: {
        core: true,
      },
      retroarchConfig: {
        suspend_screensaver_enable: false,
        notification_show_autoconfig: false,
        notification_show_cheats_applied: false,
        notification_show_config_override_load: false,
        notification_show_netplay_extra: false,
        notification_show_patch_applied: false,
        notification_show_remap_load: false,
        notification_show_save_state: false,
        notification_show_screenshot: false,
        notification_show_set_initial_disk: false,
        audio_mute_enable: this.muted,
      },
    });

    this.instance = nostalgist;
    this.romMetadata = metadata;
    this.romBytes = copy;
    this.frameCount = 0;
    this.running = true;
    this.paused = false;

    return metadata;
  }

  public start(): void {
    if (!this.instance) return;
    this.instance.resume();
    this.running = true;
    this.paused = false;
  }

  public pause(): void {
    if (!this.instance || this.paused) return;
    this.instance.pause();
    this.paused = true;
  }

  public resume(): void {
    if (!this.instance) return;
    this.instance.resume();
    this.running = true;
    this.paused = false;
  }

  public reset(): void {
    if (!this.instance) return;
    this.releaseAllButtons();
    this.instance.restart();
    this.frameCount = 0;
    this.running = true;
    this.paused = false;
  }

  public stepFrame(): void {
    // RetroArch WASM drives its own 60Hz Emscripten main loop; track frame count when active.
    if (this.running && !this.paused && this.instance) {
      this.frameCount += 1;
    }
  }

  public stepFrameWithMasks(p1Mask: number, p2Mask: number, _silent = false): void {
    if (!this.instance) return;
    this.setPortBitmask(1, p1Mask);
    this.setPortBitmask(2, p2Mask);
    this.frameCount += 1;
  }

  public setPortBitmask(port: PlayerPort, mask: number): void {
    const clamped = mask & 0xff;
    for (const btn of ALL_BUTTONS) {
      const pressed = (clamped & BUTTON_BIT_MAP[btn]) !== 0;
      this.setButton(port, btn, pressed);
    }
  }

  public getPortBitmask(port: PlayerPort): number {
    let mask = 0;
    for (const btn of ALL_BUTTONS) {
      if (this.buttonStates[port][btn]) {
        mask |= BUTTON_BIT_MAP[btn];
      }
    }
    return mask;
  }

  public computeStateChecksum(): string {
    const romTag = this.romMetadata?.sha256 ?? 'no-rom';
    const p1 = this.getPortBitmask(1);
    const p2 = this.getPortBitmask(2);
    return computeStringHash32(`${this.coreVersion}:${romTag}:${this.frameCount}:${p1}:${p2}`);
  }

  public setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    if (this.instance) {
      this.instance.sendCommand('MUTE');
    }
  }

  public isRunning(): boolean {
    return this.running && !this.paused && this.instance !== null;
  }

  public isPaused(): boolean {
    return this.paused;
  }

  public hasRomLoaded(): boolean {
    return this.romMetadata !== null && this.instance !== null;
  }

  public getFrameCount(): number {
    return this.frameCount;
  }

  public getRomMetadata(): RomMetadata | null {
    return this.romMetadata;
  }

  public getRomBytes(): Uint8Array | null {
    return this.romBytes ? new Uint8Array(this.romBytes) : null;
  }

  public setButton(port: PlayerPort, button: NesButtonName, pressed: boolean): void {
    if (!this.instance) return;
    if (this.buttonStates[port][button] === pressed) return;
    this.buttonStates[port][button] = pressed;

    const retroButton = RETROARCH_BUTTON_MAP[button];
    if (pressed) {
      this.instance.pressDown({ button: retroButton, player: port });
    } else {
      this.instance.pressUp({ button: retroButton, player: port });
    }
  }

  public releaseAllButtons(port?: PlayerPort): void {
    const ports: PlayerPort[] = port ? [port] : [1, 2];
    for (const p of ports) {
      for (const btn of ALL_BUTTONS) {
        if (this.buttonStates[p][btn]) {
          this.buttonStates[p][btn] = false;
          if (this.instance) {
            this.instance.pressUp({ button: RETROARCH_BUTTON_MAP[btn], player: p });
          }
        }
      }
    }
  }

  public async saveState(): Promise<SaveStatePayload> {
    if (!this.instance || !this.romMetadata) {
      throw new Error('Cannot save state before a .nes ROM is running on FCEUmm.');
    }
    const { state } = await this.instance.saveState();
    const arrayBuffer = await state.arrayBuffer();
    const base64 = uint8ArrayToBase64(new Uint8Array(arrayBuffer));

    return {
      version: 1,
      coreId: this.coreId,
      romName: this.romMetadata.name,
      romHash: this.romMetadata.hash,
      frameCount: this.frameCount,
      savedAt: Date.now(),
      stateJson: base64,
    };
  }

  public async loadState(payload: SaveStatePayload): Promise<void> {
    if (!this.instance || !this.romMetadata) {
      throw new Error('Cannot load state before a .nes ROM is running on FCEUmm.');
    }
    if (payload.coreId !== this.coreId) {
      throw new Error(
        `This save state was created with ${payload.coreId} and cannot be loaded into ${this.coreId}.`
      );
    }
    if (payload.romHash && payload.romHash !== this.romMetadata.hash) {
      throw new Error(
        `Save state belongs to "${payload.romName}" and does not match "${this.romMetadata.name}".`
      );
    }

    const bytes = base64ToUint8Array(payload.stateJson);
    const blob = new Blob([bytes.buffer as ArrayBuffer], {
      type: 'application/octet-stream',
    });
    this.releaseAllButtons();
    await this.instance.loadState(blob);
    this.frameCount = payload.frameCount;
  }

  public onFrame(_listener: FrameListener): () => void {
    // Libretro FCEUmm renders directly onto the attached WebGL/Canvas element.
    return () => {};
  }

  public onAudioSample(_listener: AudioSampleListener): () => void {
    // Libretro FCEUmm drives audio directly through Emscripten Web Audio.
    return () => {};
  }

  private exitCurrentInstance(): void {
    if (this.instance) {
      try {
        this.instance.exit({ removeCanvas: false });
      } catch {
        // Ignore teardown errors when core was already stopped
      }
      this.instance = null;
    }
  }

  public dispose(): void {
    this.running = false;
    this.paused = true;
    this.releaseAllButtons();
    this.exitCurrentInstance();
    this.canvas = null;
  }
}
