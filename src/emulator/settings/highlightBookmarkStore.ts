import type { NesCoreId, SaveStatePayload } from '../core/INesEmulatorCore';

export interface HighlightBookmark {
  id: string;
  label: string;
  coreId: NesCoreId;
  romHash: string;
  romName: string;
  frameCount: number;
  createdAt: number;
  thumbnailDataUrl: string | null;
  statePayload: SaveStatePayload;
}

export interface HighlightBookmarkSummary {
  id: string;
  label: string;
  coreId: NesCoreId;
  romHash: string;
  romName: string;
  frameCount: number;
  createdAt: number;
  thumbnailDataUrl: string | null;
}

const BOOKMARK_PREFIX = 'tgk_nes_highlights_v1';
const MAX_BOOKMARKS_PER_GAME = 8;

/**
 * Instant Highlight / Clip Bookmark store: captures save-state + exact timestamp + thumbnail per game.
 */
export class HighlightBookmarkStore {
  private readonly memory = new Map<string, HighlightBookmark[]>();

  private keyFor(coreId: NesCoreId, romHash: string): string {
    return `${BOOKMARK_PREFIX}:${coreId}:${romHash}`;
  }

  private readAll(coreId: NesCoreId, romHash: string): HighlightBookmark[] {
    const key = this.keyFor(coreId, romHash);
    const cached = this.memory.get(key);
    if (cached) return cached;

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw) as HighlightBookmark[];
          if (Array.isArray(parsed)) {
            this.memory.set(key, parsed);
            return parsed;
          }
        }
      } catch {
        // Ignore corrupted storage
      }
    }
    return [];
  }

  private persist(coreId: NesCoreId, romHash: string, items: HighlightBookmark[]): void {
    const key = this.keyFor(coreId, romHash);
    this.memory.set(key, items);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(key, JSON.stringify(items));
      } catch {
        // If quota is tight, strip thumbnail from older bookmarks and retry once
        try {
          const compact = items.map((item, idx) =>
            idx > 2 ? { ...item, thumbnailDataUrl: null } : item
          );
          window.localStorage.setItem(key, JSON.stringify(compact));
        } catch {
          // Keep in memory
        }
      }
    }
  }

  public addBookmark(
    statePayload: SaveStatePayload,
    options?: { label?: string; thumbnailDataUrl?: string | null }
  ): HighlightBookmark {
    const existing = this.readAll(statePayload.coreId, statePayload.romHash);
    const createdAt = Date.now();
    const id = `hl_${createdAt}_${Math.random().toString(36).slice(2, 7)}`;
    const defaultLabel = `Highlight #${existing.length + 1}`;
    const entry: HighlightBookmark = {
      id,
      label: options?.label?.trim() || defaultLabel,
      coreId: statePayload.coreId,
      romHash: statePayload.romHash,
      romName: statePayload.romName,
      frameCount: statePayload.frameCount,
      createdAt,
      thumbnailDataUrl: options?.thumbnailDataUrl ?? null,
      statePayload,
    };

    const next = [entry, ...existing].slice(0, MAX_BOOKMARKS_PER_GAME);
    this.persist(statePayload.coreId, statePayload.romHash, next);
    return entry;
  }

  public listBookmarks(coreId: NesCoreId, romHash: string): HighlightBookmarkSummary[] {
    return this.readAll(coreId, romHash).map(
      ({ statePayload: _unused, ...summary }) => summary
    );
  }

  public getBookmark(
    coreId: NesCoreId,
    romHash: string,
    id: string
  ): HighlightBookmark | null {
    return this.readAll(coreId, romHash).find((b) => b.id === id) ?? null;
  }

  public deleteBookmark(coreId: NesCoreId, romHash: string, id: string): void {
    const next = this.readAll(coreId, romHash).filter((b) => b.id !== id);
    this.persist(coreId, romHash, next);
  }
}
