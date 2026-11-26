export interface FriendRival {
  id: string;
  name: string;
  tag: string;
  wins: number; // Your wins against this rival
  losses: number; // Your losses against this rival
  draws: number;
  highScore: number; // Highest score recorded in matches with this rival
  rivalHighScore: number;
  currentStreak: number; // Positive = win streak, negative = loss streak
  lastRomName: string | null;
  lastPlayedAt: number | null;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'tgk_nes_friends_rivalry_v1';

const DEFAULT_ROSTER: FriendRival[] = [
  {
    id: 'rival-arjun',
    name: 'Arjun',
    tag: 'P2',
    wins: 0,
    losses: 0,
    draws: 0,
    highScore: 0,
    rivalHighScore: 0,
    currentStreak: 0,
    lastRomName: null,
    lastPlayedAt: null,
  },
  {
    id: 'rival-rohan',
    name: 'Rohan',
    tag: 'PRO',
    wins: 0,
    losses: 0,
    draws: 0,
    highScore: 0,
    rivalHighScore: 0,
    currentStreak: 0,
    lastRomName: null,
    lastPlayedAt: null,
  },
];

function sanitizeRival(raw: Partial<FriendRival>): FriendRival | null {
  if (!raw || typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  const cleanName = raw.name.trim().slice(0, 24);
  if (!cleanName) return null;
  return {
    id: raw.id.slice(0, 48),
    name: cleanName,
    tag: (raw.tag || cleanName.slice(0, 3)).toUpperCase().slice(0, 4),
    wins: Math.max(0, Math.floor(Number(raw.wins) || 0)),
    losses: Math.max(0, Math.floor(Number(raw.losses) || 0)),
    draws: Math.max(0, Math.floor(Number(raw.draws) || 0)),
    highScore: Math.max(0, Math.floor(Number(raw.highScore) || 0)),
    rivalHighScore: Math.max(0, Math.floor(Number(raw.rivalHighScore) || 0)),
    currentStreak: Math.trunc(Number(raw.currentStreak) || 0),
    lastRomName: typeof raw.lastRomName === 'string' ? raw.lastRomName.slice(0, 80) : null,
    lastPlayedAt: typeof raw.lastPlayedAt === 'number' ? raw.lastPlayedAt : null,
  };
}

/**
 * Persists Friend Roster, Win/Loss Rivalry records, Win Streaks, and High Scores.
 */
export class FriendRivalryStore {
  private readonly storage: StorageLike | null;
  private roster: FriendRival[] = [];

  constructor(storage?: StorageLike | null) {
    this.storage =
      storage !== undefined
        ? storage
        : typeof window !== 'undefined' && window.localStorage
          ? window.localStorage
          : null;
    this.load();
  }

  private load(): void {
    if (!this.storage) {
      this.roster = DEFAULT_ROSTER.map((r) => ({ ...r }));
      return;
    }
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) {
        this.roster = DEFAULT_ROSTER.map((r) => ({ ...r }));
        this.persist();
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        this.roster = DEFAULT_ROSTER.map((r) => ({ ...r }));
        return;
      }
      const valid = parsed
        .map((item) => sanitizeRival(item as Partial<FriendRival>))
        .filter((item): item is FriendRival => item !== null);
      this.roster = valid.length > 0 ? valid : DEFAULT_ROSTER.map((r) => ({ ...r }));
    } catch {
      this.roster = DEFAULT_ROSTER.map((r) => ({ ...r }));
    }
  }

  private persist(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.roster));
    } catch {
      // ignore storage quota issues
    }
  }

  public listRivals(): FriendRival[] {
    return this.roster.map((r) => ({ ...r }));
  }

  public addFriend(name: string, tag?: string): FriendRival {
    const cleanName = name.trim().slice(0, 24) || 'Friend';
    const existing = this.roster.find(
      (r) => r.name.toLowerCase() === cleanName.toLowerCase()
    );
    if (existing) return { ...existing };

    const friend: FriendRival = {
      id: `rival_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      tag: (tag || cleanName.slice(0, 3)).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'FRD',
      wins: 0,
      losses: 0,
      draws: 0,
      highScore: 0,
      rivalHighScore: 0,
      currentStreak: 0,
      lastRomName: null,
      lastPlayedAt: null,
    };
    this.roster = [friend, ...this.roster];
    this.persist();
    return { ...friend };
  }

  public removeFriend(id: string): void {
    this.roster = this.roster.filter((r) => r.id !== id);
    this.persist();
  }

  /**
   * Records a finished VS Race result against a friend rival.
   * `outcome`: 'win' = Player 1 won, 'loss' = Rival (Player 2) won, 'draw' = tie.
   */
  public recordMatchResult(params: {
    rivalId: string | null;
    rivalNameFallback: string;
    outcome: 'win' | 'loss' | 'draw';
    p1Score: number;
    p2Score: number;
    romName: string;
    nowMs?: number;
  }): FriendRival {
    let idx = params.rivalId ? this.roster.findIndex((r) => r.id === params.rivalId) : -1;
    if (idx < 0) {
      const created = this.addFriend(params.rivalNameFallback || 'Friend');
      idx = this.roster.findIndex((r) => r.id === created.id);
    }

    const current = this.roster[idx];
    const nextStreak =
      params.outcome === 'win'
        ? current.currentStreak >= 0
          ? current.currentStreak + 1
          : 1
        : params.outcome === 'loss'
          ? current.currentStreak <= 0
            ? current.currentStreak - 1
            : -1
          : 0;

    const updated: FriendRival = {
      ...current,
      wins: current.wins + (params.outcome === 'win' ? 1 : 0),
      losses: current.losses + (params.outcome === 'loss' ? 1 : 0),
      draws: current.draws + (params.outcome === 'draw' ? 1 : 0),
      highScore: Math.max(current.highScore, Math.floor(params.p1Score)),
      rivalHighScore: Math.max(current.rivalHighScore, Math.floor(params.p2Score)),
      currentStreak: nextStreak,
      lastRomName: params.romName.slice(0, 80),
      lastPlayedAt: params.nowMs ?? Date.now(),
    };

    this.roster[idx] = updated;
    this.persist();
    return { ...updated };
  }
}
