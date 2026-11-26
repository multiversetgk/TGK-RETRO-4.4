import { NES_TARGET_FPS } from '../core/INesEmulatorCore';
import {
  getAchievementsForGame,
  getGameStagePlan,
  getStageClearAchievementsForGame,
} from './achievementCatalog';
import type {
  AchievementDefinition,
  IntegrityFlag,
  IntegrityFlagCode,
  PlaySessionMode,
  RamConditionSpec,
  RunSessionIntegrityState,
  RunValidityStatus,
  StageSplitRecord,
  UnlockedAchievementRecord,
} from './types';

export const ALLOWED_OFFICIAL_CORE_IDS = new Set([
  'libretro-fceumm',
  'libretro-fceumm-android',
]);

export const MAX_OFFICIAL_PAUSES_PER_RUN = 12;

export function formatNesFramesToTime(frames: number): string {
  const safeFrames = Math.max(0, Math.floor(frames));
  const totalSeconds = safeFrames / NES_TARGET_FPS;
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  const hundredths = Math.floor((totalSeconds - Math.floor(totalSeconds)) * 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

/**
 * Formats an exact emulator frame count into MM:SS.mmm (millisecond precision)
 * for Stage-by-Stage Clear split timing and Official Speedrun records.
 */
export function formatNesFramesToSplitMs(frames: number): string {
  const safeFrames = Math.max(0, Math.floor(frames));
  const totalMs = Math.round((safeFrames / NES_TARGET_FPS) * 1000);
  const mins = Math.floor(totalMs / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function countBits(byte: number): number {
  let v = byte & 0xff;
  let c = 0;
  while (v > 0) {
    c += v & 1;
    v >>= 1;
  }
  return c;
}

function readSmb1Score(ram: Uint8Array): number {
  let score = 0;
  for (let addr = 0x07dd; addr <= 0x07e2; addr++) {
    const digit = Math.min(9, ram[addr] ?? 0);
    score = score * 10 + digit;
  }
  return score * 10;
}

function readSmb1LinearStage(ram: Uint8Array): number {
  const world = (ram[0x075f] ?? 0) & 0x07;
  const stage = (ram[0x075c] ?? 0) & 0x03;
  return world * 4 + stage + 1; // 1 = W1-1, 2 = W1-2, 5 = W2-1, 13 = W4-1, 32 = W8-4
}

function readContraScore(ram: Uint8Array): number {
  const lo = ram[0x07e2] ?? 0;
  const hi = ram[0x07e3] ?? 0;
  return ((hi << 8) | lo) * 100;
}

function evaluateRamCondition(
  cond: RamConditionSpec,
  ram: Uint8Array,
  session: RunSessionIntegrityState
): boolean {
  if (cond.requireNoDeath && session.deathsObserved > 0) {
    return false;
  }
  switch (cond.kind) {
    case 'smb1-world':
      return readSmb1LinearStage(ram) >= (cond.threshold ?? 2);
    case 'smb1-no-death-world':
      return session.deathsObserved === 0 && readSmb1LinearStage(ram) >= (cond.threshold ?? 2);
    case 'smb1-coins':
      return (ram[0x075e] ?? 0) >= (cond.threshold ?? 25);
    case 'smb1-score':
      return readSmb1Score(ram) >= (cond.threshold ?? 10000);
    case 'contra-stage':
      return (ram[0x0030] ?? 0) >= (cond.threshold ?? 1);
    case 'contra-no-death-stage':
      return session.deathsObserved === 0 && (ram[0x0030] ?? 0) >= (cond.threshold ?? 1);
    case 'contra-score':
      return readContraScore(ram) >= (cond.threshold ?? 10000);
    case 'ram-gte':
      return cond.address !== undefined && (ram[cond.address & 0x07ff] ?? 0) >= (cond.threshold ?? 1);
    case 'ram-eq':
      return cond.address !== undefined && (ram[cond.address & 0x07ff] ?? 0) === (cond.threshold ?? 0);
    case 'ram-bits-count':
      return (
        cond.address !== undefined &&
        countBits(ram[cond.address & 0x07ff] ?? 0) >= (cond.threshold ?? 1)
      );
    case 'frame-under-with-ram':
      return (
        cond.address !== undefined &&
        session.elapsedFrames > 0 &&
        session.elapsedFrames <= (cond.maxFrames ?? 5400) &&
        (ram[cond.address & 0x07ff] ?? 0) >= (cond.threshold ?? 1)
      );
    default:
      return false;
  }
}

/**
 * TGK RETRO 4.4 Strict 90s Arcade Rule Anti-Cheat, Stage-by-Stage Split Timer,
 * and Native FCEUmm WRAM Verification Engine.
 * - Uses native emulator frame counters + verified 2 KB NES WRAM ($0000-$07FF) rules.
 * - Official Ranked Mode immediately invalidates runs upon Save-State load, Rewind,
 *   Fast-Forward, Cheats/Turbo, excessive pauses, or unverified core.
 * - Records exact MM:SS.mmm stage-by-stage splits & UTC timestamps on verified stage clears.
 * - NEVER unlocks official achievements for pending/unverified games or invalidated runs.
 */
export class ChampionsVerificationEngine {
  private state: RunSessionIntegrityState;
  private lastLivesByte: number | null = null;
  private pauseStartedAtMs: number | null = null;
  private lastStageSplitFrame = 0;
  private unlockedInSession = new Set<string>();
  private clearedStageNumbers = new Set<number>();

  constructor(params: {
    mode: PlaySessionMode;
    coreId: string;
    coreVersion: string;
    gameId: string | null;
    romSha256: string | null;
    romName: string | null;
    nowMs?: number;
  }) {
    const now = params.nowMs ?? Date.now();
    const coreVerified = ALLOWED_OFFICIAL_CORE_IDS.has(params.coreId);
    const flags: IntegrityFlag[] = [];

    if (params.mode === 'practice') {
      flags.push({
        code: 'PRACTICE_MODE',
        timestampMs: now,
        detail: 'Practice Mode active: save-states & turbo permitted, but records are non-official.',
        disqualifiesOfficial: true,
      });
    }
    if (!coreVerified) {
      flags.push({
        code: 'UNVERIFIED_CORE',
        timestampMs: now,
        detail: `Core "${params.coreId}" is not an approved official FCEUmm build.`,
        disqualifiesOfficial: true,
      });
    }
    if (!params.gameId || !params.romSha256) {
      flags.push({
        code: 'ROM_UNIDENTIFIED',
        timestampMs: now,
        detail: 'Loaded .nes ROM is not matched to a verified 60-game NES Catalog entry.',
        disqualifiesOfficial: true,
      });
    }

    const officialEligible =
      params.mode === 'official-ranked' && flags.every((f) => !f.disqualifiesOfficial);
    const runValidityStatus: RunValidityStatus =
      params.mode === 'practice'
        ? 'PRACTICE'
        : officialEligible
          ? 'VALID_OFFICIAL'
          : 'INVALID_DISQUALIFIED';

    this.state = {
      sessionId: `run_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      mode: params.mode,
      runValidityStatus,
      coreId: params.coreId,
      coreVersion: params.coreVersion,
      coreVerified,
      gameId: params.gameId,
      romSha256: params.romSha256,
      romName: params.romName,
      startedAtMs: now,
      elapsedFrames: 0,
      pauseCount: 0,
      pausedDurationMs: 0,
      resetCount: 0,
      saveStateLoadCount: 0,
      rewindCount: 0,
      fastForwardFrames: 0,
      turboUsed: false,
      cheatsUsed: false,
      cheatDetected: false,
      deathsObserved: 0,
      highestStageCleared: 0,
      gameCompleted: false,
      stageSplits: [],
      flags,
      officialEligible,
    };
  }

  private addFlag(
    code: IntegrityFlagCode,
    detail: string,
    disqualifiesOfficial = true,
    nowMs = Date.now()
  ): void {
    if (!this.state.flags.some((f) => f.code === code)) {
      this.state.flags.push({
        code,
        timestampMs: nowMs,
        detail,
        disqualifiesOfficial,
      });
    }
    this.recomputeEligibility();
  }

  private recomputeEligibility(): void {
    const eligible =
      this.state.mode === 'official-ranked' &&
      this.state.coreVerified &&
      Boolean(this.state.gameId) &&
      Boolean(this.state.romSha256) &&
      this.state.flags.every((f) => !f.disqualifiesOfficial);

    this.state.officialEligible = eligible;
    if (this.state.mode === 'practice') {
      this.state.runValidityStatus = 'PRACTICE';
    } else if (eligible) {
      this.state.runValidityStatus = 'VALID_OFFICIAL';
    } else {
      this.state.runValidityStatus = 'INVALID_DISQUALIFIED';
    }
  }

  public getSnapshot(): RunSessionIntegrityState {
    return {
      ...this.state,
      stageSplits: this.state.stageSplits.map((s) => ({ ...s })),
      flags: [...this.state.flags],
    };
  }

  public recordFrameStep(frameDelta = 1): void {
    this.state.elapsedFrames += Math.max(0, Math.floor(frameDelta));
  }

  public recordPause(nowMs = Date.now()): void {
    this.state.pauseCount += 1;
    this.pauseStartedAtMs = nowMs;
    if (this.state.pauseCount > MAX_OFFICIAL_PAUSES_PER_RUN) {
      this.addFlag(
        'EXCESSIVE_PAUSE_ABUSE',
        `Pause count (${this.state.pauseCount}) exceeded Official Ranked limit (${MAX_OFFICIAL_PAUSES_PER_RUN}).`,
        true,
        nowMs
      );
    }
  }

  public recordResume(nowMs = Date.now()): void {
    if (this.pauseStartedAtMs !== null) {
      this.state.pausedDurationMs += Math.max(0, nowMs - this.pauseStartedAtMs);
      this.pauseStartedAtMs = null;
    }
  }

  public recordReset(resetElapsedFrames = true): void {
    this.state.resetCount += 1;
    this.lastLivesByte = null;
    if (resetElapsedFrames) {
      this.state.elapsedFrames = 0;
      this.state.deathsObserved = 0;
      this.state.highestStageCleared = 0;
      this.state.gameCompleted = false;
      this.state.stageSplits = [];
      this.lastStageSplitFrame = 0;
      this.clearedStageNumbers.clear();
    }
  }

  public recordSaveStateLoad(nowMs = Date.now()): void {
    this.state.saveStateLoadCount += 1;
    this.addFlag(
      'SAVE_STATE_USED',
      '90s Arcade Rule Violation: Save-state load immediately disqualified this Official Ranked run.',
      true,
      nowMs
    );
  }

  public recordRewind(nowMs = Date.now()): void {
    this.state.rewindCount += 1;
    this.addFlag(
      'REWIND_USED',
      '90s Arcade Rule Violation: Rewind immediately disqualified this Official Ranked run.',
      true,
      nowMs
    );
  }

  public recordFastForward(frames = 1, nowMs = Date.now()): void {
    this.state.fastForwardFrames += Math.max(1, frames);
    this.addFlag(
      'FAST_FORWARD_USED',
      '90s Arcade Rule Violation: Fast-forward speed boost immediately disqualified this Official Ranked run.',
      true,
      nowMs
    );
  }

  public recordCheatsEnabled(reason = 'Cheats Enabled', nowMs = Date.now()): void {
    this.state.cheatsUsed = true;
    this.state.cheatDetected = true;
    this.addFlag(
      'CHEATS_ENABLED',
      `90s Arcade Rule Violation: Cheats active (${reason}); Official Ranked run immediately disqualified.`,
      true,
      nowMs
    );
  }

  public recordTurboOrCheat(reason: string, nowMs = Date.now()): void {
    this.state.turboUsed = true;
    this.state.cheatDetected = true;
    this.addFlag(
      'TURBO_OR_CHEAT_ACTIVE',
      `Turbo/cheat event detected (${reason}); disqualified from Official Ranked verification.`,
      true,
      nowMs
    );
  }

  /**
   * Tracks real WRAM death/life-loss events on games with verified lives addresses.
   */
  private observeDeathsFromRam(gameId: string, ram: Uint8Array): void {
    let livesAddr: number | null = null;
    if (gameId === 'super-mario-bros') {
      if ((ram[0x000e] ?? 0) === 0x0b) {
        if (this.lastLivesByte !== -1) {
          this.state.deathsObserved += 1;
          this.lastLivesByte = -1;
        }
        return;
      }
      livesAddr = 0x075a;
    } else if (gameId === 'contra' || gameId === 'super-c') {
      livesAddr = 0x0032;
    } else if (gameId === 'mega-man-2') {
      livesAddr = 0x00a8;
    } else if (gameId === 'castlevania') {
      livesAddr = 0x002a;
    } else if (gameId === 'ninja-gaiden') {
      livesAddr = 0x0076;
    } else if (gameId === 'super-mario-bros-3') {
      livesAddr = 0x0736;
    } else if (gameId === 'kirbys-adventure') {
      livesAddr = 0x0594;
    } else if (gameId === 'ducktales') {
      livesAddr = 0x00c9;
    }

    if (livesAddr === null) return;
    const currentLives = ram[livesAddr] ?? 0;
    if (this.lastLivesByte !== null && this.lastLivesByte >= 0 && currentLives < this.lastLivesByte) {
      this.state.deathsObserved += 1;
    }
    this.lastLivesByte = currentLives;
  }

  /**
   * Evaluates a real 2 KB NES WRAM snapshot against:
   * 1. Verified 50-achievement blueprint rules
   * 2. Stage-by-Stage Clear (Stage 1..Final Stage) & Full Game Completion splits
   * Records exact MM:SS.mmm split timing & completion timestamps from the emulator frame counter.
   * Strictly enforces the 90s Arcade Rule: invalidated or Practice runs NEVER unlock official records.
   */
  public evaluateRamSnapshot(
    ram2048: Uint8Array,
    alreadyUnlockedIds: Set<string> = new Set(),
    nowMs = Date.now()
  ): {
    newlyUnlocked: UnlockedAchievementRecord[];
    newStageSplits: StageSplitRecord[];
    blockedByIntegrity: AchievementDefinition[];
  } {
    if (!this.state.gameId || ram2048.length < 2048) {
      return { newlyUnlocked: [], newStageSplits: [], blockedByIntegrity: [] };
    }

    this.observeDeathsFromRam(this.state.gameId, ram2048);

    const newlyUnlocked: UnlockedAchievementRecord[] = [];
    const newStageSplits: StageSplitRecord[] = [];
    const blockedByIntegrity: AchievementDefinition[] = [];

    // 1. Evaluate Stage-by-Stage Clear progression & exact MM:SS.mmm split timing
    const stagePlan = getGameStagePlan(this.state.gameId);
    for (const stage of stagePlan) {
      if (!stage.ramCondition || this.clearedStageNumbers.has(stage.stageNumber)) {
        continue;
      }
      if (!evaluateRamCondition(stage.ramCondition, ram2048, this.state)) {
        continue;
      }

      this.clearedStageNumbers.add(stage.stageNumber);
      const cumulativeFrames = this.state.elapsedFrames;
      const splitFrames = Math.max(0, cumulativeFrames - this.lastStageSplitFrame);
      this.lastStageSplitFrame = cumulativeFrames;

      const splitRecord: StageSplitRecord = {
        stageNumber: stage.stageNumber,
        stageLabel: stage.stageLabel,
        isFinalStage: stage.isFinalStage,
        splitFrames,
        cumulativeFrames,
        splitTimeMs: formatNesFramesToSplitMs(splitFrames),
        cumulativeTimeMs: formatNesFramesToSplitMs(cumulativeFrames),
        completedAtMs: nowMs,
        verifiedOfficial: this.state.officialEligible,
      };
      this.state.stageSplits.push(splitRecord);
      newStageSplits.push(splitRecord);
      if (stage.stageNumber > this.state.highestStageCleared) {
        this.state.highestStageCleared = stage.stageNumber;
      }
      if (stage.isFinalStage) {
        this.state.gameCompleted = true;
      }
    }

    // 2. Evaluate all verified achievement rules (50-blueprint + Stage-by-Stage Clear + Game Completion)
    const allDefs = [
      ...getAchievementsForGame(this.state.gameId),
      ...getStageClearAchievementsForGame(this.state.gameId),
    ];

    for (const def of allDefs) {
      if (!def.autoUnlockEnabled || !def.ramCondition) continue;
      if (alreadyUnlockedIds.has(def.achievementId) || this.unlockedInSession.has(def.achievementId)) {
        continue;
      }

      const conditionMet = evaluateRamCondition(def.ramCondition, ram2048, this.state);
      if (!conditionMet) continue;

      if (!this.state.officialEligible) {
        blockedByIntegrity.push(def);
        continue;
      }

      this.unlockedInSession.add(def.achievementId);
      const matchingSplit =
        def.stageNumber !== undefined
          ? this.state.stageSplits.find((s) => s.stageNumber === def.stageNumber)
          : undefined;

      newlyUnlocked.push({
        achievementId: def.achievementId,
        gameId: def.gameId,
        trophyTier: def.trophyTier,
        xpAwarded: def.xpReward,
        unlockedAtMs: nowMs,
        frameCount: this.state.elapsedFrames,
        splitTimeMs: matchingSplit?.splitTimeMs ?? formatNesFramesToSplitMs(this.state.elapsedFrames),
        stageNumber: def.stageNumber,
        mode: this.state.mode,
        verifiedOfficial: true,
        verificationMethod: def.verificationMethod,
        romSha256: this.state.romSha256 ?? '',
        coreVersion: this.state.coreVersion,
      });
    }

    return { newlyUnlocked, newStageSplits, blockedByIntegrity };
  }
}
