export interface UsageSessionRecord {
  id: string;
  gameId: string;
  gameName: string;
  startedAt: number;
  endedAt: number;
  durationSeconds: number;
}

export interface GameUsageSummary {
  gameId: string;
  gameName: string;
  totalSeconds: number;
  sessions: number;
  lastPlayedAt: number;
}

export interface UsageReportSnapshot {
  totalPlaySeconds: number;
  totalSessions: number;
  games: GameUsageSummary[];
  recentSessions: UsageSessionRecord[];
}

export function formatSessionDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

export function formatHumanDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  if (safe < 60) return `${safe}s`;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

const STORAGE_KEY = 'tgk_nes_usage_reports_v1';
const MAX_RECENT_SESSIONS = 40;

interface PersistedUsagePayload {
  sessions: UsageSessionRecord[];
}

function emptyPayload(): PersistedUsagePayload {
  return { sessions: [] };
}

export class SessionTimerStore {
  private sessions: UsageSessionRecord[] = [];
  private hydrated = false;

  private hydrate(): void {
    if (this.hydrated) return;
    this.hydrated = true;
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<PersistedUsagePayload>;
      if (Array.isArray(parsed.sessions)) {
        this.sessions = parsed.sessions
          .filter(
            (s): s is UsageSessionRecord =>
              Boolean(s) &&
              typeof s.id === 'string' &&
              typeof s.gameId === 'string' &&
              typeof s.gameName === 'string' &&
              typeof s.durationSeconds === 'number' &&
              s.durationSeconds >= 0
          )
          .slice(0, MAX_RECENT_SESSIONS);
      }
    } catch {
      this.sessions = [];
    }
  }

  private persist(): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const payload: PersistedUsagePayload = {
        sessions: this.sessions.slice(0, MAX_RECENT_SESSIONS),
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Keep in-memory state if storage quota is restricted
    }
  }

  public recordSession(input: {
    gameId: string;
    gameName: string;
    startedAt: number;
    endedAt?: number;
    durationSeconds: number;
  }): UsageSessionRecord | null {
    this.hydrate();
    const cleanDuration = Math.max(0, Math.floor(input.durationSeconds));
    if (cleanDuration <= 0) return null;

    const cleanName = input.gameName.trim() || 'NES Session';
    const cleanId = input.gameId.trim() || cleanName.toLowerCase();
    const endedAt = input.endedAt ?? Date.now();
    const record: UsageSessionRecord = {
      id: `sess_${endedAt}_${Math.random().toString(36).slice(2, 7)}`,
      gameId: cleanId,
      gameName: cleanName,
      startedAt: input.startedAt,
      endedAt,
      durationSeconds: cleanDuration,
    };

    this.sessions = [record, ...this.sessions].slice(0, MAX_RECENT_SESSIONS);
    this.persist();
    return record;
  }

  public getSnapshot(): UsageReportSnapshot {
    this.hydrate();
    const byGame = new Map<string, GameUsageSummary>();
    let totalPlaySeconds = 0;

    for (const s of this.sessions) {
      totalPlaySeconds += s.durationSeconds;
      const existing = byGame.get(s.gameId);
      if (existing) {
        existing.totalSeconds += s.durationSeconds;
        existing.sessions += 1;
        existing.lastPlayedAt = Math.max(existing.lastPlayedAt, s.endedAt);
      } else {
        byGame.set(s.gameId, {
          gameId: s.gameId,
          gameName: s.gameName,
          totalSeconds: s.durationSeconds,
          sessions: 1,
          lastPlayedAt: s.endedAt,
        });
      }
    }

    const games = Array.from(byGame.values()).sort(
      (a, b) => b.lastPlayedAt - a.lastPlayedAt || b.totalSeconds - a.totalSeconds
    );

    return {
      totalPlaySeconds,
      totalSessions: this.sessions.length,
      games,
      recentSessions: this.sessions.slice(0, 12),
    };
  }

  public getRecentGameOrder(): string[] {
    return this.getSnapshot().games.map((g) => g.gameId);
  }

  public clearReports(): void {
    this.sessions = emptyPayload().sessions;
    this.hydrated = true;
    this.persist();
  }
}
