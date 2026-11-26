package com.tgk.testemulators.race

import kotlin.math.max
import kotlin.random.Random

enum class RaceMatchMode(val id: String) {
    SCORE_ATTACK("score-attack"),
    FIRST_TO_STAGE("first-to-stage"),
    SURVIVAL_1LIFE("survival-1life")
}

enum class RaceHandicapMode(val id: String) {
    NONE("none"),
    P1_MINUS_1_LIFE("p1-minus-1-life"),
    P2_MINUS_1_LIFE("p2-minus-1-life"),
    P1_PLUS_500("p1-plus-500"),
    P2_PLUS_500("p2-plus-500")
}

enum class RaceAudioFocus(val id: String) {
    P1("p1"),
    P2("p2"),
    MUTE("mute")
}

enum class ChaosTwistType(val id: String, val label: String) {
    SCREEN_SWAP("screen-swap", "SCREEN SWAP"),
    AUDIO_FLIP("audio-flip", "AUDIO FLIP"),
    TURBO_PULSE("turbo-pulse", "TURBO PULSE")
}

data class PlayerTelemetry(
    val score: Int,
    val coins: Int,
    val lives: Int,
    val world: Int,
    val stage: Int,
    val flagpoleCleared: Boolean,
    val survivedSeconds: Double,
    val hasRamMapping: Boolean
)

data class RaceMatchConfig(
    val mode: RaceMatchMode = RaceMatchMode.SCORE_ATTACK,
    val durationSeconds: Int = 90,
    val targetStage: Int = 2,
    val targetScore: Int = 0,
    val handicap: RaceHandicapMode = RaceHandicapMode.NONE,
    val chaosEnabled: Boolean = false,
    val rivalId: String? = null
)

data class RaceEvaluation(
    val leader: Int?, // 1 = P1, 2 = P2, null = tied
    val p1EffectiveScore: Int,
    val p2EffectiveScore: Int,
    val p1LivesRemaining: Int,
    val p2LivesRemaining: Int,
    val remainingSeconds: Double,
    val finished: Boolean,
    val winner: Int?, // 1, 2, 0 = draw, null = ongoing
    val reason: String
)

/**
 * Pure Kotlin Dual-Screen 1-Player VS Race Judge & RAM Decoder.
 * Supports Super Mario Bros. ($07DD-$07E2, $075E, $075A, $075F/$075C),
 * TGK 6502 built-in ROMs ($0010-$0015), and universal Timer/Survival/Manual fallback.
 */
object DualRaceJudge {

    fun decodeSmb1Telemetry(ram: ByteArray, elapsedSeconds: Double): PlayerTelemetry {
        fun u8(addr: Int): Int = if (addr in ram.indices) ram[addr].toInt() and 0xFF else 0
        var score = 0
        for (offset in 0..5) {
            val digit = u8(0x07DD + offset).coerceIn(0, 9)
            score = score * 10 + digit
        }
        score *= 10
        val coins = u8(0x075E)
        val rawLives = u8(0x075A)
        val lives = if (rawLives > 99) 0 else rawLives + 1
        val world = (u8(0x075F) and 0x07) + 1
        val stage = (u8(0x075C) and 0x07) + 1
        val playerState = u8(0x000E)
        return PlayerTelemetry(
            score = score,
            coins = coins,
            lives = lives,
            world = world,
            stage = stage,
            flagpoleCleared = playerState == 0x04 || playerState == 0x05,
            survivedSeconds = elapsedSeconds,
            hasRamMapping = true
        )
    }

    fun decodeTgkCoinSprintTelemetry(ram: ByteArray, elapsedSeconds: Double): PlayerTelemetry {
        fun u8(addr: Int): Int = if (addr in ram.indices) ram[addr].toInt() and 0xFF else 0
        val score = (u8(0x0010) + (u8(0x0011) shl 8)) * 10
        return PlayerTelemetry(
            score = score,
            coins = u8(0x0012),
            lives = max(0, u8(0x0013)),
            world = 1,
            stage = max(1, u8(0x0014)),
            flagpoleCleared = u8(0x0015) > 0,
            survivedSeconds = elapsedSeconds,
            hasRamMapping = true
        )
    }

    fun evaluate(
        config: RaceMatchConfig,
        p1: PlayerTelemetry,
        p2: PlayerTelemetry,
        p1BaselineLives: Int,
        p2BaselineLives: Int,
        elapsedSeconds: Double,
        manualWinner: Int? = null
    ): RaceEvaluation {
        val p1Bonus = if (config.handicap == RaceHandicapMode.P1_PLUS_500) 500 else 0
        val p2Bonus = if (config.handicap == RaceHandicapMode.P2_PLUS_500) 500 else 0
        val p1Score = p1.score + p1Bonus
        val p2Score = p2.score + p2Bonus

        val p1LifePenalty = if (config.handicap == RaceHandicapMode.P1_MINUS_1_LIFE) 1 else 0
        val p2LifePenalty = if (config.handicap == RaceHandicapMode.P2_MINUS_1_LIFE) 1 else 0
        val p1Lives = max(0, p1.lives - p1LifePenalty)
        val p2Lives = max(0, p2.lives - p2LifePenalty)
        val remaining = max(0.0, config.durationSeconds - elapsedSeconds)

        if (manualWinner != null) {
            return RaceEvaluation(
                leader = if (manualWinner == 0) null else manualWinner,
                p1EffectiveScore = p1Score,
                p2EffectiveScore = p2Score,
                p1LivesRemaining = p1Lives,
                p2LivesRemaining = p2Lives,
                remainingSeconds = remaining,
                finished = true,
                winner = manualWinner,
                reason = "Manual Judge decision"
            )
        }

        if (config.mode == RaceMatchMode.SURVIVAL_1LIFE && p1.hasRamMapping) {
            val p1Lost = p1Lives <= 0 || p1.lives < max(1, p1BaselineLives - p1LifePenalty)
            val p2Lost = p2Lives <= 0 || p2.lives < max(1, p2BaselineLives - p2LifePenalty)
            if (p1Lost && p2Lost) {
                return RaceEvaluation(null, p1Score, p2Score, p1Lives, p2Lives, remaining, true, 0, "Double KO")
            }
            if (p1Lost) {
                return RaceEvaluation(2, p1Score, p2Score, p1Lives, p2Lives, remaining, true, 2, "P1 lost a life — P2 survives")
            }
            if (p2Lost) {
                return RaceEvaluation(1, p1Score, p2Score, p1Lives, p2Lives, remaining, true, 1, "P2 lost a life — P1 survives")
            }
        }

        if (config.mode == RaceMatchMode.FIRST_TO_STAGE && p1.hasRamMapping) {
            val p1Progress = (p1.world - 1) * 4 + p1.stage
            val p2Progress = (p2.world - 1) * 4 + p2.stage
            val p1Won = p1.flagpoleCleared || p1Progress >= config.targetStage
            val p2Won = p2.flagpoleCleared || p2Progress >= config.targetStage
            if (p1Won && p2Won) {
                val w = when {
                    p1Score > p2Score -> 1
                    p2Score > p1Score -> 2
                    else -> 0
                }
                return RaceEvaluation(if (w == 0) null else w, p1Score, p2Score, p1Lives, p2Lives, remaining, true, w, "Photo finish at Flagpole")
            }
            if (p1Won) {
                return RaceEvaluation(1, p1Score, p2Score, p1Lives, p2Lives, remaining, true, 1, "P1 reached Stage ${config.targetStage} first")
            }
            if (p2Won) {
                return RaceEvaluation(2, p1Score, p2Score, p1Lives, p2Lives, remaining, true, 2, "P2 reached Stage ${config.targetStage} first")
            }
            val stageLeader = when {
                p1Progress > p2Progress -> 1
                p2Progress > p1Progress -> 2
                p1Score > p2Score -> 1
                p2Score > p1Score -> 2
                else -> null
            }
            return RaceEvaluation(stageLeader, p1Score, p2Score, p1Lives, p2Lives, remaining, false, null, "First to Stage ${config.targetStage}")
        }

        if (config.targetScore > 0) {
            val p1Hit = p1Score >= config.targetScore
            val p2Hit = p2Score >= config.targetScore
            if (p1Hit || p2Hit) {
                val w = if (p1Hit && !p2Hit) 1 else if (p2Hit && !p1Hit) 2 else if (p1Score >= p2Score) 1 else 2
                return RaceEvaluation(w, p1Score, p2Score, p1Lives, p2Lives, remaining, true, w, "Target score ${config.targetScore} reached")
            }
        }

        val leader = when {
            p1Score > p2Score -> 1
            p2Score > p1Score -> 2
            p1.coins > p2.coins -> 1
            p2.coins > p1.coins -> 2
            else -> null
        }

        if (remaining <= 0.0) {
            return RaceEvaluation(
                leader = leader,
                p1EffectiveScore = p1Score,
                p2EffectiveScore = p2Score,
                p1LivesRemaining = p1Lives,
                p2LivesRemaining = p2Lives,
                remainingSeconds = 0.0,
                finished = true,
                winner = leader ?: 0,
                reason = if (leader == null) "Time Up — Draw" else "Time Up — Player $leader leads"
            )
        }

        return RaceEvaluation(
            leader = leader,
            p1EffectiveScore = p1Score,
            p2EffectiveScore = p2Score,
            p1LivesRemaining = p1Lives,
            p2LivesRemaining = p2Lives,
            remainingSeconds = remaining,
            finished = false,
            winner = null,
            reason = if (p1.hasRamMapping) "Live RAM Score Attack" else "Universal Timer Mode"
        )
    }
}

/**
 * Mystery / Chaos Modifier scheduler (random 10s twist every 30-45s).
 */
class ChaosModifierScheduler(private val rng: Random = Random.Default) {
    var enabled: Boolean = false
        private set
    var activeTwist: ChaosTwistType? = null
        private set
    private var twistEndsAtMs: Long = 0L
    private var nextTwistAtMs: Long = 0L

    fun configure(isEnabled: Boolean, nowMs: Long) {
        enabled = isEnabled
        activeTwist = null
        nextTwistAtMs = if (isEnabled) nowMs + rng.nextLong(30_000L, 45_001L) else 0L
    }

    fun tick(nowMs: Long): ChaosTwistType? {
        if (!enabled) return null
        if (activeTwist != null && nowMs >= twistEndsAtMs) {
            activeTwist = null
            nextTwistAtMs = nowMs + rng.nextLong(30_000L, 45_001L)
        }
        if (activeTwist == null && nowMs >= nextTwistAtMs) {
            val all = ChaosTwistType.entries
            activeTwist = all[rng.nextInt(all.size)]
            twistEndsAtMs = nowMs + 10_000L
            return activeTwist
        }
        return null
    }
}
