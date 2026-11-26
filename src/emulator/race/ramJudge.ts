import type { INesEmulatorCore } from '../core/INesEmulatorCore';
import type { PlayerPort } from '../netplay/protocol';

export type RaceMatchMode = 'score-attack' | 'first-to-stage' | 'survival-1life';

export type RaceHandicapMode =
  | 'none'
  | 'p1-minus-1-life'
  | 'p2-minus-1-life'
  | 'p1-plus-500'
  | 'p2-plus-500';

export type RaceAudioFocus = 'p1' | 'p2' | 'mute';

export type RamProfileId = 'smb1-nes' | 'generic-fallback';

export interface RamProfileDefinition {
  id: RamProfileId;
  label: string;
  isRamMapped: boolean;
  description: string;
  readTelemetry: (readByte: (addr: number) => number) => PlayerTelemetry;
}

export interface PlayerTelemetry {
  score: number;
  coins: number;
  lives: number;
  world: number;
  stage: number;
  flagpoleReached: boolean;
  isRamMapped: boolean;
  /** Elapsed survival seconds (always populated, used for fallback & tie-breakers). */
  survivalSeconds: number;
}

export interface RaceMatchConfig {
  mode: RaceMatchMode;
  /** Countdown duration in seconds for Score Attack (e.g. 60, 120, 180). */
  durationSeconds: number;
  /** Target stage index for First to Stage/Flagpole (e.g. 2 = Stage 2 / World 1-2). */
  targetStage: number;
  /** Optional early-win score target for Score Attack / Fair Play (0 = timer only). */
  targetScore: number;
  handicap: RaceHandicapMode;
  chaosEnabled: boolean;
  p1Name: string;
  p2Name: string;
  rivalId: string | null;
}

export interface ManualJudgeOverrides {
  p1BonusScore: number;
  p2BonusScore: number;
  p1StageBonus: number;
  p2StageBonus: number;
  p1ManualEliminated: boolean;
  p2ManualEliminated: boolean;
  manualWinner: PlayerPort | 'draw' | null;
  manualReason: string | null;
}

export interface RaceEvaluation {
  leader: PlayerPort | 'tie';
  leadMetricLabel: string;
  p1EffectiveScore: number;
  p2EffectiveScore: number;
  p1EffectiveLives: number;
  p2EffectiveLives: number;
  p1StageProgress: number;
  p2StageProgress: number;
  remainingSeconds: number;
  finished: boolean;
  winner: PlayerPort | 'draw' | null;
  winReason: string | null;
}

export const DEFAULT_RACE_CONFIG: RaceMatchConfig = {
  mode: 'score-attack',
  durationSeconds: 120,
  targetStage: 2,
  targetScore: 0,
  handicap: 'none',
  chaosEnabled: false,
  p1Name: 'Player 1',
  p2Name: 'Rival P2',
  rivalId: null,
};

export function createEmptyManualOverrides(): ManualJudgeOverrides {
  return {
    p1BonusScore: 0,
    p2BonusScore: 0,
    p1StageBonus: 0,
    p2StageBonus: 0,
    p1ManualEliminated: false,
    p2ManualEliminated: false,
    manualWinner: null,
    manualReason: null,
  };
}

export function createEmptyTelemetry(isRamMapped: boolean): PlayerTelemetry {
  return {
    score: 0,
    coins: 0,
    lives: 3,
    world: 1,
    stage: 1,
    flagpoleReached: false,
    isRamMapped,
    survivalSeconds: 0,
  };
}

/**
 * Known NES RAM profiles:
 * - Super Mario Bros. (NES): standard 2KB RAM addresses ($07DD-$07E2 score digits, $075E coins, $075A lives, $075F world, $075C stage, $000E/$001D flagpole state)
 * - Generic Fallback: works on EVERY unmapped .nes ROM via Timer / Survival / Manual Judge
 */
export const RAM_PROFILES: Record<RamProfileId, RamProfileDefinition> = {
  'smb1-nes': {
    id: 'smb1-nes',
    label: 'Super Mario Bros. (NES RAM)',
    isRamMapped: true,
    description: 'Reads Score ($07DD-$07E2), Coins ($075E), Lives ($075A), World-Stage ($075F/$075C)',
    readTelemetry: (readByte) => {
      // SMB1 stores 6 individual decimal digits at $07DD..$07E2 (multiplied by 10 for displayed score)
      let rawScore = 0;
      for (let addr = 0x07dd; addr <= 0x07e2; addr++) {
        const digit = Math.min(9, readByte(addr) & 0x0f);
        rawScore = rawScore * 10 + digit;
      }
      const score = rawScore * 10;
      const coins = readByte(0x075e);
      const livesRaw = readByte(0x075a);
      // SMB1 stores lives as N-1 (0xFF on game over)
      const lives = livesRaw === 0xff ? 0 : Math.min(99, livesRaw + 1);
      const world = (readByte(0x075f) & 0x07) + 1;
      const stage = (readByte(0x075c) & 0x03) + 1;
      const playerState = readByte(0x000e);
      const floatState = readByte(0x001d);
      const flagpoleReached = playerState === 0x04 || floatState === 0x03;

      return {
        score,
        coins,
        lives,
        world,
        stage,
        flagpoleReached,
        isRamMapped: true,
        survivalSeconds: 0,
      };
    },
  },
  'generic-fallback': {
    id: 'generic-fallback',
    label: 'Universal Fallback (Timer / Manual Judge)',
    isRamMapped: false,
    description: 'Works on every .nes ROM using Match Timer, Survival tracking, and Manual Judge controls',
    readTelemetry: () => createEmptyTelemetry(false),
  },
};

/**
 * Automatically selects the best NES RAM profile from ROM filename/title.
 * Any unrecognized .nes ROM cleanly falls back to `generic-fallback` so VS Race never breaks.
 */
export function resolveRamProfile(romName: string): RamProfileDefinition {
  const lower = (romName || '').toLowerCase();
  if (
    lower.includes('mario') ||
    lower.includes('smb1') ||
    lower.includes('smb ') ||
    lower.includes('smb.')
  ) {
    return RAM_PROFILES['smb1-nes'];
  }
  return RAM_PROFILES['generic-fallback'];
}

export function readCoreTelemetry(
  core: INesEmulatorCore | null,
  profile: RamProfileDefinition,
  survivalSeconds: number
): PlayerTelemetry {
  if (!core || !core.hasRomLoaded() || !profile.isRamMapped || !core.readRamByte) {
    return {
      ...createEmptyTelemetry(false),
      survivalSeconds,
    };
  }
  const data = profile.readTelemetry((addr) => core.readRamByte!(addr));
  return {
    ...data,
    survivalSeconds,
  };
}

export function computeStageProgress(t: PlayerTelemetry, stageBonus = 0): number {
  const base = Math.max(1, (t.world - 1) * 4 + t.stage + stageBonus);
  return base;
}

/**
 * Pure, deterministic VS Match Judge:
 * Determines who is currently "AHEAD 🔥" and detects match completion & Winner across:
 * 1. Score Attack (Timer + optional Score Target + Handicap)
 * 2. First to Stage / Flagpole
 * 3. 1-Life Survival (with optional 1-life Handicap)
 * 4. Universal Fallback / Manual Judge overrides for unmapped ROMs
 */
export function evaluateRaceMatch(params: {
  config: RaceMatchConfig;
  p1: PlayerTelemetry;
  p2: PlayerTelemetry;
  p1BaselineLives: number;
  p2BaselineLives: number;
  elapsedSeconds: number;
  manual: ManualJudgeOverrides;
}): RaceEvaluation {
  const { config, p1, p2, p1BaselineLives, p2BaselineLives, elapsedSeconds, manual } = params;

  const p1HandicapScore = config.handicap === 'p1-plus-500' ? 500 : 0;
  const p2HandicapScore = config.handicap === 'p2-plus-500' ? 500 : 0;

  const p1EffectiveScore = Math.max(0, p1.score + p1HandicapScore + manual.p1BonusScore);
  const p2EffectiveScore = Math.max(0, p2.score + p2HandicapScore + manual.p2BonusScore);

  // Handicap life adjustment (1-life handicap means player loses after dropping fewer lives)
  const p1LifePenalty = config.handicap === 'p1-minus-1-life' ? 1 : 0;
  const p2LifePenalty = config.handicap === 'p2-minus-1-life' ? 1 : 0;

  const p1EffectiveLives = manual.p1ManualEliminated
    ? 0
    : Math.max(0, p1.lives - p1LifePenalty);
  const p2EffectiveLives = manual.p2ManualEliminated
    ? 0
    : Math.max(0, p2.lives - p2LifePenalty);

  const p1StageProgress = computeStageProgress(p1, manual.p1StageBonus);
  const p2StageProgress = computeStageProgress(p2, manual.p2StageBonus);

  const remainingSeconds =
    config.mode === 'score-attack'
      ? Math.max(0, Math.ceil(config.durationSeconds - elapsedSeconds))
      : Math.floor(elapsedSeconds);

  // 0. Explicit Manual Judge Winner (always honored immediately)
  if (manual.manualWinner) {
    return {
      leader: manual.manualWinner === 'draw' ? 'tie' : manual.manualWinner,
      leadMetricLabel: manual.manualReason || 'Manual Judge Decision',
      p1EffectiveScore,
      p2EffectiveScore,
      p1EffectiveLives,
      p2EffectiveLives,
      p1StageProgress,
      p2StageProgress,
      remainingSeconds,
      finished: true,
      winner: manual.manualWinner,
      winReason: manual.manualReason || 'Declared by Match Judge',
    };
  }

  // 1. Score Attack Mode
  if (config.mode === 'score-attack') {
    const leader: PlayerPort | 'tie' =
      p1EffectiveScore > p2EffectiveScore
        ? 1
        : p2EffectiveScore > p1EffectiveScore
          ? 2
          : p1.coins > p2.coins
            ? 1
            : p2.coins > p1.coins
              ? 2
              : 'tie';

    const diff = Math.abs(p1EffectiveScore - p2EffectiveScore);
    const leadMetricLabel =
      leader === 'tie' ? 'Neck & Neck' : `+${diff.toLocaleString()} pts`;

    // Check optional Score Target early win
    if (config.targetScore > 0) {
      const p1Hit = p1EffectiveScore >= config.targetScore;
      const p2Hit = p2EffectiveScore >= config.targetScore;
      if (p1Hit || p2Hit) {
        const winner: PlayerPort | 'draw' =
          p1Hit && p2Hit ? (leader === 'tie' ? 'draw' : leader) : p1Hit ? 1 : 2;
        return {
          leader,
          leadMetricLabel,
          p1EffectiveScore,
          p2EffectiveScore,
          p1EffectiveLives,
          p2EffectiveLives,
          p1StageProgress,
          p2StageProgress,
          remainingSeconds,
          finished: true,
          winner,
          winReason: `Reached ${config.targetScore.toLocaleString()} Target Score (${p1EffectiveScore.toLocaleString()} vs ${p2EffectiveScore.toLocaleString()})`,
        };
      }
    }

    // Check Timer Expiry
    if (elapsedSeconds >= config.durationSeconds) {
      const winner: PlayerPort | 'draw' = leader === 'tie' ? 'draw' : leader;
      return {
        leader,
        leadMetricLabel,
        p1EffectiveScore,
        p2EffectiveScore,
        p1EffectiveLives,
        p2EffectiveLives,
        p1StageProgress,
        p2StageProgress,
        remainingSeconds: 0,
        finished: true,
        winner,
        winReason:
          winner === 'draw'
            ? `Time Up — Tied at ${p1EffectiveScore.toLocaleString()} pts`
            : `Score Attack Time Up (${p1EffectiveScore.toLocaleString()} vs ${p2EffectiveScore.toLocaleString()})`,
      };
    }

    return {
      leader,
      leadMetricLabel,
      p1EffectiveScore,
      p2EffectiveScore,
      p1EffectiveLives,
      p2EffectiveLives,
      p1StageProgress,
      p2StageProgress,
      remainingSeconds,
      finished: false,
      winner: null,
      winReason: null,
    };
  }

  // 2. First to Stage / Flagpole Mode
  if (config.mode === 'first-to-stage') {
    const p1Done = p1StageProgress >= config.targetStage || p1.flagpoleReached;
    const p2Done = p2StageProgress >= config.targetStage || p2.flagpoleReached;

    const leader: PlayerPort | 'tie' =
      p1StageProgress > p2StageProgress
        ? 1
        : p2StageProgress > p1StageProgress
          ? 2
          : p1EffectiveScore > p2EffectiveScore
            ? 1
            : p2EffectiveScore > p1EffectiveScore
              ? 2
              : 'tie';

    const leadMetricLabel =
      leader === 'tie'
        ? `Stage ${p1StageProgress}`
        : `Stage ${leader === 1 ? p1StageProgress : p2StageProgress}`;

    if (p1Done || p2Done) {
      const winner: PlayerPort | 'draw' =
        p1Done && p2Done ? (leader === 'tie' ? 'draw' : leader) : p1Done ? 1 : 2;
      return {
        leader,
        leadMetricLabel,
        p1EffectiveScore,
        p2EffectiveScore,
        p1EffectiveLives,
        p2EffectiveLives,
        p1StageProgress,
        p2StageProgress,
        remainingSeconds,
        finished: true,
        winner,
        winReason:
          winner === 'draw'
            ? `Photo Finish at Stage ${config.targetStage}!`
            : `First to Flagpole / Stage ${config.targetStage}!`,
      };
    }

    return {
      leader,
      leadMetricLabel,
      p1EffectiveScore,
      p2EffectiveScore,
      p1EffectiveLives,
      p2EffectiveLives,
      p1StageProgress,
      p2StageProgress,
      remainingSeconds,
      finished: false,
      winner: null,
      winReason: null,
    };
  }

  // 3. 1-Life Survival Mode
  // A player is eliminated as soon as they lose 1 life relative to baseline (or drop to 0, or manual KO).
  // If a player has a 1-life handicap, losing even 1 life eliminates them while opponent gets +1 grace life.
  const p1LostLives = Math.max(0, p1BaselineLives - p1.lives);
  const p2LostLives = Math.max(0, p2BaselineLives - p2.lives);
  const p1AllowedLosses = config.handicap === 'p2-minus-1-life' ? 2 : 1;
  const p2AllowedLosses = config.handicap === 'p1-minus-1-life' ? 2 : 1;

  const p1Dead =
    manual.p1ManualEliminated ||
    (p1.isRamMapped && (p1LostLives >= p1AllowedLosses || p1.lives <= 0));
  const p2Dead =
    manual.p2ManualEliminated ||
    (p2.isRamMapped && (p2LostLives >= p2AllowedLosses || p2.lives <= 0));

  const leader: PlayerPort | 'tie' =
    p1Dead && !p2Dead
      ? 2
      : p2Dead && !p1Dead
        ? 1
        : p1EffectiveLives > p2EffectiveLives
          ? 1
          : p2EffectiveLives > p1EffectiveLives
            ? 2
            : p1EffectiveScore > p2EffectiveScore
              ? 1
              : p2EffectiveScore > p1EffectiveScore
                ? 2
                : 'tie';

  const leadMetricLabel =
    leader === 'tie' ? 'Both Alive' : `${leader === 1 ? p1EffectiveLives : p2EffectiveLives} Lives`;

  if (p1Dead || p2Dead) {
    const winner: PlayerPort | 'draw' = p1Dead && p2Dead ? 'draw' : p1Dead ? 2 : 1;
    return {
      leader,
      leadMetricLabel,
      p1EffectiveScore,
      p2EffectiveScore,
      p1EffectiveLives,
      p2EffectiveLives,
      p1StageProgress,
      p2StageProgress,
      remainingSeconds,
      finished: true,
      winner,
      winReason:
        winner === 'draw'
          ? 'Double Knockout in 1-Life Survival!'
          : `1-Life Survival Winner (${Math.floor(elapsedSeconds)}s lasted)`,
    };
  }

  return {
    leader,
    leadMetricLabel,
    p1EffectiveScore,
    p2EffectiveScore,
    p1EffectiveLives,
    p2EffectiveLives,
    p1StageProgress,
    p2StageProgress,
    remainingSeconds,
    finished: false,
    winner: null,
    winReason: null,
  };
}

export function formatRaceClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
