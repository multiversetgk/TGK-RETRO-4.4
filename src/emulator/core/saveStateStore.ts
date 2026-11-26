import type { NesCoreId, SaveStatePayload } from './INesEmulatorCore';

export type SaveSlotId = 1 | 2 | 3;

export interface SaveSlotSummary {
  slot: SaveSlotId;
  coreId: NesCoreId;
  romName: string;
  romHash: string;
  frameCount: number;
  savedAt: number;
}

const STORAGE_PREFIX = 'tgk_nes_savestate_v2_';

export class SaveStateStore {
  private readonly memoryFallback = new Map<string, SaveStatePayload>();

  private keyFor(coreId: NesCoreId, romHash: string, slot: SaveSlotId): string {
    return `${STORAGE_PREFIX}${coreId}_${romHash}_slot_${slot}`;
  }

  public save(slot: SaveSlotId, payload: SaveStatePayload): SaveSlotSummary {
    const key = this.keyFor(payload.coreId, payload.romHash, slot);
    this.memoryFallback.set(key, payload);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, JSON.stringify(payload));
      }
    } catch {
      // Fall back to in-memory slot if localStorage quota is exceeded (e.g., large WASM states)
    }
    return {
      slot,
      coreId: payload.coreId,
      romName: payload.romName,
      romHash: payload.romHash,
      frameCount: payload.frameCount,
      savedAt: payload.savedAt,
    };
  }

  public load(
    coreId: NesCoreId,
    romHash: string,
    slot: SaveSlotId
  ): SaveStatePayload | null {
    const key = this.keyFor(coreId, romHash, slot);
    const inMem = this.memoryFallback.get(key);
    if (inMem) return inMem;

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as SaveStatePayload;
        this.memoryFallback.set(key, parsed);
        return parsed;
      }
    } catch {
      return null;
    }
    return null;
  }

  public listSlots(
    coreId: NesCoreId,
    romHash: string
  ): Record<SaveSlotId, SaveSlotSummary | null> {
    const result: Record<SaveSlotId, SaveSlotSummary | null> = {
      1: null,
      2: null,
      3: null,
    };
    const slots: SaveSlotId[] = [1, 2, 3];
    for (const slot of slots) {
      const data = this.load(coreId, romHash, slot);
      if (data) {
        result[slot] = {
          slot,
          coreId: data.coreId,
          romName: data.romName,
          romHash: data.romHash,
          frameCount: data.frameCount,
          savedAt: data.savedAt,
        };
      }
    }
    return result;
  }

  public clearSlot(coreId: NesCoreId, romHash: string, slot: SaveSlotId): void {
    const key = this.keyFor(coreId, romHash, slot);
    this.memoryFallback.delete(key);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Ignore storage errors
    }
  }
}
