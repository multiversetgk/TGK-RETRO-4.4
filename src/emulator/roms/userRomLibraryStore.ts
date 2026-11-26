import { parseInesHeader, type RomMetadata } from '../core/inesParser';

export interface UserRomEntry {
  id: string;
  name: string;
  fileName: string;
  mapperId: number;
  mapperName: string;
  prgSizeKb: number;
  chrSizeKb: number;
  sha256: string;
  hash: string;
  sizeBytes: number;
  addedAt: number;
  bytes: Uint8Array;
}

const DB_NAME = 'tgk_nes_user_rom_library_v1';
const DB_VERSION = 1;
const STORE_NAME = 'roms';
const MAX_STORED_ROMS = 24;
export const MAX_USER_ROM_BYTES = 4 * 1024 * 1024; // 4 MB iNES safety cap

interface StoredRomRecord {
  id: string;
  name: string;
  fileName: string;
  mapperId: number;
  mapperName: string;
  prgSizeKb: number;
  chrSizeKb: number;
  sha256: string;
  hash: string;
  sizeBytes: number;
  addedAt: number;
  bytes: ArrayBuffer;
}

function hasIndexedDb(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openRomDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open ROM IndexedDB.'));
  });
}

function toEntry(meta: RomMetadata, fileName: string, bytes: Uint8Array, addedAt: number): UserRomEntry {
  const cleanFileName = fileName.trim() || 'Cartridge.nes';
  return {
    id: meta.sha256,
    name: meta.name,
    fileName: cleanFileName,
    mapperId: meta.mapperId,
    mapperName: meta.mapperName,
    prgSizeKb: meta.prgRomSizeKb,
    chrSizeKb: meta.chrRomSizeKb,
    sha256: meta.sha256,
    hash: meta.hash,
    sizeBytes: bytes.byteLength,
    addedAt,
    bytes: new Uint8Array(bytes),
  };
}

/**
 * Browser-persistent library of real user-selected .nes ROM files.
 * Uses IndexedDB when available (with an in-memory fallback for tests/restricted contexts)
 * so user cartridges stay ready on the shelf without bundling any dummy ROMs.
 */
export class UserRomLibraryStore {
  private readonly memory = new Map<string, UserRomEntry>();

  public async listRoms(): Promise<UserRomEntry[]> {
    if (hasIndexedDb()) {
      try {
        const db = await openRomDb();
        const records = await new Promise<StoredRomRecord[]>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const req = tx.objectStore(STORE_NAME).getAll();
          req.onsuccess = () => resolve((req.result as StoredRomRecord[]) ?? []);
          req.onerror = () => reject(req.error ?? new Error('Failed to read ROM library.'));
        });
        db.close();

        this.memory.clear();
        for (const rec of records) {
          const entry: UserRomEntry = {
            id: rec.id,
            name: rec.name,
            fileName: rec.fileName,
            mapperId: rec.mapperId,
            mapperName: rec.mapperName,
            prgSizeKb: rec.prgSizeKb,
            chrSizeKb: rec.chrSizeKb,
            sha256: rec.sha256,
            hash: rec.hash,
            sizeBytes: rec.sizeBytes,
            addedAt: rec.addedAt,
            bytes: new Uint8Array(rec.bytes),
          };
          this.memory.set(entry.id, entry);
        }
      } catch {
        // Fall back to in-memory cache if IndexedDB is blocked
      }
    }

    return Array.from(this.memory.values()).sort((a, b) => b.addedAt - a.addedAt);
  }

  public async saveRom(bytes: Uint8Array, fileName: string): Promise<UserRomEntry> {
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_USER_ROM_BYTES) {
      throw new Error('ROM file size must be between 16 bytes and 4 MB.');
    }

    const meta = parseInesHeader(bytes, fileName);
    const entry = toEntry(meta, fileName, bytes, Date.now());
    this.memory.set(entry.id, entry);

    // Enforce bounded library size (evict oldest beyond MAX_STORED_ROMS)
    const sorted = Array.from(this.memory.values()).sort((a, b) => b.addedAt - a.addedAt);
    const evictedIds: string[] = [];
    while (sorted.length > MAX_STORED_ROMS) {
      const oldest = sorted.pop();
      if (oldest) {
        this.memory.delete(oldest.id);
        evictedIds.push(oldest.id);
      }
    }

    if (hasIndexedDb()) {
      try {
        const db = await openRomDb();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const bufferCopy = entry.bytes.slice().buffer;
          const record: StoredRomRecord = {
            id: entry.id,
            name: entry.name,
            fileName: entry.fileName,
            mapperId: entry.mapperId,
            mapperName: entry.mapperName,
            prgSizeKb: entry.prgSizeKb,
            chrSizeKb: entry.chrSizeKb,
            sha256: entry.sha256,
            hash: entry.hash,
            sizeBytes: entry.sizeBytes,
            addedAt: entry.addedAt,
            bytes: bufferCopy,
          };
          store.put(record);
          for (const oldId of evictedIds) {
            store.delete(oldId);
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error('Failed to persist ROM.'));
        });
        db.close();
      } catch {
        // Keep in-memory entry even if persistent quota is unavailable
      }
    }

    return entry;
  }

  public async getRom(id: string): Promise<UserRomEntry | null> {
    const cached = this.memory.get(id);
    if (cached) return cached;
    const all = await this.listRoms();
    return all.find((r) => r.id === id) ?? null;
  }

  public async removeRom(id: string): Promise<void> {
    this.memory.delete(id);
    if (hasIndexedDb()) {
      try {
        const db = await openRomDb();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).delete(id);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error('Failed to remove ROM.'));
        });
        db.close();
      } catch {
        // Ignore storage errors
      }
    }
  }
}
