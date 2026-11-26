import { computeSha256Hex } from '../core/inesParser';
import { getCatalogGameById } from './nesCatalog60';
import type {
  GamePersonalStats,
  PublicPlayerProfile,
  RankTierInfo,
  RunSessionIntegrityState,
  StageSplitRecord,
  StoredPlayerAccount,
  TrophyTier,
  UnlockedAchievementRecord,
  VerifiedRunSubmission,
} from './types';
import { formatNesFramesToSplitMs } from './verificationEngine';

const STORAGE_KEY = 'tgk_retro2_champions_store_v1';

export const DEFAULT_VS_ELO = 1200;
export const FOUNDER_BADGE_LABEL = 'TGK FOUNDER / CREATOR' as const;

export const RANK_TIERS: RankTierInfo[] = [
  { id: 'rookie', name: 'Rookie', minXp: 0, nextTierXp: 250, colorHex: '#94A3B8' },
  { id: 'arcade-challenger', name: 'Arcade Challenger', minXp: 250, nextTierXp: 750, colorHex: '#38BDF8' },
  { id: 'retro-contender', name: 'Retro Contender', minXp: 750, nextTierXp: 1500, colorHex: '#22D3EE' },
  { id: '8bit-veteran', name: '8-Bit Veteran', minXp: 1500, nextTierXp: 3000, colorHex: '#34D399' },
  { id: 'nes-master', name: 'NES Master', minXp: 3000, nextTierXp: 6000, colorHex: '#A78BFA' },
  { id: 'grand-champion', name: 'Grand Champion', minXp: 6000, nextTierXp: 10000, colorHex: '#F59E0B' },
  { id: 'tgk-legend', name: 'TGK Legend', minXp: 10000, nextTierXp: null, colorHex: '#FBBF24' },
];

export const OFFICIAL_RANKING_RULES = {
  tieBreaker:
    'Ties in speedrun frames or score are broken deterministically by earliest verified submission timestamp (UTC milliseconds). Identical timestamps share rank.',
  invalidRuns:
    'Strict 90s Arcade Rule: Save-State loads, Rewind, Fast-Forward, Cheats/Turbo, Practice Mode, Unverified Core, or >12 Pauses immediately disqualify runs from Official Achievements & Leaderboards.',
  verificationPolicy:
    'Only verified native FCEUmm WRAM/frame-timed runs or moderator-approved video proofs appear across Global, Country, Friends, Game-Wise, and Speedrun/Challenge Leaderboards. Zero synthetic or seeded records.',
  hallOfFameRequirement:
    'Hall of Fame entry requires at least 1 Official Platinum Trophy or 3 Official Gold Trophies verified in Ranked Mode. The App Owner (TGK FOUNDER / CREATOR) appears at the top with their genuine verified records.',
};

export const AVATAR_PRESETS = [
  { id: 'pixel-visor', label: 'Red Visor', bg: '#7F1D1D', accent: '#22D3EE', code: 'RV' },
  { id: 'cobalt-helm', label: 'Cobalt Helm', bg: '#1E3A8A', accent: '#38BDF8', code: 'CH' },
  { id: 'violet-blade', label: 'Shadow Blade', bg: '#4C1D95', accent: '#A78BFA', code: 'SB' },
  { id: 'gold-crown', label: '8-Bit Crown', bg: '#78350F', accent: '#F59E0B', code: '8C' },
  { id: 'emerald-shield', label: 'Emerald Shield', bg: '#14532D', accent: '#34D399', code: 'ES' },
];

export const COUNTRY_OPTIONS = [
  { code: 'IN', name: 'India' },
  { code: 'US', name: 'United States' },
  { code: 'JP', name: 'Japan' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'BR', name: 'Brazil' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
];

export interface ChampionsPersistedState {
  accounts: StoredPlayerAccount[];
  activePlayerId: string | null;
  unlockedByPlayer: Record<string, UnlockedAchievementRecord[]>;
  statsByPlayer: Record<string, Record<string, GamePersonalStats>>;
  verifiedRecords: VerifiedRunSubmission[];
}

export function calculateLevelFromXp(xp: number): { level: number; nextLevelXp: number } {
  const safeXp = Math.max(0, Math.floor(xp));
  const level = Math.floor(Math.sqrt(safeXp / 100)) + 1;
  const nextLevelXp = level * level * 100;
  return { level, nextLevelXp };
}

export function getRankTierForXp(xp: number): RankTierInfo {
  const safeXp = Math.max(0, Math.floor(xp));
  let matched = RANK_TIERS[0];
  for (const tier of RANK_TIERS) {
    if (safeXp >= tier.minXp) {
      matched = tier;
    }
  }
  return matched;
}

/**
 * Standard competitive 2P VS ELO rating delta calculator.
 */
export function calculateEloDelta(
  playerRating: number,
  opponentRating: number,
  outcome: 'win' | 'loss' | 'draw',
  kFactor = 32
): number {
  const expected = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
  const actual = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
  return Math.round(kFactor * (actual - expected));
}

function hashPassword(password: string, salt: string): string {
  const encoded = new TextEncoder().encode(`tgk_champions_v1:${salt}:${password}`);
  return computeSha256Hex(encoded);
}

function normalizeStoredAccount(raw: Partial<StoredPlayerAccount>): StoredPlayerAccount {
  const xp = Math.max(0, Math.floor(raw.xp ?? 0));
  const { level, nextLevelXp } = calculateLevelFromXp(xp);
  const eloRating =
    typeof raw.eloRating === 'number' && Number.isFinite(raw.eloRating)
      ? Math.max(100, Math.round(raw.eloRating))
      : DEFAULT_VS_ELO;
  const peakElo =
    typeof raw.peakElo === 'number' && Number.isFinite(raw.peakElo)
      ? Math.max(eloRating, Math.round(raw.peakElo))
      : eloRating;
  const isFounderCreator = Boolean(raw.isFounderCreator);

  return {
    playerId: raw.playerId || `plyr_${Date.now().toString(36)}`,
    username: raw.username || 'Player',
    countryCode: (raw.countryCode || 'IN').toUpperCase().slice(0, 2),
    avatarId: raw.avatarId || AVATAR_PRESETS[0].id,
    authMethod: raw.authMethod || 'username-password',
    xp,
    level,
    nextLevelXp,
    rankTier: getRankTierForXp(xp),
    eloRating,
    peakElo,
    vsWins: Math.max(0, Math.floor(raw.vsWins ?? 0)),
    vsLosses: Math.max(0, Math.floor(raw.vsLosses ?? 0)),
    vsDraws: Math.max(0, Math.floor(raw.vsDraws ?? 0)),
    friends: Array.isArray(raw.friends)
      ? Array.from(new Set(raw.friends.filter((f): f is string => typeof f === 'string' && f.trim().length > 0)))
      : [],
    isFounderCreator,
    founderBadgeLabel: isFounderCreator ? FOUNDER_BADGE_LABEL : undefined,
    trophies: {
      bronze: Math.max(0, Math.floor(raw.trophies?.bronze ?? 0)),
      silver: Math.max(0, Math.floor(raw.trophies?.silver ?? 0)),
      gold: Math.max(0, Math.floor(raw.trophies?.gold ?? 0)),
      platinum: Math.max(0, Math.floor(raw.trophies?.platinum ?? 0)),
    },
    createdAtMs: raw.createdAtMs ?? Date.now(),
    cloudSyncConfigured: Boolean(raw.cloudSyncConfigured),
    passwordHashHex: raw.passwordHashHex || '',
    passwordSalt: raw.passwordSalt || '',
  };
}

function toPublicProfile(account: StoredPlayerAccount): PublicPlayerProfile {
  const rankTier = getRankTierForXp(account.xp);
  return {
    playerId: account.playerId,
    username: account.username,
    countryCode: account.countryCode,
    avatarId: account.avatarId,
    authMethod: account.authMethod,
    xp: account.xp,
    level: account.level,
    nextLevelXp: account.nextLevelXp,
    rankTier,
    eloRating: account.eloRating,
    peakElo: account.peakElo,
    vsWins: account.vsWins,
    vsLosses: account.vsLosses,
    vsDraws: account.vsDraws,
    friends: [...account.friends],
    isFounderCreator: account.isFounderCreator,
    founderBadgeLabel: account.isFounderCreator ? FOUNDER_BADGE_LABEL : undefined,
    trophies: { ...account.trophies },
    createdAtMs: account.createdAtMs,
    cloudSyncConfigured: account.cloudSyncConfigured,
  };
}

function createEmptyState(): ChampionsPersistedState {
  return {
    accounts: [],
    activePlayerId: null,
    unlockedByPlayer: {},
    statsByPlayer: {},
    verifiedRecords: [],
  };
}

function canUseLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

export class ChampionsProfileStore {
  private data: ChampionsPersistedState;

  constructor(private readonly persistToStorage = true) {
    this.data = this.load();
  }

  private load(): ChampionsPersistedState {
    if (!this.persistToStorage || !canUseLocalStorage()) {
      return createEmptyState();
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return createEmptyState();
      const parsed = JSON.parse(raw) as Partial<ChampionsPersistedState>;
      return {
        accounts: Array.isArray(parsed.accounts)
          ? parsed.accounts.map((a) => normalizeStoredAccount(a))
          : [],
        activePlayerId: typeof parsed.activePlayerId === 'string' ? parsed.activePlayerId : null,
        unlockedByPlayer: parsed.unlockedByPlayer ?? {},
        statsByPlayer: parsed.statsByPlayer ?? {},
        verifiedRecords: Array.isArray(parsed.verifiedRecords) ? parsed.verifiedRecords : [],
      };
    } catch {
      return createEmptyState();
    }
  }

  private save(): void {
    if (!this.persistToStorage || !canUseLocalStorage()) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Ignore quota errors gracefully
    }
  }

  public registerUsernameAccount(params: {
    username: string;
    password: string;
    countryCode: string;
    avatarId?: string;
    isFounderCreator?: boolean;
    nowMs?: number;
  }): { ok: true; profile: PublicPlayerProfile } | { ok: false; error: string } {
    const cleanName = params.username.trim();
    if (cleanName.length < 3 || cleanName.length > 24) {
      return { ok: false, error: 'Username must be between 3 and 24 characters.' };
    }
    if (!/^[a-zA-Z0-9_ -]+$/.test(cleanName)) {
      return { ok: false, error: 'Username can contain letters, numbers, spaces, hyphens, or underscores.' };
    }
    if (params.password.length < 6) {
      return { ok: false, error: 'Password must be at least 6 characters.' };
    }
    if (this.data.accounts.some((a) => a.username.toLowerCase() === cleanName.toLowerCase())) {
      return { ok: false, error: 'An account with this username already exists on this device.' };
    }

    const wantsFounder = Boolean(params.isFounderCreator);
    const founderAlreadyExists = this.data.accounts.some((a) => a.isFounderCreator);
    const grantFounder = wantsFounder && !founderAlreadyExists;

    const now = params.nowMs ?? Date.now();
    const salt = `s_${now.toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const { level, nextLevelXp } = calculateLevelFromXp(0);
    const account: StoredPlayerAccount = {
      playerId: `plyr_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      username: cleanName,
      countryCode: (params.countryCode || 'IN').toUpperCase().slice(0, 2),
      avatarId: params.avatarId || (grantFounder ? 'gold-crown' : AVATAR_PRESETS[0].id),
      authMethod: 'username-password',
      xp: 0,
      level,
      nextLevelXp,
      rankTier: getRankTierForXp(0),
      eloRating: DEFAULT_VS_ELO,
      peakElo: DEFAULT_VS_ELO,
      vsWins: 0,
      vsLosses: 0,
      vsDraws: 0,
      friends: [],
      isFounderCreator: grantFounder,
      founderBadgeLabel: grantFounder ? FOUNDER_BADGE_LABEL : undefined,
      trophies: { bronze: 0, silver: 0, gold: 0, platinum: 0 },
      createdAtMs: now,
      cloudSyncConfigured: false,
      passwordSalt: salt,
      passwordHashHex: hashPassword(params.password, salt),
    };

    this.data.accounts.push(account);
    this.data.activePlayerId = account.playerId;
    this.data.unlockedByPlayer[account.playerId] = [];
    this.data.statsByPlayer[account.playerId] = {};
    this.save();
    return { ok: true, profile: toPublicProfile(account) };
  }

  public signInUsernameAccount(
    username: string,
    password: string
  ): { ok: true; profile: PublicPlayerProfile } | { ok: false; error: string } {
    const cleanName = username.trim().toLowerCase();
    const found = this.data.accounts.find((a) => a.username.toLowerCase() === cleanName);
    if (!found) {
      return { ok: false, error: 'Account not found on this device.' };
    }
    const candidateHash = hashPassword(password, found.passwordSalt);
    if (candidateHash !== found.passwordHashHex) {
      return { ok: false, error: 'Incorrect password.' };
    }
    this.data.activePlayerId = found.playerId;
    this.save();
    return { ok: true, profile: toPublicProfile(found) };
  }

  public signOut(): void {
    this.data.activePlayerId = null;
    this.save();
  }

  public getActiveProfile(): PublicPlayerProfile | null {
    if (!this.data.activePlayerId) return null;
    const found = this.data.accounts.find((a) => a.playerId === this.data.activePlayerId);
    return found ? toPublicProfile(found) : null;
  }

  /**
   * Assigns the special "TGK FOUNDER / CREATOR" App Owner badge to the active real account.
   * Only one real account holds the Owner badge at a time; never injects synthetic XP or fake records.
   */
  public claimFounderCreatorBadge(): { ok: true; profile: PublicPlayerProfile } | { ok: false; error: string } {
    if (!this.data.activePlayerId) {
      return { ok: false, error: 'Sign in to your real account before enabling the App Owner badge.' };
    }
    const active = this.data.accounts.find((a) => a.playerId === this.data.activePlayerId);
    if (!active) {
      return { ok: false, error: 'Active account not found.' };
    }
    const existingFounder = this.data.accounts.find(
      (a) => a.isFounderCreator && a.playerId !== active.playerId
    );
    if (existingFounder) {
      return {
        ok: false,
        error: `App Owner badge is already assigned to "${existingFounder.username}" on this device.`,
      };
    }

    active.isFounderCreator = true;
    active.founderBadgeLabel = FOUNDER_BADGE_LABEL;
    // Retroactively tag this real owner's already-verified records with the Founder badge
    for (const rec of this.data.verifiedRecords) {
      if (rec.playerId === active.playerId) {
        rec.isFounderCreator = true;
        rec.founderBadgeLabel = FOUNDER_BADGE_LABEL;
      }
    }
    this.save();
    return { ok: true, profile: toPublicProfile(active) };
  }

  public revokeFounderCreatorBadge(): PublicPlayerProfile | null {
    if (!this.data.activePlayerId) return null;
    const active = this.data.accounts.find((a) => a.playerId === this.data.activePlayerId);
    if (!active) return null;
    active.isFounderCreator = false;
    active.founderBadgeLabel = undefined;
    for (const rec of this.data.verifiedRecords) {
      if (rec.playerId === active.playerId) {
        rec.isFounderCreator = false;
        rec.founderBadgeLabel = undefined;
      }
    }
    this.save();
    return toPublicProfile(active);
  }

  public addFriend(friendUsername: string): { ok: true; friends: string[] } | { ok: false; error: string } {
    if (!this.data.activePlayerId) {
      return { ok: false, error: 'Sign in to manage your Friends Leaderboard roster.' };
    }
    const active = this.data.accounts.find((a) => a.playerId === this.data.activePlayerId);
    if (!active) return { ok: false, error: 'Active account not found.' };

    const cleaned = friendUsername.trim();
    if (cleaned.length < 3 || cleaned.length > 24) {
      return { ok: false, error: 'Enter a friend username (3 to 24 characters).' };
    }
    if (cleaned.toLowerCase() === active.username.toLowerCase()) {
      return { ok: false, error: 'You are already included on your Friends Leaderboard.' };
    }
    if (active.friends.some((f) => f.toLowerCase() === cleaned.toLowerCase())) {
      return { ok: false, error: `${cleaned} is already in your Friends list.` };
    }

    active.friends.push(cleaned);
    this.save();
    return { ok: true, friends: [...active.friends] };
  }

  public removeFriend(friendUsername: string): string[] {
    if (!this.data.activePlayerId) return [];
    const active = this.data.accounts.find((a) => a.playerId === this.data.activePlayerId);
    if (!active) return [];
    const target = friendUsername.trim().toLowerCase();
    active.friends = active.friends.filter((f) => f.toLowerCase() !== target);
    this.save();
    return [...active.friends];
  }

  /**
   * Updates the active real player's 2P VS ELO rating after a genuine finished 2P match.
   */
  public recordVsEloMatch(params: {
    outcome: 'win' | 'loss' | 'draw';
    opponentElo?: number;
  }): { delta: number; newElo: number; profile: PublicPlayerProfile } | null {
    if (!this.data.activePlayerId) return null;
    const active = this.data.accounts.find((a) => a.playerId === this.data.activePlayerId);
    if (!active) return null;

    const oppElo = Math.max(100, Math.round(params.opponentElo ?? DEFAULT_VS_ELO));
    const delta = calculateEloDelta(active.eloRating, oppElo, params.outcome, 32);
    active.eloRating = Math.max(100, active.eloRating + delta);
    if (active.eloRating > active.peakElo) {
      active.peakElo = active.eloRating;
    }
    if (params.outcome === 'win') active.vsWins += 1;
    else if (params.outcome === 'loss') active.vsLosses += 1;
    else active.vsDraws += 1;

    this.save();
    return { delta, newElo: active.eloRating, profile: toPublicProfile(active) };
  }

  public updateActiveProfileAppearance(updates: {
    avatarId?: string;
    countryCode?: string;
  }): PublicPlayerProfile | null {
    if (!this.data.activePlayerId) return null;
    const account = this.data.accounts.find((a) => a.playerId === this.data.activePlayerId);
    if (!account) return null;
    if (updates.avatarId) account.avatarId = updates.avatarId;
    if (updates.countryCode) account.countryCode = updates.countryCode.toUpperCase().slice(0, 2);
    this.save();
    return toPublicProfile(account);
  }

  public getGoogleSignInStatus(): {
    available: boolean;
    message: string;
  } {
    return {
      available: false,
      message:
        'Google Sign-In & Cloud Save require linking a Firebase / Google OAuth client project. Local Username/Password accounts and device storage work offline right now with zero mocked cloud data.',
    };
  }

  public recordUnlockedAchievements(records: UnlockedAchievementRecord[]): PublicPlayerProfile | null {
    if (!this.data.activePlayerId || records.length === 0) {
      return this.getActiveProfile();
    }
    const account = this.data.accounts.find((a) => a.playerId === this.data.activePlayerId);
    if (!account) return null;

    const existing = this.data.unlockedByPlayer[account.playerId] ?? [];
    const existingIds = new Set(existing.map((r) => r.achievementId));

    for (const rec of records) {
      // Never award official XP/trophies from unverified records
      if (!rec.verifiedOfficial) continue;
      if (existingIds.has(rec.achievementId)) continue;
      existing.push(rec);
      existingIds.add(rec.achievementId);
      account.xp += rec.xpAwarded;
      account.trophies[rec.trophyTier] = (account.trophies[rec.trophyTier] ?? 0) + 1;
    }

    const { level, nextLevelXp } = calculateLevelFromXp(account.xp);
    account.level = level;
    account.nextLevelXp = nextLevelXp;
    account.rankTier = getRankTierForXp(account.xp);
    this.data.unlockedByPlayer[account.playerId] = existing;
    this.save();
    return toPublicProfile(account);
  }

  public recordVerifiedStageSplits(gameId: string, splits: StageSplitRecord[]): void {
    if (!this.data.activePlayerId || splits.length === 0) return;
    const verifiedOnly = splits.filter((s) => s.verifiedOfficial);
    if (verifiedOnly.length === 0) return;

    const map = this.data.statsByPlayer[this.data.activePlayerId] ?? {};
    const prev = map[gameId] ?? {
      gameId,
      sessionsPlayed: 0,
      totalFramesPlayed: 0,
      officialRunsCompleted: 0,
      practiceRunsPlayed: 0,
      bestScore: 0,
      bestSpeedrunFrames: null,
      bestStageSplits: [],
      lastPlayedAtMs: Date.now(),
    };

    const bestByStage = new Map<number, StageSplitRecord>();
    for (const existing of prev.bestStageSplits ?? []) {
      bestByStage.set(existing.stageNumber, existing);
    }
    for (const incoming of verifiedOnly) {
      const currentBest = bestByStage.get(incoming.stageNumber);
      if (!currentBest || incoming.splitFrames < currentBest.splitFrames) {
        bestByStage.set(incoming.stageNumber, { ...incoming });
      }
    }

    prev.bestStageSplits = Array.from(bestByStage.values()).sort(
      (a, b) => a.stageNumber - b.stageNumber
    );
    prev.lastPlayedAtMs = Date.now();
    map[gameId] = prev;
    this.data.statsByPlayer[this.data.activePlayerId] = map;
    this.save();
  }

  public getBestStageSplitsForGame(gameId: string, playerId?: string): StageSplitRecord[] {
    const id = playerId ?? this.data.activePlayerId;
    if (!id) return [];
    const stat = this.data.statsByPlayer[id]?.[gameId];
    return stat?.bestStageSplits ? [...stat.bestStageSplits] : [];
  }

  public listUnlockedAchievements(playerId?: string): UnlockedAchievementRecord[] {
    const id = playerId ?? this.data.activePlayerId;
    if (!id) return [];
    return [...(this.data.unlockedByPlayer[id] ?? [])].sort((a, b) => b.unlockedAtMs - a.unlockedAtMs);
  }

  public recordGameSessionStats(params: {
    gameId: string;
    framesPlayed: number;
    score?: number;
    isOfficial: boolean;
    completedSpeedrunFrames?: number | null;
    stageSplits?: StageSplitRecord[];
    nowMs?: number;
  }): void {
    if (!this.data.activePlayerId) return;
    const map = this.data.statsByPlayer[this.data.activePlayerId] ?? {};
    const prev = map[params.gameId] ?? {
      gameId: params.gameId,
      sessionsPlayed: 0,
      totalFramesPlayed: 0,
      officialRunsCompleted: 0,
      practiceRunsPlayed: 0,
      bestScore: 0,
      bestSpeedrunFrames: null,
      bestStageSplits: [],
      lastPlayedAtMs: 0,
    };

    prev.sessionsPlayed += 1;
    prev.totalFramesPlayed += Math.max(0, Math.floor(params.framesPlayed));
    if (params.isOfficial) {
      prev.officialRunsCompleted += 1;
    } else {
      prev.practiceRunsPlayed += 1;
    }
    if (typeof params.score === 'number' && params.score > prev.bestScore) {
      prev.bestScore = params.score;
    }
    if (
      params.isOfficial &&
      typeof params.completedSpeedrunFrames === 'number' &&
      params.completedSpeedrunFrames > 0 &&
      (prev.bestSpeedrunFrames === null || params.completedSpeedrunFrames < prev.bestSpeedrunFrames)
    ) {
      prev.bestSpeedrunFrames = params.completedSpeedrunFrames;
    }
    prev.lastPlayedAtMs = params.nowMs ?? Date.now();
    map[params.gameId] = prev;
    this.data.statsByPlayer[this.data.activePlayerId] = map;
    if (params.isOfficial && params.stageSplits && params.stageSplits.length > 0) {
      this.recordVerifiedStageSplits(params.gameId, params.stageSplits);
    } else {
      this.save();
    }
  }

  public listPlayerGameStats(playerId?: string): GamePersonalStats[] {
    const id = playerId ?? this.data.activePlayerId;
    if (!id) return [];
    return Object.values(this.data.statsByPlayer[id] ?? {}).sort(
      (a, b) => b.lastPlayedAtMs - a.lastPlayedAtMs
    );
  }

  /**
   * Submits a run to the Verified Records ledger.
   * Strictly enforces 90s Arcade Anti-Cheat integrity: flagged runs or Practice Mode runs are
   * rejected and NEVER enter Official Leaderboards.
   */
  public submitRunRecord(params: {
    integrity: RunSessionIntegrityState;
    boardType: VerifiedRunSubmission['boardType'];
    categoryLabel: string;
    score: number;
    requiresManualVideoReview: boolean;
    videoProofUrl?: string;
    nowMs?: number;
  }): { ok: true; record: VerifiedRunSubmission } | { ok: false; error: string } {
    const profile = this.getActiveProfile();
    if (!profile) {
      return { ok: false, error: 'Sign in to a Player Profile before submitting an official record.' };
    }
    if (!params.integrity.gameId || !params.integrity.romSha256) {
      return { ok: false, error: 'Loaded ROM is not matched to a 60-game NES Catalog entry.' };
    }
    const game = getCatalogGameById(params.integrity.gameId);
    if (!game) {
      return { ok: false, error: 'Unknown NES catalog game.' };
    }

    const now = params.nowMs ?? Date.now();
    if (!params.integrity.officialEligible || params.integrity.runValidityStatus !== 'VALID_OFFICIAL') {
      const reasons = params.integrity.flags
        .filter((f) => f.disqualifiesOfficial)
        .map((f) => f.code)
        .join(', ');
      return {
        ok: false,
        error: `Run ineligible for Official Leaderboard (${reasons || '90s Arcade Rule check failed'}).`,
      };
    }

    if (params.requiresManualVideoReview) {
      const url = (params.videoProofUrl ?? '').trim();
      if (!url || !/^https:\/\/(www\.)?(youtube\.com|youtu\.be|twitch\.tv)\//i.test(url)) {
        return {
          ok: false,
          error: 'This category requires a valid HTTPS YouTube or Twitch video proof URL for manual review.',
        };
      }
    }

    const verifiedSplits = params.integrity.stageSplits.filter((s) => s.verifiedOfficial);

    const record: VerifiedRunSubmission = {
      recordId: `rec_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      playerId: profile.playerId,
      playerName: profile.username,
      countryCode: profile.countryCode,
      isFounderCreator: profile.isFounderCreator,
      founderBadgeLabel: profile.founderBadgeLabel,
      rankTierName: profile.rankTier.name,
      eloRating: profile.eloRating,
      gameId: game.gameId,
      gameTitle: game.title,
      boardType: params.boardType,
      categoryLabel: params.categoryLabel,
      frames: params.integrity.elapsedFrames,
      timeSeconds: Number((params.integrity.elapsedFrames / 60.0988).toFixed(2)),
      exactTimeMs: formatNesFramesToSplitMs(params.integrity.elapsedFrames),
      score: Math.max(0, Math.floor(params.score)),
      stageSplits: verifiedSplits.length > 0 ? verifiedSplits : undefined,
      submittedAtMs: now,
      romSha256: params.integrity.romSha256,
      coreVersion: params.integrity.coreVersion,
      verificationStatus: params.requiresManualVideoReview ? 'pending-video-review' : 'verified-native',
      videoProofUrl: params.videoProofUrl?.trim() || undefined,
      integrityNotes: params.requiresManualVideoReview
        ? 'Clean 90s Ranked integrity log; queued for manual video proof verification.'
        : 'Verified automatically via native FCEUmm WRAM & frame counter.',
    };

    this.data.verifiedRecords.push(record);
    if (!params.requiresManualVideoReview && verifiedSplits.length > 0) {
      this.recordVerifiedStageSplits(game.gameId, verifiedSplits);
    } else {
      this.save();
    }
    return { ok: true, record };
  }

  /**
   * Returns strictly VERIFIED official leaderboard entries across all 5 boards
   * (Global, Country, Friends, Game-Wise, Speedrun/Challenge) with deterministic
   * tie-breaking. Never injects fake or seeded records.
   */
  public getOfficialLeaderboard(filter: {
    scope: 'global' | 'country' | 'friends' | 'game' | 'speedrun' | 'challenge';
    countryCode?: string;
    gameId?: string;
  }): VerifiedRunSubmission[] {
    const verifiedOnly = this.data.verifiedRecords.filter(
      (r) => r.verificationStatus === 'verified-native'
    );

    const activeProfile = this.getActiveProfile();
    const friendNamesLower = new Set(
      (activeProfile?.friends ?? []).map((f) => f.trim().toLowerCase())
    );
    if (activeProfile) {
      friendNamesLower.add(activeProfile.username.trim().toLowerCase());
    }

    const scoped = verifiedOnly.filter((r) => {
      if (filter.scope === 'country' && filter.countryCode) {
        return r.countryCode.toUpperCase() === filter.countryCode.toUpperCase();
      }
      if (filter.scope === 'friends') {
        if (!activeProfile) return false;
        return (
          r.playerId === activeProfile.playerId ||
          friendNamesLower.has(r.playerName.trim().toLowerCase())
        );
      }
      if (filter.scope === 'game' && filter.gameId) {
        return r.gameId === filter.gameId;
      }
      if (filter.scope === 'speedrun') {
        return r.boardType === 'speedrun-any' || r.boardType === 'speedrun-100';
      }
      if (filter.scope === 'challenge') {
        return r.boardType === 'challenge';
      }
      return true;
    });

    return [...scoped].sort((a, b) => {
      const aSpeed = a.boardType === 'speedrun-any' || a.boardType === 'speedrun-100';
      const bSpeed = b.boardType === 'speedrun-any' || b.boardType === 'speedrun-100';
      if (aSpeed && bSpeed) {
        return (
          a.frames - b.frames ||
          a.submittedAtMs - b.submittedAtMs ||
          a.recordId.localeCompare(b.recordId)
        );
      }
      return (
        b.score - a.score ||
        a.frames - b.frames ||
        a.submittedAtMs - b.submittedAtMs ||
        a.recordId.localeCompare(b.recordId)
      );
    });
  }

  /**
   * Returns the App Owner (TGK FOUNDER / CREATOR) spotlight ONLY when a real Founder
   * account exists AND has genuine verified achievements or verified official records.
   */
  public getFounderSpotlight(): {
    profile: PublicPlayerProfile;
    verifiedRecords: VerifiedRunSubmission[];
    unlockedCount: number;
  } | null {
    const founder = this.data.accounts.find((a) => a.isFounderCreator);
    if (!founder) return null;
    const verifiedRecords = this.data.verifiedRecords.filter(
      (r) => r.playerId === founder.playerId && r.verificationStatus === 'verified-native'
    );
    const unlockedCount = (this.data.unlockedByPlayer[founder.playerId] ?? []).filter(
      (u) => u.verifiedOfficial
    ).length;

    if (verifiedRecords.length === 0 && unlockedCount === 0) {
      return null;
    }

    return {
      profile: toPublicProfile(founder),
      verifiedRecords: [...verifiedRecords].sort(
        (a, b) => b.score - a.score || a.frames - b.frames || a.submittedAtMs - b.submittedAtMs
      ),
      unlockedCount,
    };
  }

  public listPendingVideoReviews(): VerifiedRunSubmission[] {
    return this.data.verifiedRecords
      .filter((r) => r.verificationStatus === 'pending-video-review')
      .sort((a, b) => b.submittedAtMs - a.submittedAtMs);
  }

  /**
   * Hall of Fame returns ONLY real player accounts with genuine verified achievements/records:
   * - Real accounts meeting the Platinum/3-Gold threshold
   * - The real App Owner (TGK FOUNDER / CREATOR) account featured at the TOP once they hold
   *   genuine verified achievements or verified official runs (zero fabricated records).
   */
  public getHallOfFame(): PublicPlayerProfile[] {
    const eligible = this.data.accounts.filter((a) => {
      const meetsLegendRule = a.trophies.platinum >= 1 || a.trophies.gold >= 3;
      if (meetsLegendRule) return true;
      if (!a.isFounderCreator) return false;
      const hasGenuineUnlock = (this.data.unlockedByPlayer[a.playerId] ?? []).some(
        (u) => u.verifiedOfficial
      );
      const hasGenuineRun = this.data.verifiedRecords.some(
        (r) => r.playerId === a.playerId && r.verificationStatus === 'verified-native'
      );
      return hasGenuineUnlock || hasGenuineRun;
    });

    return eligible.map(toPublicProfile).sort((a, b) => {
      if (a.isFounderCreator !== b.isFounderCreator) {
        return a.isFounderCreator ? -1 : 1;
      }
      return (
        b.trophies.platinum - a.trophies.platinum ||
        b.trophies.gold - a.trophies.gold ||
        b.xp - a.xp ||
        a.createdAtMs - b.createdAtMs
      );
    });
  }

  public listPublicProfiles(): PublicPlayerProfile[] {
    return this.data.accounts
      .map(toPublicProfile)
      .sort((a, b) => b.xp - a.xp || b.eloRating - a.eloRating || a.createdAtMs - b.createdAtMs);
  }

  public getTrophyTotals(playerId?: string): Record<TrophyTier, number> {
    const id = playerId ?? this.data.activePlayerId;
    const found = this.data.accounts.find((a) => a.playerId === id);
    if (!found) return { bronze: 0, silver: 0, gold: 0, platinum: 0 };
    return { ...found.trophies };
  }
}
