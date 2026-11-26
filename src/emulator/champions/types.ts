export type NesRegion = 'USA' | 'JPN' | 'EUR';

export type NesGenre =
  | 'Run & Gun'
  | 'Action Platformer'
  | 'Platformer'
  | 'Action Adventure'
  | 'Beat \'em Up'
  | 'Shoot \'em Up'
  | 'Puzzle'
  | 'Sports & Racing';

export type CompatibilityTier =
  | 'verified-ram-hooks'
  | 'partial-hooks-review'
  | 'pending-community-review';

export type TrophyTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export type AchievementDifficulty = 'Beginner' | 'Skilled' | 'Advanced' | 'Elite';

export type AchievementCategory =
  | 'Game Completion'
  | '100% Completion'
  | 'No Death Run'
  | 'No Hit Run'
  | 'No Continue Run'
  | '1CC'
  | 'Speedrun Any%'
  | 'Speedrun 100%'
  | 'Stage Speedrun'
  | 'Boss Master'
  | 'Weapon Master'
  | 'No Upgrade Challenge'
  | 'High Score'
  | 'Survival Challenge'
  | 'Secret Hunter'
  | 'Collectibles'
  | 'Perfect Run'
  | 'Marathon Challenge'
  | 'Special Game-Specific Challenges';

export type VerificationMethod =
  | 'native-ram-hook'
  | 'frame-timed-core-event'
  | 'video-proof-manual-review';

export type AchievementCompatibilityStatus =
  | 'active-verified'
  | 'manual-review-only'
  | 'pending-ram-hooks';

export type PlaySessionMode = 'official-ranked' | 'practice';

export type RunValidityStatus = 'VALID_OFFICIAL' | 'INVALID_DISQUALIFIED' | 'PRACTICE';

export type RankTierId =
  | 'rookie'
  | 'arcade-challenger'
  | 'retro-contender'
  | '8bit-veteran'
  | 'nes-master'
  | 'grand-champion'
  | 'tgk-legend';

export interface RankTierInfo {
  id: RankTierId;
  name: string;
  minXp: number;
  nextTierXp: number | null;
  colorHex: string;
}

export interface StageBlueprintSpec {
  stageNumber: number;
  stageLabel: string;
  isFinalStage: boolean;
  ramCondition?: RamConditionSpec;
}

export interface StageSplitRecord {
  stageNumber: number;
  stageLabel: string;
  isFinalStage: boolean;
  splitFrames: number;
  cumulativeFrames: number;
  /** Exact stage split duration formatted as MM:SS.mmm from emulator frame counter. */
  splitTimeMs: string;
  /** Exact cumulative run duration formatted as MM:SS.mmm from emulator frame counter. */
  cumulativeTimeMs: string;
  completedAtMs: number;
  verifiedOfficial: boolean;
}

export interface NesRomVariantSpec {
  variantId: string;
  label: string;
  region: NesRegion;
  revision: string;
  mapperName: string;
  expectedPrgKb?: number;
  /** Optional known SHA-256 / CRC32 hashes of legitimate user dumps (never includes ROM data). */
  knownSha256?: string[];
  knownCrc32?: string[];
  /** Canonical normalized filename patterns for non-hash identification fallback (clearly labeled). */
  filenamePatterns: string[];
}

export interface CoverArtworkTheme {
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  monogram: string;
  motif: 'visor' | 'blade' | 'crown' | 'star' | 'shield' | 'bolt' | 'fist' | 'ship';
}

export interface NesRamHookSummary {
  hasVerifiedRamMap: boolean;
  addresses: string[];
  notes: string;
}

export interface NesCatalogGame {
  catalogNumber: number;
  gameId: string;
  console: 'NES';
  title: string;
  releaseYear: number;
  publisher: string;
  genre: NesGenre;
  regions: NesRegion[];
  supportedVariants: NesRomVariantSpec[];
  coverTheme: CoverArtworkTheme;
  compatibilityTier: CompatibilityTier;
  ramHookSummary: NesRamHookSummary;
  targetAchievementCount: number;
  activeVerifiedAchievements: number;
  manualReviewAchievements: number;
  pendingHookAchievements: number;
}

export interface LocalRomMatchResult {
  game: NesCatalogGame;
  installed: boolean;
  matchedUserRomId: string | null;
  matchedFileName: string | null;
  matchedVariantLabel: string | null;
  matchConfidence: 'none' | 'sha256-exact' | 'crc32-exact' | 'filename-ines-header';
}

export interface CompatibilityMatrixRow {
  catalogNumber: number;
  gameId: string;
  title: string;
  genre: NesGenre;
  compatibilityTier: CompatibilityTier;
  ramHooksVerified: boolean;
  activeAutoRules: number;
  manualReviewRules: number;
  pendingRules: number;
  totalTargetRules: number;
  ramAddresses: string[];
  notes: string;
}

export interface RamConditionSpec {
  kind:
    | 'smb1-world'
    | 'smb1-coins'
    | 'smb1-score'
    | 'smb1-no-death-world'
    | 'contra-stage'
    | 'contra-score'
    | 'contra-no-death-stage'
    | 'ram-gte'
    | 'ram-eq'
    | 'ram-bits-count'
    | 'frame-under-with-ram';
  address?: number;
  threshold?: number;
  maxFrames?: number;
  requireNoDeath?: boolean;
}

export interface AchievementDefinition {
  achievementId: string;
  gameId: string;
  supportedVersion: string;
  category: AchievementCategory;
  name: string;
  description: string;
  difficulty: AchievementDifficulty;
  trophyTier: TrophyTier;
  xpReward: number;
  exactConditions: string;
  verificationMethod: VerificationMethod;
  compatibilityStatus: AchievementCompatibilityStatus;
  requiresVideoProof: boolean;
  requiresManualReview: boolean;
  autoUnlockEnabled: boolean;
  ramCondition?: RamConditionSpec;
  stageNumber?: number;
  isFinalStage?: boolean;
}

export type IntegrityFlagCode =
  | 'PRACTICE_MODE'
  | 'SAVE_STATE_USED'
  | 'REWIND_USED'
  | 'FAST_FORWARD_USED'
  | 'CHEATS_ENABLED'
  | 'TURBO_OR_CHEAT_ACTIVE'
  | 'UNVERIFIED_CORE'
  | 'EXCESSIVE_PAUSE_ABUSE'
  | 'ROM_UNIDENTIFIED';

export interface IntegrityFlag {
  code: IntegrityFlagCode;
  timestampMs: number;
  detail: string;
  disqualifiesOfficial: boolean;
}

export interface RunSessionIntegrityState {
  sessionId: string;
  mode: PlaySessionMode;
  runValidityStatus: RunValidityStatus;
  coreId: string;
  coreVersion: string;
  coreVerified: boolean;
  gameId: string | null;
  romSha256: string | null;
  romName: string | null;
  startedAtMs: number;
  elapsedFrames: number;
  pauseCount: number;
  pausedDurationMs: number;
  resetCount: number;
  saveStateLoadCount: number;
  rewindCount: number;
  fastForwardFrames: number;
  turboUsed: boolean;
  cheatsUsed: boolean;
  cheatDetected: boolean;
  deathsObserved: number;
  highestStageCleared: number;
  gameCompleted: boolean;
  stageSplits: StageSplitRecord[];
  flags: IntegrityFlag[];
  officialEligible: boolean;
}

export interface UnlockedAchievementRecord {
  achievementId: string;
  gameId: string;
  trophyTier: TrophyTier;
  xpAwarded: number;
  unlockedAtMs: number;
  frameCount: number;
  /** Exact split time (MM:SS.mmm) recorded from emulator frame counter. */
  splitTimeMs?: string;
  stageNumber?: number;
  mode: PlaySessionMode;
  verifiedOfficial: boolean;
  verificationMethod: VerificationMethod;
  romSha256: string;
  coreVersion: string;
}

export interface VerifiedRunSubmission {
  recordId: string;
  playerId: string;
  playerName: string;
  countryCode: string;
  isFounderCreator?: boolean;
  founderBadgeLabel?: string;
  rankTierName?: string;
  eloRating?: number;
  gameId: string;
  gameTitle: string;
  boardType: 'speedrun-any' | 'speedrun-100' | 'high-score' | 'challenge';
  categoryLabel: string;
  frames: number;
  timeSeconds: number;
  exactTimeMs?: string;
  score: number;
  stageSplits?: StageSplitRecord[];
  submittedAtMs: number;
  romSha256: string;
  coreVersion: string;
  verificationStatus: 'verified-native' | 'pending-video-review' | 'rejected-flagged';
  videoProofUrl?: string;
  integrityNotes: string;
}

export interface PublicPlayerProfile {
  playerId: string;
  username: string;
  countryCode: string;
  avatarId: string;
  authMethod: 'username-password' | 'google-pending-config';
  xp: number;
  level: number;
  nextLevelXp: number;
  rankTier: RankTierInfo;
  eloRating: number;
  peakElo: number;
  vsWins: number;
  vsLosses: number;
  vsDraws: number;
  friends: string[];
  isFounderCreator: boolean;
  founderBadgeLabel?: 'TGK FOUNDER / CREATOR';
  trophies: Record<TrophyTier, number>;
  createdAtMs: number;
  cloudSyncConfigured: boolean;
}

export interface StoredPlayerAccount extends PublicPlayerProfile {
  /** Salted SHA-256 hash stored locally only; stripped from PublicPlayerProfile exports. */
  passwordHashHex: string;
  passwordSalt: string;
}

export interface GamePersonalStats {
  gameId: string;
  sessionsPlayed: number;
  totalFramesPlayed: number;
  officialRunsCompleted: number;
  practiceRunsPlayed: number;
  bestScore: number;
  bestSpeedrunFrames: number | null;
  bestStageSplits?: StageSplitRecord[];
  lastPlayedAtMs: number;
}
